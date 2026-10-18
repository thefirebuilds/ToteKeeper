import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { emptyState } from './model.ts'
import type { PaymentRepository, SandboxState } from './model.ts'

/** Durable sandbox repository. Production Octagon supplies its own transactional adapter. */
export class SqlitePaymentRepository implements PaymentRepository {
  readonly db: DatabaseSync
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS sandbox_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);')
    this.db.prepare('INSERT OR IGNORE INTO sandbox_state(id,data) VALUES(1,?)').run(JSON.stringify(emptyState()))
  }
  read(): SandboxState { return JSON.parse((this.db.prepare('SELECT data FROM sandbox_state WHERE id=1').get() as { data: string }).data) }
  transaction<T>(work: (state: SandboxState) => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const state = this.read(); const result = work(state)
      if (result && typeof result === 'object' && 'then' in result) throw new Error('Repository transactions must not perform asynchronous I/O.')
      this.db.prepare('UPDATE sandbox_state SET data=? WHERE id=1').run(JSON.stringify(state))
      this.db.exec('COMMIT'); return result
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  close() { this.db.close() }
}
