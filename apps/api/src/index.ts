import 'dotenv/config'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import { v4 as uuid } from 'uuid'
import { getOrchestrator, getJob, listJobs } from '@studio-render/orchestrator'
import { SCENE_PRESETS, listScenePresets } from '@studio-render/config'
import type { RenderConfig } from '@studio-render/types'

const app = express()
const PORT = parseInt(process.env.PORT ?? '3000', 10)

// ----------------------------------------------------------------
// Middleware
// ----------------------------------------------------------------
app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`)
  next()
})

// ----------------------------------------------------------------
// Orchestrator
// ----------------------------------------------------------------
const orchestrator = getOrchestrator({ concurrency: 3 })

// ----------------------------------------------------------------
// Routes
// ----------------------------------------------------------------

/**
 * GET /health
 * Liveness check — returns 200 with service info.
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'studio-render-engine',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    env: {
      falKeySet: !!process.env.FAL_KEY,
      blenderPath: process.env.BLENDER_PATH ?? '/usr/bin/blender',
      outputDir: process.env.OUTPUT_DIR ?? '/tmp/renders',
    },
  })
})

/**
 * GET /scenes
 * List all 6 scene presets.
 */
app.get('/scenes', (_req: Request, res: Response) => {
  res.json({ scenes: listScenePresets() })
})

/**
 * POST /render
 * Submit a new render job.
 *
 * Body (RenderConfig minus jobId):
 *   tier          "fast" | "quality"
 *   baseModel     GLB URL or local path
 *   scene         scene preset key
 *   renderPreset  "automotive" | "apparel" | "footwear" | "furniture"
 *   finish?       "matte" | "gloss" | "carbon" | "fabric" | "leather"
 *   outputFormats? ["16:9", "9:16", ...]
 *   liveryTexture? PNG URL or path
 *   decals?       DecalPlacement[]
 *   webhookUrl?   URL to POST completion payload to
 *
 * Returns: { jobId: string, status: "queued" }
 */
app.post('/render', (req: Request, res: Response) => {
  const body = req.body as Partial<RenderConfig>

  if (!body.tier || !['fast', 'quality'].includes(body.tier)) {
    return res.status(400).json({ error: 'tier must be "fast" or "quality"' })
  }
  if (!body.baseModel || typeof body.baseModel !== 'string') {
    return res.status(400).json({ error: 'baseModel (GLB URL or path) is required' })
  }
  if (!body.scene || typeof body.scene !== 'string') {
    return res.status(400).json({ error: 'scene preset key is required' })
  }
  if (!SCENE_PRESETS[body.scene]) {
    return res.status(400).json({
      error: `Unknown scene: "${body.scene}"`,
      validScenes: Object.keys(SCENE_PRESETS),
    })
  }
  const validPresets = ['automotive', 'apparel', 'footwear', 'furniture']
  if (!body.renderPreset || !validPresets.includes(body.renderPreset)) {
    return res.status(400).json({
      error: `renderPreset must be one of: ${validPresets.join(', ')}`,
    })
  }

  const scenePreset = SCENE_PRESETS[body.scene]
  const config: RenderConfig = {
    tier: body.tier,
    baseModel: body.baseModel,
    liveryTexture: body.liveryTexture,
    decals: body.decals,
    finish: body.finish ?? 'gloss',
    renderPreset: body.renderPreset,
    scene: body.scene,
    outputFormats: body.outputFormats ?? ['16:9'],
    webhookUrl: body.webhookUrl,
    jobId: uuid(),
    _resolved: {
      cameraAngles: scenePreset.cameraAngles,
      resolution: '4k',
    },
  }

  const job = orchestrator.submit(config)
  console.log(`[api] Job submitted: ${job.id} (tier: ${config.tier}, scene: ${config.scene})`)
  return res.status(202).json({ jobId: job.id, status: 'queued' })
})

/**
 * GET /jobs/:id
 * Poll job status + outputs.
 */
app.get('/jobs/:id', (req: Request, res: Response) => {
  const job = getJob(req.params.id)
  if (!job) {
    return res.status(404).json({ error: 'Job not found', jobId: req.params.id })
  }
  return res.json(job)
})

/**
 * GET /jobs
 * List all jobs, newest first.
 */
app.get('/jobs', (_req: Request, res: Response) => {
  const jobs = listJobs()
  return res.json({ jobs, total: jobs.length })
})

/**
 * POST /webhook
 * Test endpoint — echoes the incoming webhook payload.
 * Useful for local development with webhookUrl: "http://localhost:3000/webhook".
 */
app.post('/webhook', (req: Request, res: Response) => {
  const event = req.headers['x-studio-render-event'] ?? 'unknown'
  const jobId = req.headers['x-studio-render-job'] ?? 'unknown'
  console.log(`[api] Webhook received: event=${event} jobId=${jobId}`)
  return res.json({ received: true, event, jobId, body: req.body })
})

// ----------------------------------------------------------------
// Error handler
// ----------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error', message: err.message })
})

// ----------------------------------------------------------------
// Start
// ----------------------------------------------------------------
app.listen(PORT, () => {
  console.log('')
  console.log('  Gravitaslabs Studio Engine API')
  console.log(`  Listening on http://localhost:${PORT}`)
  console.log(`  FAL key: ${process.env.FAL_KEY ? '[set]' : 'NOT SET'}`)
  console.log(`  Blender: ${process.env.BLENDER_PATH ?? '/usr/bin/blender'}`)
  console.log(`  Output:  ${process.env.OUTPUT_DIR ?? '/tmp/renders'}`)
  console.log('')
})

export default app
