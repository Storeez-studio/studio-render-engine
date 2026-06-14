/**
 * test-render.ts -- Integration test for the WSL->Windows Blender render pipeline
 *
 * Usage:
 *   npx tsx packages/render-quality/test/test-render.ts
 *
 * What it does:
 *   1. Checks Blender is accessible at the expected WSL path
 *   2. Creates a minimal test GLB (unit cube) in Windows TEMP
 *   3. Runs a studio-white render with preview quality (128 samples, hero only)
 *   4. Reports success/failure and output file paths
 *   5. Cleans up temp files
 */

import { runBlenderRender } from '../src/blender.js'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

async function main() {
  const jobId = 'test-' + randomUUID().slice(0, 8)
  const testDir = '/mnt/c/Windows/Temp/studio-render-test-' + jobId
  const outputDir = testDir + '/output'

async function main() {
  const jobId = "test-" + randomUUID().slice(0, 8)
  const testDir = "/mnt/c/Windows/Temp/studio-render-test-" + jobId
  const outputDir = testDir + "/output"

  console.log("============================================================")
  console.log("Studio Render Engine -- Blender Pipeline Test")
  console.log("Job ID:     " + jobId)
  console.log("Output dir: " + outputDir)
  console.log("============================================================")

  const blenderWsl = process.env.BLENDER_PATH ??
    "/mnt/c/Program Files/Blender Foundation/Blender 4.4/blender.exe"

  if (!existsSync(blenderWsl)) {
    console.error("[test] FAIL: Blender not found at: " + blenderWsl)
    console.error("[test] Install Blender 4.4 on Windows and set BLENDER_PATH.")
    process.exit(1)
  }
  console.log("[test] Blender found OK")

  mkdirSync(testDir, { recursive: true })
  writeTestGlb(testDir)

  console.log("[test] Starting render (studio-white, hero, 128 samples)...")
  const startMs = Date.now()

  try {
    const result = await runBlenderRender({
      jobId,
      glbPath: testDir + "/test-cube.glb",
      scenePreset: "studio-white",
      cameraAngles: ["hero"],
      outputDir,
      quality: "preview",
    })

    const sec = ((Date.now() - startMs) / 1000).toFixed(1)
    console.log("[test] PASS -- completed in " + sec + "s")
    console.log("[test] " + result.outputPaths.length + " output file(s):")
    for (const p of result.outputPaths) {
      console.log("  " + (existsSync(p) ? "[OK]" : "[MISSING]") + " " + p)
    }
  } catch (err) {
    const sec = ((Date.now() - startMs) / 1000).toFixed(1)
    console.error("[test] FAIL -- after " + sec + "s")
    console.error((err as Error).message)
    process.exit(1)
  } finally {
    try { rmSync(testDir, { recursive: true, force: true }) } catch {}
  }
}

main().catch((err) => {
  console.error("[test] Unhandled:", err)
  process.exit(1)
})
