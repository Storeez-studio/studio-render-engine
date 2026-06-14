import { fal } from '@fal-ai/client'
import { FastRender } from '@studio-render/render-fast'
import { QualityRender } from '@studio-render/render-quality'
import { VideoGenerator } from '@studio-render/video'
import type { RenderConfig, RenderJob, RenderOutput } from '@studio-render/types'
import { v4 as uuid } from 'uuid'
import https from 'https'
import http from 'http'
import { URL } from 'url'

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY })
}

export type { RenderConfig, RenderJob, RenderOutput }

// ----------------------------------------------------------------
// In-memory job store (swap with Redis/Postgres in production)
// ----------------------------------------------------------------
const JOB_STORE = new Map<string, RenderJob>()

function saveJob(job: RenderJob): void {
  JOB_STORE.set(job.id, job)
}

function updateJob(id: string, patch: Partial<RenderJob>): RenderJob {
  const existing = JOB_STORE.get(id)
  if (!existing) throw new Error(`Job not found: ${id}`)
  const updated: RenderJob = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  JOB_STORE.set(id, updated)
  return updated
}

export function getJob(id: string): RenderJob | undefined {
  return JOB_STORE.get(id)
}

export function listJobs(): RenderJob[] {
  return Array.from(JOB_STORE.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

// ----------------------------------------------------------------
// Webhook delivery
// ----------------------------------------------------------------
async function deliverWebhook(webhookUrl: string, payload: RenderJob): Promise<void> {
  return new Promise((resolve) => {
    try {
      const body = JSON.stringify(payload)
      const parsed = new URL(webhookUrl)
      const lib = parsed.protocol === 'https:' ? https : http
      const req = lib.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || undefined,
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'X-Studio-Render-Event': payload.status,
            'X-Studio-Render-Job': payload.id,
          },
        },
        (res) => {
          console.log(`[orchestrator] Webhook ${webhookUrl}: HTTP ${res.statusCode}`)
          resolve()
        },
      )
      req.on('error', (e) => {
        console.warn(`[orchestrator] Webhook delivery failed: ${e.message}`)
        resolve()
      })
      req.setTimeout(10_000, () => {
        req.destroy()
        console.warn('[orchestrator] Webhook timed out')
        resolve()
      })
      req.write(body)
      req.end()
    } catch (e) {
      console.warn(`[orchestrator] Webhook error: ${(e as Error).message}`)
      resolve()
    }
  })
}

// ----------------------------------------------------------------
// Semaphore for concurrency control
// ----------------------------------------------------------------
class Semaphore {
  private count: number
  private readonly queue: Array<() => void> = []

  constructor(n: number) {
    this.count = n
  }

  async acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--
      return
    }
    return new Promise<void>((resolve) => this.queue.push(resolve))
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!
      next()
    } else {
      this.count++
    }
  }
}

// ----------------------------------------------------------------
// Orchestrator
// ----------------------------------------------------------------
export interface OrchestratorOptions {
  /** Max concurrent jobs (default 3) */
  concurrency?: number
  falKey?: string
}

export class Orchestrator {
  private readonly sem: Semaphore
  private readonly fastRender: FastRender
  private readonly qualityRender: QualityRender
  private readonly videoGen: VideoGenerator

  constructor(options: OrchestratorOptions = {}) {
    const key = options.falKey ?? process.env.FAL_KEY
    if (key) fal.config({ credentials: key })

    this.sem = new Semaphore(options.concurrency ?? 3)
    this.fastRender = new FastRender(key)
    this.qualityRender = new QualityRender()
    this.videoGen = new VideoGenerator(key)
  }

  /**
   * Submit a new render job. Returns immediately with status 'queued'.
   * Processing happens asynchronously in the background.
   */
  submit(config: RenderConfig): RenderJob {
    const jobId = config.jobId || uuid()
    const job: RenderJob = {
      id: jobId,
      status: 'queued',
      config: { ...config, jobId },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    saveJob(job)
    this.processAsync(job).catch((err) => {
      console.error(`[orchestrator] Uncaught error for job ${job.id}:`, err)
    })
    return job
  }

  private async processAsync(job: RenderJob): Promise<void> {
    await this.sem.acquire()
    try {
      updateJob(job.id, { status: 'processing' })
      console.log(
        `[orchestrator] Processing job ${job.id} (tier: ${job.config.tier}, ` +
        `scene: ${job.config.scene})`,
      )

      let outputs: RenderOutput[]

      if (job.config.tier === 'fast') {
        outputs = await this.runFastTier(job)
      } else {
        outputs = await this.runQualityTier(job)
      }

      const completed = updateJob(job.id, { status: 'complete', outputs })
      console.log(
        `[orchestrator] Job ${job.id} complete — ${outputs.length} output(s)`,
      )

      if (job.config.webhookUrl) {
        await deliverWebhook(job.config.webhookUrl, completed)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[orchestrator] Job ${job.id} failed: ${msg}`)
      const failed = updateJob(job.id, { status: 'failed', error: msg })
      if (job.config.webhookUrl) {
        await deliverWebhook(job.config.webhookUrl, failed).catch(() => {})
      }
    } finally {
      this.sem.release()
    }
  }

  /** Fast Tier: Three.js capture -> FLUX Kontext -> Seedance-2 video */
  private async runFastTier(job: RenderJob): Promise<RenderOutput[]> {
    console.log(`[orchestrator] [fast] Step 1/2: FastRender (FLUX)`)
    const imageOutputs = await this.fastRender.render(job.config)

    const heroImage = imageOutputs.find((o) => o.type === 'image')
    if (!heroImage) throw new Error('FastRender returned no image outputs')

    console.log(`[orchestrator] [fast] Step 2/2: VideoGenerator (Seedance-2)`)
    const videoOutputs = await this.videoGen.generate(job.config, heroImage.url)

    return [...imageOutputs, ...videoOutputs]
  }

  /** Quality Tier: Blender headless Cycles */
  private async runQualityTier(job: RenderJob): Promise<RenderOutput[]> {
    console.log(`[orchestrator] [quality] Running Blender headless Cycles render`)
    const result = await this.qualityRender.render(job.config)
    console.log(
      `[orchestrator] [quality] Blender complete in ${result.renderTimeMs}ms`,
    )
    return result.outputs
  }
}

// ----------------------------------------------------------------
// Singleton factory
// ----------------------------------------------------------------
let _instance: Orchestrator | null = null

export function getOrchestrator(options?: OrchestratorOptions): Orchestrator {
  if (!_instance) _instance = new Orchestrator(options)
  return _instance
}
