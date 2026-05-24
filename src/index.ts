import 'dotenv/config'
import path from 'path'
import express, { Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { customersRouter } from './routes/customers'
import { syncRouter } from './routes/sync'
import { startCron } from './cron'

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT ?? 3000

app.use(express.json())

// API routes
app.use('/customers', customersRouter(prisma))
app.use('/sync', syncRouter(prisma))

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    syncSchedule: process.env.SYNC_ENABLED === 'false'
      ? null
      : (process.env.SYNC_CRON ?? '0 2 * * *'),
  })
})

// Serve frontend — must be after API routes so /customers etc. are not caught as static files
app.use(express.static(path.join(__dirname, '..', 'public')))

// Global error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: err.message ?? 'Intern serverfejl' })
})

async function main() {
  await prisma.$connect()
  startCron()
  app.listen(PORT, () => {
    console.log(`MobilePay → e-conomic bogfører kører på http://localhost:${PORT}`)
  })
}

main().catch(err => {
  console.error('Kunne ikke starte server:', err)
  process.exit(1)
})
