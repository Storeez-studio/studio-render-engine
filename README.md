# Gravitaslabs Studio Render Engine

A monorepo render pipeline for agencies and studios. Takes any GLB model, applies
creative treatments (liveries, decals, finish materials), and produces photorealistic
images and cinematic video via two tiers:

- **Fast Tier** - Three.js screenshot + FLUX Kontext (AI) + Seedance-2 video (~2-4 min)
- **Quality Tier** - Blender headless Cycles render (4K, realistic materials, studio lighting)

---

## Architecture

```
POST /render
     |
     v
Orchestrator (job queue, concurrency limit)
     |
     +-- tier: "fast"  --> FastRender (Three.js -> FLUX Kontext) --> VideoGenerator (Seedance-2)
     |
     +-- tier: "quality" --> QualityRender (Blender headless Cycles)
     |
     v
GET /jobs/:id  (poll status + CDN URLs)
POST webhookUrl (auto-delivered on completion)
```

### Packages

| Package | Description |
|---|---|
| `@studio-render/types` | Shared TypeScript interfaces (RenderConfig, RenderJob, etc.) |
| `@studio-render/config` | 6 scene presets with lighting + camera configs |
| `@studio-render/capture` | Three.js + Puppeteer headless GLB screenshot (SSAA, shadow casting) |
| `@studio-render/render-fast` | FLUX dev / FLUX Kontext via FAL, returns CDN image URL |
| `@studio-render/video` | Seedance-2 image-to-video via FAL (landscape + portrait) |
| `@studio-render/render-quality` | Blender headless orchestrator + render.py Cycles script |
| `@studio-render/orchestrator` | Job router, in-memory queue, webhook delivery |
| `@studio-render/api` | Express REST API |

---

## Fast Tier

1. **Three.js screenshot** - Puppeteer renders the GLB in headless Chromium with a studio lighting rig and SSAA x2
2. **FAL storage upload** - screenshot PNG is uploaded to FAL CDN
3. **FLUX Kontext** (`fal-ai/flux-pro/v1/kontext`) - enhances the screenshot into a photorealistic product image using the scene/finish/render-preset as a creative prompt
4. **Seedance-2** (`bytedance/seedance-2.0/image-to-video`) - generates a 5-second cinematic video from the hero image (landscape 16:9 and/or portrait 9:16)

**Fallback**: if the Three.js capture fails (GLB unreachable, no Chromium), FastRender falls back to pure FLUX dev (`fal-ai/flux/dev`) text-to-image generation.

## Quality Tier

1. **Blender** is invoked headless (`blender --background --python render.py`) with a JSON config
2. **render.py** imports the GLB, centres + scales the model, applies livery textures and PBR finish materials
3. **Cycles** renders all requested camera angles at 4K (3840x2160) with 256 samples and OIDN denoising
4. Outputs are written to `OUTPUT_DIR/<jobId>/` and paths returned in the job response

---

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- FAL.ai account + API key
- **For Quality Tier**: Blender 4.x installed

---

## Running Locally

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env: set FAL_KEY, BLENDER_PATH, etc.

# 3. Start the API server (development mode with ts-node)
pnpm dev

# Server starts at http://localhost:3000
```

---

## API Reference

### POST /render

Submit a render job.

**Request body:**

```json
{
  "tier": "fast",
  "baseModel": "https://cdn.example.com/car.glb",
  "scene": "studio-white",
  "renderPreset": "automotive",
  "finish": "gloss",
  "outputFormats": ["16:9", "9:16"],
  "liveryTexture": "https://cdn.example.com/livery.png",
  "webhookUrl": "https://your-server.com/webhook"
}
```

**Response (202):**

```json
{
  "jobId": "uuid-here",
  "status": "queued"
}
```

---

### GET /jobs/:id

Poll job status and outputs.

**Response:**

```json
{
  "id": "uuid-here",
  "status": "complete",
  "config": { ... },
  "outputs": [
    { "format": "16:9", "url": "https://cdn.fal.ai/...", "type": "image", "width": 1920, "height": 1080 },
    { "format": "16:9", "url": "https://cdn.fal.ai/...", "type": "video", "width": 1920, "height": 1080 }
  ],
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:02:00.000Z"
}
```

Possible `status` values: `queued` | `processing` | `complete` | `failed`

---

### GET /jobs

List all jobs (newest first).

---

### GET /health

Liveness check. Returns `{ status: "ok" }` plus FAL key + Blender path info.

---

### GET /scenes

List all 6 scene presets with metadata.

---

### POST /webhook

Echo endpoint for local webhook testing. Set `webhookUrl: "http://localhost:3000/webhook"` in your render config.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `FAL_KEY` | (required) | FAL.ai API key |
| `PORT` | `3000` | Express server port |
| `BLENDER_PATH` | `/usr/bin/blender` | Path to Blender 4.x executable |
| `OUTPUT_DIR` | `/tmp/renders` | Directory for Blender render outputs |
| `WEBHOOK_SECRET` | — | Optional: for webhook signature validation |

---

## Scene Presets

| Key | Name | Description | Best for |
|---|---|---|---|
| `studio-white` | Studio White | Clean white infinity cove, soft box lighting | E-commerce, lookbooks |
| `studio-dark` | Studio Dark | Dramatic dark studio, rim lighting | Luxury, performance |
| `race-track-day` | Race Track Day | Sunlit race circuit, tarmac reflections | Motorsport, performance auto |
| `race-track-night` | Race Track Night | Floodlit night circuit | Premium motorsport campaigns |
| `city-night` | City Night | Urban nightscape, neon bokeh | Lifestyle, streetwear |
| `golden-hour` | Golden Hour | Warm sunset, long shadows | Aspirational lifestyle |

---

## RenderConfig Shape

```typescript
interface RenderConfig {
  tier: 'fast' | 'quality'
  baseModel: string           // URL or path to .glb file
  scene: string               // scene preset key
  renderPreset: 'automotive' | 'apparel' | 'footwear' | 'furniture'
  finish?: 'matte' | 'gloss' | 'carbon' | 'fabric' | 'leather'
  outputFormats?: ('16:9' | '9:16' | '1:1' | '4:3')[]
  liveryTexture?: string      // PNG URL or path
  decals?: DecalPlacement[]
  webhookUrl?: string
}
```

---

## FAL Models Used

| Purpose | Model ID |
|---|---|
| AI image generation | `fal-ai/flux/dev` |
| AI image enhancement | `fal-ai/flux-pro/v1/kontext` |
| Image-to-video | `bytedance/seedance-2.0/image-to-video` |

---

## Development

```bash
# Build all packages
pnpm build

# Watch mode for a specific package
pnpm --filter @studio-render/render-fast dev

# Add a dependency to a package
pnpm --filter @studio-render/api add some-package
```

---

## License

Proprietary -- Gravitaslabs / Storeez Studio
