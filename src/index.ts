import 'dotenv/config'
import express, { Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { customersRouter } from './routes/customers'
import { syncRouter } from './routes/sync'

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT ?? 3000

app.use(express.json())

app.use('/customers', customersRouter(prisma))
app.use('/sync', syncRouter(prisma))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint ikke fundet' })
})

// Global error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: err.message ?? 'Intern serverfejl' })
})

async function main() {
  await prisma.$connect()
  app.listen(PORT, () => {
    console.log(`MobilePay → e-conomic bogfører kører på port ${PORT}`)
    console.log(`API dokumentation: se README.md`)
  })
}

main().catch(err => {
  console.error('Kunne ikke starte server:', err)
  process.exit(1)
})
