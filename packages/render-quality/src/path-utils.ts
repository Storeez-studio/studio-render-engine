/**
 * path-utils.ts -- WSL to Windows path translation utilities
 *
 * Blender runs as a Windows process and cannot read WSL /mnt/c/ paths.
 * All paths passed to render.py must be converted to Windows format first.
 */

export interface RenderJobPaths {
  glbPath: string
  liveryTexturePath?: string
  outputDir: string
  configPath: string
}

/**
 * Convert a WSL path like /mnt/c/foo/bar to a Windows path like C:\foo\bar
 */
export function wslToWindows(wslPath: string): string {
  // Already a Windows path -- return as-is
  if (/^[a-zA-Z]:\\/.test(wslPath)) {
    return wslPath
  }

  // Handle /mnt/<drive>/ prefix (e.g. /mnt/c/, /mnt/d/)
  const mntMatch = wslPath.match(/^\/mnt\/([a-zA-Z])(\/.*)?$/)
  if (mntMatch) {
    const driveLetter = mntMatch[1].toUpperCase()
    const rest = (mntMatch[2] ?? '').replace(/\//g, '\\')
    return `${driveLetter}:${rest}`
  }

  throw new Error(
    `Cannot convert to Windows path -- expected /mnt/<drive>/... or C:\\... but got: "${wslPath}"`,
  )
}

/**
 * Convert a Windows path like C:\foo\bar to a WSL path like /mnt/c/foo/bar
 */
export function windowsToWsl(windowsPath: string): string {
  // Already a WSL /mnt/ path -- return as-is
  if (windowsPath.startsWith('/mnt/')) {
    return windowsPath
  }

  const winMatch = windowsPath.match(/^([a-zA-Z]):\\(.*)$/)
  if (winMatch) {
    const driveLetter = winMatch[1].toLowerCase()
    const rest = winMatch[2].replace(/\\/g, '/')
    return `/mnt/${driveLetter}/${rest}`
  }

  throw new Error(
    `Cannot convert to WSL path -- expected C:\\... or /mnt/... but got: "${windowsPath}"`,
  )
}

/**
 * Returns the WSL-accessible path to Blender 4.4 on Windows.
 * Override with BLENDER_PATH env var for custom installs.
 */
export function getBlenderPath(): string {
  return (
    process.env.BLENDER_PATH ??
    '/mnt/c/Program Files/Blender Foundation/Blender 4.4/blender.exe'
  )
}

/**
 * Translate all WSL paths in a render job config to Windows paths so they
 * can be written into the JSON config file that Blender (a Windows process) reads.
 *
 * Returns a new object with Windows-format paths -- does not mutate the input.
 */
export function prepareJobPaths(paths: RenderJobPaths): RenderJobPaths {
  return {
    glbPath: wslToWindows(paths.glbPath),
    liveryTexturePath: paths.liveryTexturePath
      ? wslToWindows(paths.liveryTexturePath)
      : undefined,
    outputDir: wslToWindows(paths.outputDir),
    configPath: wslToWindows(paths.configPath),
  }
}

/** Returns true if the path is a WSL /mnt/... path */
export function isWslPath(p: string): boolean {
  return p.startsWith('/mnt/')
}

/** Returns true if the path is a Windows drive path (C:\...) */
export function isWindowsPath(p: string): boolean {
  return /^[a-zA-Z]:\\/.test(p)
}
