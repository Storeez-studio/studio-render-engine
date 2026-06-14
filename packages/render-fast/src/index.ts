import { fal } from '@fal-ai/client'
import { captureGLB } from '@studio-render/capture'
import { generateBase, enhanceWithKontext, buildRenderPrompt } from './flux'
import type { RenderConfig, RenderOutput } from '@studio-render/types'

// Configure FAL client on module load
if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY })
}

export { generateBase, enhanceWithKontext, buildRenderPrompt } from './flux'
export type { FluxGenerateOptions, FluxResult } from './flux'

const FORMAT_SIZES: Record<string, [number, number]> = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1':  [1080, 1080],
  '4:3':  [1440, 1080],
}

/**
 * FastRender — the Fast Tier pipeline:
 *
 * 1. Three.js headless screenshot via @studio-render/capture (with SSAA)
 * 2. Upload screenshot to FAL storage
 * 3. FLUX Kontext enhancement (fal-ai/flux-pro/v1/kontext) — photorealistic output
 * 4. Fallback: pure FLUX dev generation if screenshot capture fails
 *
 * Returns an array of RenderOutput CDN URLs.
 */
export class FastRender {
  constructor(private readonly falKey?: string) {
    const key = falKey ?? process.env.FAL_KEY
    if (key) fal.config({ credentials: key })
  }

  async render(config: RenderConfig): Promise<RenderOutput[]> {
    const formats = config.outputFormats ?? ['16:9']
    const [primaryW, primaryH] = FORMAT_SIZES[formats[0]] ?? [1920, 1080]
    const prompt = buildRenderPrompt(config)
    const outputs: RenderOutput[] = []

    let heroImageUrl: string

    try {
      // Step 1: Three.js headless screenshot
      console.log(`[fast-render] Capturing GLB: ${config.baseModel}`)
      const capture = await captureGLB({
        glbUrl: config.baseModel,
        width: primaryW,
        height: primaryH,
        cameraAngle: 'hero',
        sceneKey: config.scene,
        ssaaScale: 2,
      })

      // Step 2: Upload PNG buffer to FAL storage
      const blob = new Blob([capture.imageBuffer], { type: 'image/png' })
      const uploadedUrl = await fal.storage.upload(blob)
      console.log(`[fast-render] Screenshot uploaded to FAL storage: ${uploadedUrl}`)

      // Step 3: FLUX Kontext enhancement using the screenshot as visual reference
      const kontextResult = await enhanceWithKontext(uploadedUrl, prompt)
      heroImageUrl = kontextResult.imageUrl
      console.log(`[fast-render] FLUX Kontext complete: ${heroImageUrl}`)
    } catch (captureErr) {
      // Fallback: pure text-to-image with FLUX dev
      console.warn(
        `[fast-render] Screenshot capture failed (${(captureErr as Error).message}), ` +
        'falling back to FLUX dev text-to-image',
      )
      const [w, h] = FORMAT_SIZES[formats[0]] ?? [1920, 1080]
      const baseResult = await generateBase({ prompt, width: w, height: h })
      heroImageUrl = baseResult.imageUrl
      console.log(`[fast-render] FLUX dev generation complete: ${heroImageUrl}`)
    }

    // Primary format output
    const [w0, h0] = FORMAT_SIZES[formats[0]] ?? [1920, 1080]
    outputs.push({ format: formats[0], url: heroImageUrl, type: 'image', width: w0, height: h0 })

    // Additional formats: re-enhance with FLUX Kontext for each aspect ratio
    for (const fmt of formats.slice(1)) {
      const [fw, fh] = FORMAT_SIZES[fmt] ?? [1920, 1080]
      const reframePrompt = `${prompt}, reframed for ${fmt} aspect ratio`
      const fmtResult = await enhanceWithKontext(heroImageUrl, reframePrompt)
      outputs.push({ format: fmt, url: fmtResult.imageUrl, type: 'image', width: fw, height: fh })
    }

    return outputs
  }
}
