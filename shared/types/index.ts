export interface RenderConfig {
  jobId: string
  tier: 'fast' | 'quality'
  baseModel: {
    glbUrl: string
    modelType: 'automotive' | 'apparel' | 'footwear' | 'furniture'
  }
  creative: {
    liveryPattern?: { id: string; uvScale: number; uvOffset: [number, number]; colorPrimary: string; colorSecondary: string }
    decals?: Array<{ id: string; position: [number, number, number]; rotation: [number, number, number]; scale: number }>
    finish: 'matte' | 'gloss' | 'carbon' | 'fabric' | 'leather'
  }
  render: {
    scene: 'studio-white' | 'studio-dark' | 'race-track-day' | 'race-track-night' | 'city-night' | 'golden-hour'
    cameraAngles: Array<'front-34' | 'rear-34' | 'hero' | 'detail' | 'overhead'>
    outputFormats: Array<'square' | 'landscape' | 'portrait' | 'print'>
    resolution: '1080' | '2k' | '4k'
  }
  campaign?: {
    name: string
    brand: string
    webhookUrl?: string
  }
}

export interface RenderJob {
  id: string
  config: RenderConfig
  status: 'queued' | 'processing' | 'complete' | 'failed'
  createdAt: string
  completedAt?: string
  outputs?: RenderOutput[]
  error?: string
}

export interface RenderOutput {
  angle: string
  format: string
  url: string
  width: number
  height: number
}
