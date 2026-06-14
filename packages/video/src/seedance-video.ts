import { fal } from '@fal-ai/client'

/** Seedance-2 image-to-video model on FAL */
const SEEDANCE_MODEL = 'bytedance/seedance-2.0/image-to-video'

export type VideoAspectRatio = '16:9' | '9:16'
export type VideoResolution = '480p' | '720p' | '1080p'

export interface SeedanceOptions {
  /** FAL CDN URL of the source still image */
  imageUrl: string
  /** Motion and scene prompt */
  prompt: string
  /** Output aspect ratio — landscape or portrait */
  aspectRatio?: VideoAspectRatio
  /** Output resolution */
  resolution?: VideoResolution
  /** Duration in seconds — Seedance 2 supports 5s clips */
  duration?: 5
  seed?: number
}

export interface SeedanceResult {
  videoUrl: string
  seed?: number
  durationSeconds: number
}

/**
 * Generate a cinematic video clip from a still image using Seedance-2.
 *
 * Uses bytedance/seedance-2.0/image-to-video via FAL subscribe (long poll).
 */
export async function generateVideo(options: SeedanceOptions): Promise<SeedanceResult> {
  const {
    imageUrl,
    prompt,
    aspectRatio = '16:9',
    resolution = '1080p',
    duration = 5,
    seed,
  } = options

  const input: Record<string, unknown> = {
    image_url: imageUrl,
    prompt,
    resolution,
    aspect_ratio: aspectRatio,
    duration,
  }
  if (seed !== undefined) input.seed = seed

  console.log(
    `[seedance-2] Generating ${aspectRatio} ${resolution} video (${duration}s)...`,
  )

  const result = await fal.subscribe(SEEDANCE_MODEL, {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS') {
        const msg = (update as any).logs?.slice(-1)[0]?.message
        if (msg) console.log('[seedance-2]', msg)
      }
    },
  })

  const data = (result as any).data
  const videoUrl = data?.video?.url
  if (!videoUrl) throw new Error('Seedance-2 returned no video URL')

  return { videoUrl, seed: data.seed, durationSeconds: duration }
}
