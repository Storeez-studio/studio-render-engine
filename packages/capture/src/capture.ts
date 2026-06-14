import puppeteer from 'puppeteer'

export interface CaptureOptions {
  glbUrl: string
  width: number
  height: number
  cameraAngle: 'front-34' | 'rear-34' | 'hero' | 'detail' | 'overhead'
  backgroundColor?: string
  timeout?: number
}

export interface CaptureResult {
  imageBuffer: Buffer
  width: number
  height: number
  angle: string
}

const CAMERA_POSITIONS: Record<string, [number, number, number]> = {
  hero: [0, 2, 8],
  'front-34': [-5, 2, 6],
  'rear-34': [5, 2, -6],
  detail: [-2, 1, 3],
  overhead: [0, 10, 0.1],
}

/**
 * Capture a screenshot of a GLB model using headless browser + Three.js.
 * Returns a PNG buffer ready to upload or pass to the AI enhancement pipeline.
 */
export async function captureGLB(options: CaptureOptions): Promise<CaptureResult> {
  const {
    glbUrl, width, height, cameraAngle,
    backgroundColor = '#ffffff',
    timeout = 30_000,
  } = options

  const cameraPos = CAMERA_POSITIONS[cameraAngle] ?? CAMERA_POSITIONS.hero
  const html = buildHtml(glbUrl, width, height, backgroundColor, cameraPos)

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width, height })
    await page.setContent(html)
    await page.waitForFunction('window.__RENDER_DONE__ === true', { timeout })
    const screenshot = await page.screenshot({ type: 'png', fullPage: false })
    return { imageBuffer: screenshot as Buffer, width, height, angle: cameraAngle }
  } finally {
    await browser.close()
  }
}

/** Build Three.js HTML page for headless GLB rendering */
function buildHtml(
  glbUrl: string,
  width: number,
  height: number,
  bg: string,
  cam: [number, number, number],
): string {
  const [cx, cy, cz] = cam
  const parts: string[] = []
  parts.push('<!DOCTYPE html><html><head><meta charset="utf-8">')
  parts.push('<style>body' + ob + 'margin:0;overflow:hidden;background:' + bg + cb + '</style>')
  const importmap = JSON.stringify({
    imports: {
      three: 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js',
      'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/',
    }
  })
  parts.push('<script type="importmap">' + importmap + '</' + 'script>')
  parts.push('</head><body>')
  parts.push('<canvas id="c" width="' + width + '" height="' + height + '"></canvas>')
  parts.push('<script type="module">')
  parts.push('import * as THREE from "three";')
  parts.push('import ' + ob + ' GLTFLoader ' + cb + ' from "three/addons/loaders/GLTFLoader.js";')
  parts.push('const canvas=document.getElementById("c");')
  parts.push('const renderer=new THREE.WebGLRenderer(' + ob + 'canvas,antialias:true' + cb + ');')
  parts.push('renderer.setSize(' + width + ',' + height + ');')
  parts.push('renderer.outputColorSpace=THREE.SRGBColorSpace;')
  parts.push('const scene=new THREE.Scene();')
  parts.push('scene.background=new THREE.Color("' + bg + '");')
  parts.push('const camera=new THREE.PerspectiveCamera(45,' + (width/height) + ',0.1,1000);')
  parts.push('camera.position.set(' + cx + ',' + cy + ',' + cz + ');')
  parts.push('camera.lookAt(0,0,0);')
  parts.push('scene.add(new THREE.AmbientLight(0xffffff,0.8));')
  parts.push('const dl=new THREE.DirectionalLight(0xffffff,2);dl.position.set(5,10,5);scene.add(dl);')
  parts.push('new GLTFLoader().load("' + glbUrl + '",(gltf)=>' + ob)
  parts.push('  const box=new THREE.Box3().setFromObject(gltf.scene);')
  parts.push('  gltf.scene.position.sub(box.getCenter(new THREE.Vector3()));')
  parts.push('  scene.add(gltf.scene);renderer.render(scene,camera);window.__RENDER_DONE__=true;')
  parts.push(cb + ',undefined,()=>' + ob + 'window.__RENDER_DONE__=true;' + cb + ');')
  parts.push('</' + 'script></body></html>')
  return parts.join('\n')
}
