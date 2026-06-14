import * as fal from '@fal-ai/client'

fal.config({ credentials: process.env.FAL_KEY })

export async function enhanceWithFlux(imageUrl: string, prompt: string): Promise<string> {
  const result = await fal.subscribe('fal-ai/flux-kontext/dev', {
    input: {
      prompt,
      image_url: imageUrl,
      num_inference_steps: 28,
      guidance_scale: 3.5,
    },
  })
  return (result as any).data.images[0].url
}

export async function generateBase(prompt: string): Promise<string> {
  const result = await fal.subscribe('fal-ai/flux/dev', {
    input: {
      prompt,
      image_size: 'landscape_16_9',
      num_inference_steps: 28,
      num_images: 1,
    },
  })
  return (result as any).data.images[0].url
}
