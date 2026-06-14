/**
 * blender.ts -- WSL->Windows Blender 4.4 headless render orchestrator
 *
 * This module is the authoritative entrypoint for Quality-Tier renders.
 * It:
 *   1. Accepts a RenderConfig with WSL paths
 *   2. Translates paths to Windows format (Blender is a Windows process)
 *   3. Writes a temp JSON config to the Windows %TEMP% dir
 *   4. Shells out to blender.exe --background --python render.py
 *   5. Polls for output files (with 10-minute timeout)
 *   6. Cleans up temp files
 *   7. Returns array of WSL-format output file paths
 */

import { spawn } from 'child_process'
import { writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs'
import { join, resolve as resolvePath, basename } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import type { RenderConfig } from '@studio-render/types'
import { wslToWindows, windowsToWsl, getBlenderPath, prepareJobPaths } from './path-utils.js'

export interface BlenderRenderConfig {
  /** WSL path to the GLB model file */
  glbPath: string
  /** WSL path to baked livery PNG (optional) */
  liveryTexturePath?: string
  /** Scene preset key */
  scenePreset: 'studio-white' | 'studio-dark' | 'race-track-day' | 'race-track-night' | 'city-night' | 'golden-hour'
  /** Camera angles to render */
  cameraAngles: Array<'front-34' | 'rear-34' | 'hero' | 'detail'>
  /** WSL path for output directory */
  outputDir: string
  /** Render quality -- affects Cycles sample count */
  quality: 'preview' | 'final'
  /** Job ID used to prefix output file names */
  jobId: string
  /** Decal configs (optional) */
  decals?: Array<{
    id: string
    imageUrl: string
    position: { u: number; v: number }
    rotation: number
    scale: number
  }>
}

export interface BlenderRenderResult {
  /** WSL-format paths to all rendered output files */
  outputPaths: string[]
  /** Combined stdout + stderr from blender process */
  logOutput: string
  /** Total wall-clock time in milliseconds */
  renderTimeMs: number
}

/** Cycles sample counts per quality level */
const QUALITY_SAMPLES: Record<string, number> = {
  preview: 128,
  final: 512,
}

/** Max render time: 10 minutes */
const RENDER_TIMEOUT_MS = 10 * 60 * 1000

/**
 * Run a headless Blender render from WSL, targeting Windows Blender 4.4.
 *
 * The exact CLI invoked (WSL-format paths shown, Blender receives Windows paths):
 *
 *   "/mnt/c/Program Files/Blender Foundation/Blender 4.4/blender.exe" \
 *     --background \
 *     --python render.py \
 *     -- \
 *     --config "C:\Users\...\AppData\Local\Temp\studio-render-<uuid>.json"
 *
 * render.py reads the JSON config (Windows paths) and writes results.json
 * to the output dir when complete.
 */
export async function runBlenderRender(
  config: BlenderRenderConfig,
): Promise<BlenderRenderResult> {
  const samples = QUALITY_SAMPLES[config.quality] ?? 256
  const blenderPath = getBlenderPath()

  // Ensure WSL output dir exists before translating paths
  mkdirSync(config.outputDir, { recursive: true })

  // Write temp config JSON to Windows TEMP dir so Blender can read it.
  // tmpdir() in WSL returns /tmp which is WSL-only; use the Windows TEMP via /mnt/c/Users/...
  // Fall back to the job output dir if WINDOWS_TEMP is not set.
  const winTempBase =
    process.env.WINDOWS_TEMP ??
    '/mnt/c/Windows/Temp'
  const tempConfigName = `studio-render-${randomUUID()}.json`
  const tempConfigPathWsl = join(winTempBase, tempConfigName)

  // Build the render.py script path (co-located in package root)
  const scriptPathWsl = resolvePath(__dirname, '..', 'render.py')
  if (!existsSync(scriptPathWsl)) {
    throw new Error(
      `render.py not found at ${scriptPathWsl}. ` +
      `Ensure render.py is in packages/render-quality/ (one level above src/).`,
    )
  }

  // Translate all paths to Windows format for the config JSON
  const winPaths = prepareJobPaths({
    glbPath: config.glbPath,
    liveryTexturePath: config.liveryTexturePath,
    outputDir: config.outputDir,
    configPath: tempConfigPathWsl,
  })

  const blenderConfig = {
    jobId: config.jobId,
    glbPath: winPaths.glbPath,
    liveryTexturePath: winPaths.liveryTexturePath ?? null,
    scenePreset: config.scenePreset,
    cameraAngles: config.cameraAngles,
    outputDir: winPaths.outputDir,
    quality: config.quality,
    decals: config.decals ?? [],
    _blender: {
      samples,
      useGpu: true,
      resolution4k: { x: 3840, y: 2160 },
      resolution1080p: { x: 1920, y: 1080 },
    },
  }

  // Write config to Windows-accessible temp path
  writeFileSync(tempConfigPathWsl, JSON.stringify(blenderConfig, null, 2), 'utf-8')

  const scriptPathWindows = wslToWindows(scriptPathWsl)
  const tempConfigPathWindows = wslToWindows(tempConfigPathWsl)

  console.log(`[blender] Job ${config.jobId} -- starting render`)
  console.log(`[blender] Scene: ${config.scenePreset}  Angles: ${config.cameraAngles.join(', ')}`)
  console.log(`[blender] Samples: ${samples}  GLB: ${winPaths.glbPath}`)
  console.log(`[blender] Output: ${winPaths.outputDir}`)
  console.log(
    `[blender] CMD: "${blenderPath}" --background --python "${scriptPathWindows}" -- --config "${tempConfigPathWindows}"`,
  )

  const start = Date.now()
  const logOutput = await spawnBlender(blenderPath, scriptPathWindows, tempConfigPathWindows)
  const renderTimeMs = Date.now() - start

  // Clean up temp config
  try {
    unlinkSync(tempConfigPathWsl)
  } catch {
    // Non-fatal
  }

  // Collect output files written by render.py
  const outputPaths = collectOutputFiles(config.outputDir, config.jobId)

  console.log(
    `[blender] Job ${config.jobId} complete in ${(renderTimeMs / 1000).toFixed(1)}s -- ${outputPaths.length} files`,
  )

  return { outputPaths, logOutput, renderTimeMs }
}

/**
 * Spawn blender.exe and stream its output, enforcing a 10-minute timeout.
 * Returns combined stdout+stderr as a string.
 */
function spawnBlender(
  blenderPath: string,
  scriptPath: string,
  configPath: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '--background',
      '--python', scriptPath,
      '--',
      '--config', configPath,
    ]

    const proc = spawn(blenderPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      // Run as a Windows process -- do not set shell:true which would use bash
      windowsHide: true,
    })

    const chunks: Buffer[] = []

    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      process.stdout.write(`[blender:stdout] ${chunk.toString()}`)
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      process.stderr.write(`[blender:stderr] ${chunk.toString()}`)
    })

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`Blender render timed out after ${RENDER_TIMEOUT_MS / 60000} minutes`))
    }, RENDER_TIMEOUT_MS)

    proc.on('close', (code) => {
      clearTimeout(timeout)
      const output = Buffer.concat(chunks).toString('utf-8')
      if (code !== 0) {
        reject(
          new Error(
            `Blender exited with code ${code}. Last 2000 chars of output:\n${output.slice(-2000)}`,
          ),
        )
      } else {
        resolve(output)
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      reject(
        new Error(
          `Failed to spawn Blender at "${blenderPath}": ${err.message}\n` +
          `Ensure Blender 4.4 is installed at C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe`,
        ),
      )
    })
  })
}

/**
 * Scan the output directory for render files matching this job's naming pattern.
 * render.py names files: {jobId}_{cameraAngle}_{resolution}.{ext}
 * Returns WSL-format paths.
 */
function collectOutputFiles(outputDir: string, jobId: string): string[] {
  try {
    const files = readdirSync(outputDir)
    return files
      .filter((f) => {
        const lower = f.toLowerCase()
        return (
          f.startsWith(jobId) &&
          (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
        )
      })
      .map((f) => join(outputDir, f))
  } catch {
    return []
  }
}

/**
 * Convenience wrapper that accepts the canonical RenderConfig from @studio-render/types
 * and maps it to the BlenderRenderConfig shape expected by runBlenderRender().
 */
export async function renderFromConfig(
  config: RenderConfig,
  outputDir: string,
): Promise<BlenderRenderResult> {
  const blenderConfig: BlenderRenderConfig = {
    jobId: config.jobId,
    glbPath: config.baseModel,
    liveryTexturePath: config.liveryTexture,
    scenePreset: (config.scene as BlenderRenderConfig['scenePreset']) ?? 'studio-white',
    cameraAngles: (config._resolved?.cameraAngles as BlenderRenderConfig['cameraAngles']) ?? ['hero'],
    outputDir,
    quality: config.tier === 'fast' ? 'preview' : 'final',
    decals: config.decals?.map((d) => ({
      id: d.id,
      imageUrl: d.imageUrl,
      position: d.position,
      rotation: d.rotation,
      scale: d.scale,
    })),
  }
  return runBlenderRender(blenderConfig)
}
