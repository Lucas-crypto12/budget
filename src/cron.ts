import cron from 'node-cron'
import prisma from './db'
import { syncCustomer } from './sync'

export function startCron(): void {
  const schedule = process.env.SYNC_CRON ?? '0 2 * * *'

  if (process.env.SYNC_ENABLED === 'false') {
    console.log('Automatisk sync deaktiveret (SYNC_ENABLED=false)')
    return
  }

  cron.schedule(schedule, async () => {
    const ts = () => new Date().toISOString()
    console.log(`[${ts()}] Starter planlagt sync af alle kunder...`)

    const customers = await prisma.customer.findMany({
      select: { id: true, name: true },
    })

    for (const customer of customers) {
      try {
        const result = await syncCustomer(prisma, customer.id)
        console.log(
          `[${ts()}] ${customer.name}: ` +
          `${result.synced} bogført, ${result.skipped} sprunget over, ${result.errors.length} fejl`
        )
        result.errors.forEach(e => console.error(`  ✗ ${e}`))
      } catch (err) {
        console.error(`[${ts()}] Fejl ved sync af ${customer.name}:`, (err as Error).message)
      }
    }

    console.log(`[${ts()}] Planlagt sync afsluttet`)
  }, { timezone: 'Europe/Copenhagen' })

  console.log(`Planlagt sync aktiveret: "${schedule}" (Europe/Copenhagen)`)
}
