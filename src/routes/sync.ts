import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { syncCustomer } from '../sync'

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next)

export function syncRouter(prisma: PrismaClient): Router {
  const router = Router()

  // Sync all customers
  router.post('/', wrap(async (req, res) => {
    const { dateFrom, dateTo } = req.body ?? {}
    const customers = await prisma.customer.findMany({ select: { id: true, name: true } })

    if (customers.length === 0) {
      return res.json({ message: 'Ingen kunder at synkronisere' })
    }

    const settled = await Promise.allSettled(
      customers.map(c => syncCustomer(prisma, c.id, dateFrom, dateTo))
    )

    const results = settled.map((r, i) => {
      if (r.status === 'fulfilled') {
        return { status: 'fulfilled', ...r.value }
      }
      return {
        status: 'rejected',
        customerId: customers[i].id,
        customerName: customers[i].name,
        error: (r as PromiseRejectedResult).reason?.message ?? 'Ukendt fejl',
      }
    })

    res.json(results)
  }))

  // Sync a single customer
  router.post('/:id', wrap(async (req, res) => {
    const { dateFrom, dateTo } = req.body ?? {}

    const exists = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    })
    if (!exists) return res.status(404).json({ error: 'Kunde ikke fundet' })

    const result = await syncCustomer(prisma, req.params.id, dateFrom, dateTo)
    res.json(result)
  }))

  return router
}
