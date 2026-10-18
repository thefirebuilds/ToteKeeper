import { createServer } from 'node:http'
import { configuration } from './config.ts'
import { SqlitePaymentRepository } from './repository.ts'
import { stripeClient } from './stripe.ts'
import { PurchaseCoordinator } from './coordinator.ts'
import { createSandboxHandler } from './http.ts'

const config = configuration()
const stripe = stripeClient(config.stripeKey)
const repo = new SqlitePaymentRepository(config.databasePath)
const coordinator = new PurchaseCoordinator(repo, stripe, config.readiness, config.origin, config.portalConfigurationId)
const server = createServer(createSandboxHandler(repo, coordinator, config))
server.listen(config.port, '127.0.0.1', () => console.log(`Stripe sandbox API listening on http://127.0.0.1:${config.port}. Live mode is disabled.`))
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => { repo.close(); process.exit(0) }))
