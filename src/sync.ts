import { PrismaClient } from '@prisma/client'
import { MobilePayService } from './services/mobilepay'
import { EconomicService } from './services/economic'

const LOOKBACK_DAYS = 30

export interface SyncResult {
  customerId: string
  customerName: string
  dateFrom: string
  dateTo: string
  synced: number
  skipped: number
  errors: string[]
}

export async function syncCustomer(
  prisma: PrismaClient,
  customerId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<SyncResult> {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    include: { accountMappings: true },
  })

  const today = new Date()
  const defaultStart = new Date(today)
  defaultStart.setDate(defaultStart.getDate() - LOOKBACK_DAYS)

  const startDate = dateFrom ?? (
    customer.lastSyncAt
      ? customer.lastSyncAt.toISOString().split('T')[0]
      : defaultStart.toISOString().split('T')[0]
  )
  const endDate = dateTo ?? today.toISOString().split('T')[0]

  const result: SyncResult = {
    customerId,
    customerName: customer.name,
    dateFrom: startDate,
    dateTo: endDate,
    synced: 0,
    skipped: 0,
    errors: [],
  }

  const mobilepay = new MobilePayService(
    customer.mobilepayClientId,
    customer.mobilepayClientSecret,
    customer.mobilepaySubscriptionKey,
    customer.mobilepayMerchantSerialNumber
  )

  const economic = new EconomicService(
    customer.economicAppSecretToken,
    customer.economicAgreementGrantToken
  )

  for (const ledgerType of ['funds', 'fees'] as const) {
    let transactions
    try {
      transactions = await mobilepay.fetchTransactions(startDate, endDate, ledgerType)
    } catch (err) {
      result.errors.push(`MobilePay fetch failed (${ledgerType}): ${(err as Error).message}`)
      continue
    }

    for (const tx of transactions) {
      const alreadyBooked = await prisma.bookedTransaction.findUnique({
        where: { customerId_pspReference: { customerId, pspReference: tx.pspReference } },
      })

      if (alreadyBooked) {
        result.skipped++
        continue
      }

      const mapping = customer.accountMappings.find(m => m.entryType === tx.entryType)
      if (!mapping) {
        result.errors.push(
          `Ingen kontoopsætning for entryType "${tx.entryType}" (pspRef: ${tx.pspReference}). ` +
          `Tilføj en mapping under /customers/${customerId}/mappings.`
        )
        result.skipped++
        continue
      }

      // MobilePay amounts are in minor units (øre), e-conomic expects kroner
      const amount = tx.amount / 100
      const ledgerDate = tx.ledgerDate.split('T')[0]
      const text = `MobilePay ${tx.entryType} ${tx.reference ?? tx.pspReference}`

      try {
        const voucher = await economic.createVoucher(customer.economicJournalNumber, {
          date: ledgerDate,
          accountNumber: mapping.debitAccount,
          contraAccountNumber: mapping.creditAccount,
          amount,
          currency: tx.currency,
          ...(mapping.vatCode ? { vatCode: mapping.vatCode } : {}),
          text,
        })

        await prisma.bookedTransaction.create({
          data: {
            customerId,
            pspReference: tx.pspReference,
            reference: tx.reference,
            amount,
            currency: tx.currency,
            entryType: tx.entryType,
            ledgerDate: new Date(tx.ledgerDate),
            voucherNumber: voucher.voucherNumber,
          },
        })

        result.synced++
      } catch (err) {
        result.errors.push(
          `Bogføring fejlede for ${tx.pspReference}: ${(err as Error).message}`
        )
      }
    }
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: { lastSyncAt: new Date() },
  })

  return result
}
