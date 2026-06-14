import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import renderRouter from './routes/render'
import jobsRouter from './routes/jobs'

const app = express()
const PORT = process.env.PORT ?? 3000

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'studio-render-engine', version: '0.1.0' })
})

app.use('/api', renderRouter)
app.use('/api', jobsRouter)

app.listen(PORT, () => {
  console.log('Gravitaslabs Studio Engine API running on port ' + PORT)
})

export default app
