import puppeteer, { Browser } from 'puppeteer'
import type { RenderConfig } from '@studio-render/types'
import { SCENE_PRESETS } from '@studio-render/config'

export interface CaptureOptions {
  /** URL or file:// path to the GLB model */
  glbUrl: string
  /** Viewport width in pixels */
  width?: number
  /** Viewport height in pixels */
  height?: number
  /** Named camera position */
  cameraAngle?: 'front-34' | 'rear-34' | 'hero' | 'detail' | 'overhead'
  /** CSS colour for background (overridden by scene preset) */
  backgroundColor?: string
  /** Scene preset key — sets background colour hints */
  sceneKey?: string
  /** Max ms to wait for GLTF load and first render */
  timeout?: number
  /** Super-sample anti-aliasing scale (1 = off, 2 = 4x SSAA) */
  ssaaScale?: number
}

export interface CaptureResult {
  imageBuffer: Buffer
  width: number
  height: number
  angle: string
}

const CAMERA_POSITIONS: Record<string, [number, number, number]> = {
  hero:       [0,    2,    8],
  'front-34': [-5,   2,    6],
  'rear-34':  [5,    2,   -6],
  detail:     [-2,   1,    3],
  overhead:   [0,   10,  0.1],
}

const FORMAT_SIZES: Record<string, [number, number]> = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1':  [1080, 1080],
  '4:3':  [1440, 1080],
}

/**
 * Capture a screenshot of a GLB model using headless Chromium + Three.js.
 * Returns a PNG Buffer suitable for upload or passing to the AI pipeline.
 */
export async function captureGLB(options: CaptureOptions): Promise<CaptureResult> {
  const {
    glbUrl,
    width = 1920,
    height = 1080,
    cameraAngle = 'hero',
    backgroundColor,
    sceneKey,
    timeout = 45_000,
    ssaaScale = 1,
  } = options

  const scene = sceneKey ? SCENE_PRESETS[sceneKey] : undefined
  const bg =
    backgroundColor ??
    (scene?.backgroundStyle === 'solid-dark' ? '#0a0a0a' : '#ffffff')

  const renderW = Math.round(width * ssaaScale)
  const renderH = Math.round(height * ssaaScale)
  const cameraPos = CAMERA_POSITIONS[cameraAngle] ?? CAMERA_POSITIONS.hero

  const html = buildViewerHtml(glbUrl, renderW, renderH, bg, cameraPos)

  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: renderW, height: renderH })
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.waitForFunction('window.__RENDER_DONE__ === true', { timeout })
    const screenshot = await page.screenshot({ type: 'png', fullPage: false })
    return {
      imageBuffer: screenshot as Buffer,
      width: renderW,
      height: renderH,
      angle: cameraAngle,
    }
  } finally {
    await browser.close()
  }
}

/**
 * Convenience: capture all camera angles + formats requested by a RenderConfig.
 */
export async function captureAllAngles(
  config: RenderConfig,
  formats?: Array<'16:9' | '9:16' | '1:1' | '4:3'>,
): Promise<CaptureResult[]> {
  const fmts = formats ?? config.outputFormats ?? ['16:9']
  const angles = (
    config._resolved?.cameraAngles ?? ['hero']
  ) as Array<'front-34' | 'rear-34' | 'hero' | 'detail' | 'overhead'>

  const results: CaptureResult[] = []
  for (const angle of angles) {
    for (const fmt of fmts) {
      const [w, h] = FORMAT_SIZES[fmt] ?? [1920, 1080]
      const result = await captureGLB({
        glbUrl: config.baseModel,
        width: w,
        height: h,
        cameraAngle: angle,
        sceneKey: config.scene,
        ssaaScale: 2,
      })
      results.push(result)
    }
  }
  return results
}

/** Build the Three.js viewer HTML page for headless rendering */
function buildViewerHtml(
  glbUrl: string,
  width: number,
  height: number,
  bg: string,
  cam: [number, number, number],
): string {
  const [cx, cy, cz] = cam
  const aspect = width / height
  const importmap = JSON.stringify({
    imports: {
      three: 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js',
      'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/',
    },
  })

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { overflow:hidden; background:${bg}; }
canvas { display:block; }
</style>
<script type="importmap">${importmap}</script>
</head>
<body>
<canvas id="c" width="${width}" height="${height}"></canvas>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(${width}, ${height});
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color('${bg}');

const camera = new THREE.PerspectiveCamera(45, ${aspect}, 0.01, 1000);
camera.position.set(${cx}, ${cy}, ${cz});
camera.lookAt(0, 0, 0);

// Three-point studio lighting rig
const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);
const key = new THREE.DirectionalLight(0xffffff, 2.5);
key.position.set(5, 10, 5);
key.castShadow = true;
scene.add(key);
const fill = new THREE.DirectionalLight(0xaaccff, 1.0);
fill.position.set(-5, 3, 5);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 1.8);
rim.position.set(0, 5, -8);
scene.add(rim);

// Shadow-receiving ground plane
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.ShadowMaterial({ opacity: 0.3 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function doRender() {
  renderer.render(scene, camera);
  window.__RENDER_DONE__ = true;
}

new GLTFLoader().load(
  '${glbUrl}',
  (gltf) => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = 4 / Math.max(maxDim, 0.001);
    gltf.scene.position.sub(center.multiplyScalar(scaleFactor));
    gltf.scene.scale.setScalar(scaleFactor);
    gltf.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).castShadow = true;
        (obj as THREE.Mesh).receiveShadow = true;
      }
    });
    scene.add(gltf.scene);
    doRender();
  },
  undefined,
  (err) => {
    console.error('GLTFLoader error:', err);
    doRender(); // render fallback so the page does not hang
  }
);
</script>
</body>
</html>`
}
