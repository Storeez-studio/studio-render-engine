import { fal } from '@fal-ai/client'
import type { RenderConfig } from '@studio-render/types'

/** FLUX dev — text-to-image */
const FLUX_DEV_MODEL = 'fal-ai/flux/dev'
/** FLUX Kontext — image+prompt-to-image (creative enhancement) */
const FLUX_KONTEXT_MODEL = 'fal-ai/flux-pro/v1/kontext'

export interface FluxGenerateOptions {
  prompt: string
  width?: number
  height?: number
  numInferenceSteps?: number
  guidanceScale?: number
  seed?: number
}

export interface FluxResult {
  imageUrl: string
  seed?: number
  timings?: Record<string, number>
}

/**
 * Generate a photorealistic base image using FLUX dev.
 * Used as fallback when Three.js screenshot capture is unavailable.
 */
export async function generateBase(options: FluxGenerateOptions): Promise<FluxResult> {
  const {
    prompt,
    width = 1920,
    height = 1080,
    numInferenceSteps = 28,
    guidanceScale = 3.5,
    seed,
  } = options

  const input: Record<string, unknown> = {
    prompt,
    image_size: { width, height },
    num_inference_steps: numInferenceSteps,
    guidance_scale: guidanceScale,
    num_images: 1,
    enable_safety_checker: false,
    output_format: 'jpeg',
  }
  if (seed !== undefined) input.seed = seed

  console.log('[flux/dev] Generating base image...')
  const result = await fal.subscribe(FLUX_DEV_MODEL, {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS') {
        const msg = (update as any).logs?.slice(-1)[0]?.message
        if (msg) console.log('[flux/dev]', msg)
      }
    },
  })

  const data = (result as any).data
  const image = data?.images?.[0]
  if (!image?.url) throw new Error('FLUX dev returned no image URL')

  return { imageUrl: image.url, seed: data.seed, timings: data.timings }
}

/**
 * Enhance an existing image using FLUX Kontext (fal-ai/flux-pro/v1/kontext).
 * Applies prompt-driven creative direction while preserving the input composition.
 */
export async function enhanceWithKontext(
  imageUrl: string,
  prompt: string,
  options: Partial<FluxGenerateOptions> = {},
): Promise<FluxResult> {
  const {
    numInferenceSteps = 28,
    guidanceScale = 3.5,
    seed,
  } = options

  const input: Record<string, unknown> = {
    prompt,
    image_url: imageUrl,
    num_inference_steps: numInferenceSteps,
    guidance_scale: guidanceScale,
    num_images: 1,
    output_format: 'jpeg',
  }
  if (seed !== undefined) input.seed = seed

  console.log('[flux-kontext] Enhancing image...')
  const result = await fal.subscribe(FLUX_KONTEXT_MODEL, {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS') {
        const msg = (update as any).logs?.slice(-1)[0]?.message
        if (msg) console.log('[flux-kontext]', msg)
      }
    },
  })

  const data = (result as any).data
  const image = data?.images?.[0]
  if (!image?.url) throw new Error('FLUX Kontext returned no image URL')

  return { imageUrl: image.url, seed: data.seed }
}

/**
 * Build a creative render prompt from a RenderConfig.
 */
export function buildRenderPrompt(config: RenderConfig): string {
  const finishLabel: Record<string, string> = {
    matte:   'matte finish with soft diffuse surface',
    gloss:   'high-gloss mirror-like finish',
    carbon:  'carbon fibre weave texture',
    fabric:  'premium woven fabric texture',
    leather: 'supple full-grain leather',
  }
  const finish = config.finish ? (finishLabel[config.finish] ?? config.finish) : 'premium gloss finish'

  const sceneLabels: Record<string, string> = {
    'studio-white':     'clean white studio infinity cove, soft box lighting',
    'studio-dark':      'dramatic dark studio, rim lighting, luxury atmosphere',
    'race-track-day':   'sunlit race circuit, tarmac reflections, motorsport setting',
    'race-track-night': 'floodlit night circuit, dramatic shadows, motorsport atmosphere',
    'city-night':       'urban nightscape, neon bokeh, wet road reflections',
    'golden-hour':      'golden hour sunset, warm long shadows, aspirational lifestyle',
  }
  const scene = sceneLabels[config.scene] ?? config.scene

  return [
    `Professional ${config.renderPreset} product photograph,`,
    `${finish},`,
    `${scene},`,
    'photorealistic, studio quality, sharp focus, commercial photography,',
    '8K resolution, hyperrealistic materials, dramatic lighting, award-winning product shot',
  ].join(' ')
}
