# @studio-render/render-quality

Blender 4.4 headless Cycles render pipeline for quality-tier renders.
Runs from WSL2 and calls Windows Blender as a subprocess with automatic path translation.

## Prerequisites

- Blender 4.4 at C:\Program Files\Blender Foundation\Blender 4.4\blender.exe
- WSL2 with Node.js 20+ and pnpm
- GPU (NVIDIA recommended) -- CPU fallback is automatic

## GPU Setup (one-time)

1. Open Blender on Windows
2. Edit > Preferences > System > Cycles Render Devices
3. Select OptiX (NVIDIA RTX) or CUDA
4. Tick your GPU(s) and Save Preferences

Blender saves GPU settings to the Windows user profile.

## Quick Start

    pnpm install
    npx tsx packages/render-quality/test/test-render.ts

## Blender CLI Command

The exact command blender.ts invokes:

    "/mnt/c/Program Files/Blender Foundation/Blender 4.4/blender.exe"
      --background
      --python "C:\path\to\render.py"
      --
      --config "C:\Windows\Temp\studio-render-UUID.json"

## Path Translation

Blender (Windows process) cannot read WSL /mnt/c/ paths.
path-utils.ts converts automatically:

    WSL:     /mnt/c/models/car.glb
    Windows: C:\models\car.glb

GLB files and outputDir MUST be on a Windows drive (/mnt/c/...).

## Scene Presets

studio-white     - white infinity cove, three-point soft lighting
studio-dark      - dark studio, dramatic rim lighting
race-track-day   - sunlit circuit, Nishita sky + sun
race-track-night - night circuit, spot floodlights
city-night       - urban neon + wet road reflections
golden-hour      - warm sunset, Nishita low sun

## Camera Angles

front-34 - front three-quarter  (-4.5, -5.5, 2.0)
rear-34  - rear three-quarter   (4.5, 5.5, 2.0)
hero     - straight-on hero     (0, -7, 2.2)
detail   - close-up / detail    (-2, -3, 1.2)

## Output Files (per angle)

    {outputDir}/{jobId}_{angle}_4k.png      3840x2160 PNG (archival)
    {outputDir}/{jobId}_{angle}_1080p.jpg   1920x1080 JPEG (web)

## Environment Variables

BLENDER_PATH
  WSL path to blender.exe
  Default: /mnt/c/Program Files/Blender Foundation/Blender 4.4/blender.exe

WINDOWS_TEMP
  WSL path to Windows TEMP dir for per-job config JSON
  Default: /mnt/c/Windows/Temp

## Troubleshooting

Blender not found:
  ls "/mnt/c/Program Files/Blender Foundation/Blender 4.4/blender.exe"
  Set BLENDER_PATH if installed elsewhere

GPU not detected:
  Complete GPU setup above in Blender GUI
  Check nvidia-smi in WSL
  OptiX requires NVIDIA driver 515+ on Windows

Render timeout (default 10 min):
  Use quality=preview (128 samples) for test renders
  GPU at 512 samples: typically 2-5 min per angle

render.py not found:
  Ensure render.py is at packages/render-quality/render.py
  When using compiled dist/, copy render.py to sit alongside dist/
