import { Router } from 'express'
import { jobs } from './render'

const router = Router()

router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  res.json(job)
})

router.get('/jobs', (_req, res) => {
  const all = Array.from(jobs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  res.json({ jobs: all, total: all.length })
})

router.delete('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  jobs.delete(req.params.id)
  res.json({ deleted: req.params.id })
})

export default router
