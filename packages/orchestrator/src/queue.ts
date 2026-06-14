import type { RenderJob } from '../../../shared/types'
import { routeJob } from './router'

export interface JobQueueOptions {
  concurrency?: number
}

type JobHandler = (job: RenderJob) => Promise<void>

export class JobQueue {
  private queue: RenderJob[] = []
  private running = 0
  private concurrency: number
  private handlers: Map<string, JobHandler> = new Map()

  constructor(options: JobQueueOptions = {}) {
    this.concurrency = options.concurrency ?? 3
  }

  onJob(tier: 'fast' | 'quality', handler: JobHandler): void {
    this.handlers.set(tier, handler)
  }

  enqueue(job: RenderJob): void {
    this.queue.push(job)
    this.drain()
  }

  private async drain(): Promise<void> {
    if (this.running >= this.concurrency) return
    const job = this.queue.shift()
    if (!job) return
    this.running++
    try {
      const routing = routeJob(job)
      const handler = this.handlers.get(routing.tier)
      if (!handler) {
        job.status = 'failed'
        job.error = 'No handler for tier: ' + routing.tier
        return
      }
      await handler(job)
    } catch (err) {
      job.status = 'failed'
      job.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.running--
      this.drain()
    }
  }

  get size(): number { return this.queue.length }
  get activeCount(): number { return this.running }
}
