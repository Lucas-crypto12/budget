import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next)

const REQUIRED_FIELDS = [
  'name',
  'mobilepayClientId',
  'mobilepayClientSecret',
  'mobilepaySubscriptionKey',
  'mobilepayMerchantSerialNumber',
  'economicAppSecretToken',
  'economicAgreementGrantToken',
  'economicJournalNumber',
]

// Masks sensitive credential fields in API responses
function maskCustomer(customer: Record<string, unknown>) {
  const MASKED = ['mobilepayClientSecret', 'economicAppSecretToken', 'economicAgreementGrantToken']
  return Object.fromEntries(
    Object.entries(customer).map(([k, v]) => [k, MASKED.includes(k) ? '***' : v])
  )
}

export function customersRouter(prisma: PrismaClient): Router {
  const router = Router()

  router.get('/', wrap(async (_req, res) => {
    const customers = await prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        economicJournalNumber: true,
        lastSyncAt: true,
        createdAt: true,
        _count: { select: { transactions: true, accountMappings: true } },
      },
      orderBy: { name: 'asc' },
    })
    res.json(customers)
  }))

  router.get('/:id', wrap(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        accountMappings: { orderBy: { entryType: 'asc' } },
        _count: { select: { transactions: true } },
      },
    })
    if (!customer) return res.status(404).json({ error: 'Kunde ikke fundet' })
    res.json(maskCustomer(customer as unknown as Record<string, unknown>))
  }))

  router.post('/', wrap(async (req, res) => {
    const missing = REQUIRED_FIELDS.filter(f => req.body[f] == null)
    if (missing.length) {
      return res.status(400).json({ error: `Manglende felter: ${missing.join(', ')}` })
    }

    const customer = await prisma.customer.create({
      data: {
        name: req.body.name,
        mobilepayClientId: req.body.mobilepayClientId,
        mobilepayClientSecret: req.body.mobilepayClientSecret,
        mobilepaySubscriptionKey: req.body.mobilepaySubscriptionKey,
        mobilepayMerchantSerialNumber: req.body.mobilepayMerchantSerialNumber,
        economicAppSecretToken: req.body.economicAppSecretToken,
        economicAgreementGrantToken: req.body.economicAgreementGrantToken,
        economicJournalNumber: parseInt(req.body.economicJournalNumber),
      },
    })

    res.status(201).json({ id: customer.id, name: customer.name })
  }))

  router.put('/:id', wrap(async (req, res) => {
    const existing = await prisma.customer.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Kunde ikke fundet' })

    const updatable = [
      'name',
      'mobilepayClientId', 'mobilepayClientSecret', 'mobilepaySubscriptionKey',
      'mobilepayMerchantSerialNumber',
      'economicAppSecretToken', 'economicAgreementGrantToken', 'economicJournalNumber',
    ]
    const data = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => updatable.includes(k))
    )
    if (data.economicJournalNumber) {
      data.economicJournalNumber = parseInt(data.economicJournalNumber as string)
    }

    const updated = await prisma.customer.update({ where: { id: req.params.id }, data })
    res.json({ id: updated.id, name: updated.name })
  }))

  router.delete('/:id', wrap(async (req, res) => {
    const existing = await prisma.customer.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Kunde ikke fundet' })
    await prisma.customer.delete({ where: { id: req.params.id } })
    res.status(204).send()
  }))

  // --- Account mappings ---

  router.get('/:id/mappings', wrap(async (req, res) => {
    const mappings = await prisma.accountMapping.findMany({
      where: { customerId: req.params.id },
      orderBy: { entryType: 'asc' },
    })
    res.json(mappings)
  }))

  // Bulk upsert — send all mappings for a customer at once
  router.put('/:id/mappings', wrap(async (req, res) => {
    const { mappings } = req.body as {
      mappings: Array<{
        entryType: string
        debitAccount: number
        creditAccount: number
        vatCode?: string
      }>
    }

    if (!Array.isArray(mappings)) {
      return res.status(400).json({ error: 'mappings skal være et array' })
    }

    const results = await Promise.all(
      mappings.map(m =>
        prisma.accountMapping.upsert({
          where: {
            customerId_entryType: { customerId: req.params.id, entryType: m.entryType },
          },
          create: { customerId: req.params.id, ...m },
          update: {
            debitAccount: m.debitAccount,
            creditAccount: m.creditAccount,
            vatCode: m.vatCode ?? null,
          },
        })
      )
    )
    res.json(results)
  }))

  router.delete('/:id/mappings/:entryType', wrap(async (req, res) => {
    await prisma.accountMapping.deleteMany({
      where: { customerId: req.params.id, entryType: req.params.entryType },
    })
    res.status(204).send()
  }))

  // --- Transaction history ---

  router.get('/:id/transactions', wrap(async (req, res) => {
    const limit = Math.min(parseInt((req.query.limit as string) ?? '50'), 200)
    const offset = parseInt((req.query.offset as string) ?? '0')

    const [transactions, total] = await prisma.$transaction([
      prisma.bookedTransaction.findMany({
        where: { customerId: req.params.id },
        orderBy: { ledgerDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.bookedTransaction.count({ where: { customerId: req.params.id } }),
    ])

    res.json({ total, limit, offset, transactions })
  }))

  return router
}
