// ─── Database client (lazy-initialised postgres connection) ──────────────────
//
// Defers connection creation until first runtime use so that Next.js build-time
// module evaluation does not require DATABASE_URL to be present.
//
// `db.sql` matches the DbWithSql interface from @openlarm/ingest-builder:
//   sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
//
// The wrapper delegates to postgres.Sql (a tagged-template-literal function).
// postgres.PendingQuery<Row[]> extends Promise, so the cast to Promise<unknown[]>
// is safe at runtime.

import postgres, { type Row } from "postgres"

let _pgClient: postgres.Sql | null = null

function getClient(): postgres.Sql {
  if (!_pgClient) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error("DATABASE_URL required")
    _pgClient = postgres(url, { max: 5, idle_timeout: 30 })
  }
  return _pgClient
}

type SqlFn = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

// postgres.Sql is callable as a tagged-template literal that returns
// PendingQuery<Row[]> which extends Promise<RowList<Row[]>>.
// The double-assertion bridges the structural mismatch at compile time only.
const sqlAdapter: SqlFn = (
  (strings: TemplateStringsArray, ...values: unknown[]): postgres.PendingQuery<Row[]> =>
    getClient()(strings as TemplateStringsArray, ...(values as Parameters<postgres.Sql>[1][]))
) as unknown as SqlFn

export const db: { sql: SqlFn } = { sql: sqlAdapter }
