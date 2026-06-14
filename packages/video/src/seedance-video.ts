import * as fal from '@fal-ai/client'

fal.config({ credentials: process.env.FAL_KEY })

export type VideoFormat = 'landscape' | 'portrait'

export async function generateVideo(
  imageUrl: string,
  prompt: string,
  format: VideoFormat = 'landscape',
): Promise<string> {
  const resolution = format === 'portrait' ? '720p' : '1080p'
  const aspectRatio = format === 'portrait' ? '9:16' : '16:9'

  const result = await fal.subscribe('fal-ai/bytedance/seedance-2.0/image-to-video', {
    input: {
      image_url: imageUrl,
      prompt,
      resolution,
      aspect_ratio: aspectRatio,
      duration: 5,
    },
    logs: true,
  })
  return (result as any).data.video.url
}
