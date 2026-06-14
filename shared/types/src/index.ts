export interface RenderConfig {
  jobId: string
  tier: 'fast' | 'quality'
  /** URL or file:// path to GLB model */
  baseModel: string
  /** Baked livery texture PNG — URL or local path */
  liveryTexture?: string
  decals?: DecalPlacement[]
  finish?: 'matte' | 'gloss' | 'carbon' | 'fabric' | 'leather'
  renderPreset: 'automotive' | 'apparel' | 'footwear' | 'furniture'
  /** Scene preset key — e.g. 'studio-white', 'golden-hour' */
  scene: string
  outputFormats?: ('16:9' | '9:16' | '1:1' | '4:3')[]
  webhookUrl?: string
  /** Resolved at job submission time by the API */
  _resolved?: {
    cameraAngles: string[]
    resolution: string
  }
}

export interface DecalPlacement {
  id: string
  imageUrl: string
  position: { u: number; v: number }
  rotation: number
  scale: number
}

export interface RenderJob {
  id: string
  status: 'queued' | 'processing' | 'complete' | 'failed'
  config: RenderConfig
  outputs?: RenderOutput[]
  error?: string
  createdAt: string
  updatedAt: string
}

export interface RenderOutput {
  format: string
  url: string
  type: 'image' | 'video'
  width: number
  height: number
}

export interface ScenePreset {
  key: string
  name: string
  description: string
  renderPresets: string[]
  hdri?: string
  lightingRig: string
  cameraAngles: string[]
  backgroundStyle: string
}
