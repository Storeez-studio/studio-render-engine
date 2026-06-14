import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { join, resolve as resolvePath } from 'path'
import type { RenderConfig, RenderOutput } from '@studio-render/types'

const execFileAsync = promisify(execFile)

export interface QualityRenderOptions {
  config: RenderConfig
  outputDir?: string
  blenderPath?: string
  /** Cycles samples — 256 for quality, lower for previews */
  samples?: number
  useGpu?: boolean
}

export interface QualityRenderResult {
  outputs: RenderOutput[]
  logOutput: string
  renderTimeMs: number
}

const RESOLUTION_MAP: Record<string, { x: number; y: number }> = {
  '1080p': { x: 1920,  y: 1080 },
  '2k':    { x: 2560,  y: 1440 },
  '4k':    { x: 3840,  y: 2160 },
}

const ANGLE_ROTATIONS: Record<string, [number, number, number]> = {
  hero:       [1.1,  0.0,  0.0],
  'front-34': [1.1,  0.0,  0.7],
  'rear-34':  [1.1,  0.0, -0.7],
  detail:     [0.9,  0.0,  0.5],
  overhead:   [0.0,  0.0,  0.0],
}

/**
 * QualityRender — the Quality Tier pipeline.
 *
 * Invokes Blender headless with render.py to produce Cycles-rendered
 * photorealistic outputs from any GLB model.
 *
 * render.py is co-located in the package root (packages/render-quality/render.py).
 */
export class QualityRender {
  private readonly blenderPath: string
  private readonly outputDir: string
  private readonly samples: number
  private readonly useGpu: boolean

  constructor(options: Partial<QualityRenderOptions> = {}) {
    this.blenderPath = options.blenderPath ?? process.env.BLENDER_PATH ?? '/usr/bin/blender'
    this.outputDir = options.outputDir ?? process.env.OUTPUT_DIR ?? '/tmp/renders'
    this.samples = options.samples ?? 256
    this.useGpu = options.useGpu ?? true
  }

  async render(config: RenderConfig): Promise<QualityRenderResult> {
    const jobOutputDir = join(this.outputDir, config.jobId)
    mkdirSync(jobOutputDir, { recursive: true })

    const blenderConfig = {
      ...config,
      _blender: {
        samples: this.samples,
        useGpu: this.useGpu,
        resolution: RESOLUTION_MAP['4k'],
        angleRotations: ANGLE_ROTATIONS,
      },
    }

    const configPath = join(jobOutputDir, 'render-config.json')
    writeFileSync(configPath, JSON.stringify(blenderConfig, null, 2))

    // render.py lives at packages/render-quality/render.py (one level above src/)
    const scriptPath = resolvePath(__dirname, '..', 'render.py')
    if (!existsSync(scriptPath)) {
      throw new Error(`Blender render script not found: ${scriptPath}`)
    }

    console.log(`[quality-render] Starting Blender: ${this.blenderPath}`)
    console.log(`[quality-render] Job: ${config.jobId}  output: ${jobOutputDir}`)

    const start = Date.now()
    const { stdout, stderr } = await execFileAsync(
      this.blenderPath,
      [
        '--background',
        '--python', scriptPath,
        '--',
        '--config', configPath,
        '--output', jobOutputDir,
      ],
      {
        timeout: 30 * 60 * 1000, // 30 min max
        maxBuffer: 50 * 1024 * 1024,
      },
    )
    const renderTimeMs = Date.now() - start

    const logOutput = [stdout, stderr].filter(Boolean).join('\n')

    const resultsPath = join(jobOutputDir, 'results.json')
    if (!existsSync(resultsPath)) {
      throw new Error(
        `Blender did not produce results.json. Log:\n${logOutput.slice(-2000)}`,
      )
    }

    const results: Array<{ angle: string; path: string; format?: string }> = JSON.parse(
      readFileSync(resultsPath, 'utf-8'),
    )

    const res = RESOLUTION_MAP['4k']
    const outputs: RenderOutput[] = results.map((r) => ({
      format: r.format ?? 'landscape',
      url: r.path,
      type: 'image' as const,
      width: res.x,
      height: res.y,
    }))

    return { outputs, logOutput, renderTimeMs }
  }
}
