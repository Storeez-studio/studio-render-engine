import { fal } from '@fal-ai/client'
import { generateVideo } from './seedance-video'
import type { RenderConfig, RenderOutput } from '@studio-render/types'

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY })
}

export { generateVideo } from './seedance-video'
export type {
  SeedanceOptions,
  SeedanceResult,
  VideoAspectRatio,
  VideoResolution,
} from './seedance-video'

/** Map of video aspect ratios to output pixel dimensions */
const VIDEO_SIZE_MAP: Record<'16:9' | '9:16', [number, number]> = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
}

/** Build a cinematic motion prompt for Seedance-2 */
function buildVideoPrompt(config: RenderConfig): string {
  const motionStyles: Record<string, string> = {
    automotive: 'slow orbital camera pan around the vehicle, subtle depth of field, cinematic lens flare',
    apparel:    'gentle fabric movement, slow zoom revealing texture detail, studio lighting sweep',
    footwear:   'rotating hero shot, ground-level perspective, dramatic lighting transition',
    furniture:  'smooth dolly reveal from close detail to full product, warm ambient lighting',
  }
  const motion = motionStyles[config.renderPreset] ?? 'slow cinematic camera movement'

  const sceneMotion: Record<string, string> = {
    'studio-white':     'clean studio environment',
    'studio-dark':      'dramatic shadow play',
    'race-track-day':   'race circuit atmosphere with subtle heat haze',
    'race-track-night': 'night circuit with dynamic floodlight bloom',
    'city-night':       'neon reflections on wet surfaces',
    'golden-hour':      'golden light rays shifting across the product',
  }
  const scene = sceneMotion[config.scene] ?? config.scene

  return [
    'Cinematic product video,',
    motion + ',',
    scene + ',',
    'photorealistic, 8K quality, shallow depth of field,',
    'professional commercial production, smooth camera motion, no camera shake',
  ].join(' ')
}

/**
 * VideoGenerator — wraps Seedance-2 (bytedance/seedance-2.0/image-to-video) via FAL.
 *
 * Generates landscape (16:9) and/or portrait (9:16) video clips from a hero still image
 * produced by the Fast Tier render pipeline.
 */
export class VideoGenerator {
  constructor(private readonly falKey?: string) {
    const key = falKey ?? process.env.FAL_KEY
    if (key) fal.config({ credentials: key })
  }

  /**
   * Generate videos for all requested aspect ratios in parallel.
   */
  async generate(config: RenderConfig, heroImageUrl: string): Promise<RenderOutput[]> {
    const formats = config.outputFormats ?? ['16:9']
    const prompt = buildVideoPrompt(config)

    // Only generate video for landscape/portrait aspect ratios
    const videoFormats = formats.filter(
      (f): f is '16:9' | '9:16' => f === '16:9' || f === '9:16',
    )
    if (videoFormats.length === 0) videoFormats.push('16:9')

    const tasks = videoFormats.map(async (aspectRatio) => {
      const [w, h] = VIDEO_SIZE_MAP[aspectRatio]
      console.log(
        `[video] Generating ${aspectRatio} Seedance-2 video for job ${config.jobId}`,
      )
      const result = await generateVideo({
        imageUrl: heroImageUrl,
        prompt,
        aspectRatio,
        resolution: '1080p',
        duration: 5,
      })
      const out: RenderOutput = {
        format: aspectRatio,
        url: result.videoUrl,
        type: 'video',
        width: w,
        height: h,
      }
      return out
    })

    return Promise.all(tasks)
  }
}
