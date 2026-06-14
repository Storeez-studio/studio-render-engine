import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { RenderConfig, RenderOutput } from '../../../shared/types'

const execFileAsync = promisify(execFile)

export interface BlenderRenderOptions {
  config: RenderConfig
  outputDir: string
  blenderPath?: string
}

export interface BlenderRenderResult {
  outputs: RenderOutput[]
  logOutput: string
}

const RESOLUTION_MAP: Record<string, { x: number; y: number }> = {
  '1080': { x: 1920, y: 1080 },
  '2k': { x: 2560, y: 1440 },
  '4k': { x: 3840, y: 2160 },
}

/**
 * Invoke Blender headless with the render.py script to produce quality renders.
 */
export async function renderWithBlender(options: BlenderRenderOptions): Promise<BlenderRenderResult> {
  const { config, outputDir, blenderPath = process.env.BLENDER_PATH ?? '/usr/bin/blender' } = options

  mkdirSync(outputDir, { recursive: true })

  const configPath = join(outputDir, 'render-config.json')
  writeFileSync(configPath, JSON.stringify(config, null, 2))

  const scriptPath = join(__dirname, '..', 'scripts', 'render.py')

  const { stdout, stderr } = await execFileAsync(blenderPath, [
    '--background',
    '--python', scriptPath,
    '--',
    '--config', configPath,
    '--output', outputDir,
  ])

  const logOutput = [stdout, stderr].filter(Boolean).join('\n')

  const resultsPath = join(outputDir, 'results.json')
  const results: Array<{ angle: string; path: string }> = JSON.parse(
    readFileSync(resultsPath, 'utf-8'),
  )

  const resolution = RESOLUTION_MAP[config.render.resolution] ?? RESOLUTION_MAP['2k']

  const outputs: RenderOutput[] = results.map((r) => ({
    angle: r.angle,
    format: 'landscape',
    url: r.path,
    width: resolution.x,
    height: resolution.y,
  }))

  return { outputs, logOutput }
}
