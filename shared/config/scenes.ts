export interface ScenePreset {
  id: string
  name: string
  hdriPath?: string
  backgroundColor?: string
  lightIntensity: number
  lightColor: string
  ambientIntensity: number
  cameraFov: number
  cameraDistance: number
}

export const SCENE_PRESETS: Record<string, ScenePreset> = {
  'studio-white': {
    id: 'studio-white',
    name: 'Studio White',
    backgroundColor: '#ffffff',
    lightIntensity: 2.0,
    lightColor: '#ffffff',
    ambientIntensity: 0.8,
    cameraFov: 45,
    cameraDistance: 8,
  },
  'studio-dark': {
    id: 'studio-dark',
    name: 'Studio Dark',
    backgroundColor: '#0a0a0a',
    lightIntensity: 3.0,
    lightColor: '#aaccff',
    ambientIntensity: 0.2,
    cameraFov: 45,
    cameraDistance: 8,
  },
  'race-track-day': {
    id: 'race-track-day',
    name: 'Race Track Day',
    hdriPath: 'hdri/race-track-day.hdr',
    lightIntensity: 1.5,
    lightColor: '#fff5e0',
    ambientIntensity: 0.6,
    cameraFov: 50,
    cameraDistance: 10,
  },
  'race-track-night': {
    id: 'race-track-night',
    name: 'Race Track Night',
    hdriPath: 'hdri/race-track-night.hdr',
    lightIntensity: 4.0,
    lightColor: '#ff6600',
    ambientIntensity: 0.1,
    cameraFov: 50,
    cameraDistance: 10,
  },
  'city-night': {
    id: 'city-night',
    name: 'City Night',
    hdriPath: 'hdri/city-night.hdr',
    lightIntensity: 2.5,
    lightColor: '#cc88ff',
    ambientIntensity: 0.15,
    cameraFov: 55,
    cameraDistance: 9,
  },
  'golden-hour': {
    id: 'golden-hour',
    name: 'Golden Hour',
    hdriPath: 'hdri/golden-hour.hdr',
    lightIntensity: 1.8,
    lightColor: '#ffaa44',
    ambientIntensity: 0.5,
    cameraFov: 48,
    cameraDistance: 9,
  },
}
