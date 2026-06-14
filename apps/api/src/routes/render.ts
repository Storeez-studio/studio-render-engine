import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import type { RenderConfig, RenderJob } from '../../../../shared/types'

const router = Router()
const jobs = new Map<string, RenderJob>()

export { jobs }

router.post('/render', async (req, res) => {
  const config: RenderConfig = req.body
  const job: RenderJob = {
    id: uuid(),
    config,
    status: 'queued',
    createdAt: new Date().toISOString(),
  }
  jobs.set(job.id, job)
  if (config.tier === 'fast') {
    processFastRender(job)
  } else {
    processQualityRender(job)
  }
  res.json({ jobId: job.id, status: 'queued' })
})

async function processFastRender(job: RenderJob): Promise<void> {
  job.status = 'processing'
  // TODO: call @studio-render/render-fast pipeline
  console.log('[fast] Processing job: ' + job.id)
}

async function processQualityRender(job: RenderJob): Promise<void> {
  job.status = 'processing'
  // TODO: call @studio-render/render-quality pipeline
  console.log('[quality] Processing job: ' + job.id)
}

export default router
