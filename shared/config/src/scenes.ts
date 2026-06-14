import type { ScenePreset } from '@studio-render/types'

export const SCENE_PRESETS: Record<string, ScenePreset> = {
  'studio-white': {
    key: 'studio-white',
    name: 'Studio White',
    description: 'Clean white infinity cove — product photography standard. Ideal for e-commerce, lookbooks, and brand assets.',
    renderPresets: ['automotive', 'apparel', 'footwear', 'furniture'],
    lightingRig: 'three-point-soft',
    cameraAngles: ['front-34', 'hero', 'detail', 'overhead'],
    backgroundStyle: 'solid-white',
  },
  'studio-dark': {
    key: 'studio-dark',
    name: 'Studio Dark',
    description: 'Dramatic dark studio with accent rim lighting — luxury and performance positioning.',
    renderPresets: ['automotive', 'footwear', 'furniture'],
    lightingRig: 'rim-dramatic',
    cameraAngles: ['front-34', 'rear-34', 'hero', 'detail'],
    backgroundStyle: 'solid-dark',
  },
  'race-track-day': {
    key: 'race-track-day',
    name: 'Race Track Day',
    description: 'Sunlit race circuit environment with tarmac reflection — motorsport and performance automotive.',
    renderPresets: ['automotive'],
    hdri: 'hdri/race-track-day.hdr',
    lightingRig: 'hdri-sun',
    cameraAngles: ['front-34', 'rear-34', 'hero', 'detail'],
    backgroundStyle: 'hdri-environment',
  },
  'race-track-night': {
    key: 'race-track-night',
    name: 'Race Track Night',
    description: 'Night circuit with floodlight glow and dramatic track reflections — premium motorsport campaigns.',
    renderPresets: ['automotive'],
    hdri: 'hdri/race-track-night.hdr',
    lightingRig: 'hdri-floodlights',
    cameraAngles: ['front-34', 'rear-34', 'hero'],
    backgroundStyle: 'hdri-environment',
  },
  'city-night': {
    key: 'city-night',
    name: 'City Night',
    description: 'Urban nightscape with neon bokeh and wet-road reflections — lifestyle and streetwear campaigns.',
    renderPresets: ['automotive', 'footwear', 'apparel'],
    hdri: 'hdri/city-night.hdr',
    lightingRig: 'neon-urban',
    cameraAngles: ['front-34', 'hero', 'detail'],
    backgroundStyle: 'hdri-environment',
  },
  'golden-hour': {
    key: 'golden-hour',
    name: 'Golden Hour',
    description: 'Warm sunset light with long shadows — aspirational lifestyle and heritage brand storytelling.',
    renderPresets: ['automotive', 'footwear', 'furniture', 'apparel'],
    hdri: 'hdri/golden-hour.hdr',
    lightingRig: 'hdri-golden',
    cameraAngles: ['front-34', 'rear-34', 'hero', 'detail'],
    backgroundStyle: 'hdri-environment',
  },
}

export function getScenePreset(key: string): ScenePreset {
  const preset = SCENE_PRESETS[key]
  if (!preset) {
    throw new Error(
      `Unknown scene preset: "${key}". Valid keys: ${Object.keys(SCENE_PRESETS).join(', ')}`,
    )
  }
  return preset
}

export function listScenePresets(): ScenePreset[] {
  return Object.values(SCENE_PRESETS)
}

export function getScenesForRenderPreset(renderPreset: string): ScenePreset[] {
  return Object.values(SCENE_PRESETS).filter((s) =>
    s.renderPresets.includes(renderPreset),
  )
}
