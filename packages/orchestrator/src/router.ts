import type { RenderJob } from '../../../shared/types'

export interface RoutingResult {
  tier: 'fast' | 'quality'
  reason: string
}

/**
 * Route a render job to the appropriate tier.
 * Fast tier  -> AI-enhanced (FLUX + FAL) -- thumbnails and social content
 * Quality tier -> Blender headless       -- hero and campaign assets
 */
export function routeJob(job: RenderJob): RoutingResult {
  const tier = job.config.tier

  if (tier === 'quality') {
    return { tier: 'quality', reason: 'Explicit quality tier -- routing to Blender headless pipeline' }
  }

  if (tier === 'fast') {
    return { tier: 'fast', reason: 'Fast tier selected -- routing to FLUX + FAL AI enhancement' }
  }

  const hasLargeFormat = job.config.render.outputFormats.includes('print')
  if (hasLargeFormat) {
    return { tier: 'quality', reason: 'Print format requested -- upgrading to quality tier' }
  }

  return { tier: 'fast', reason: 'Default: fast tier for standard output formats' }
}
