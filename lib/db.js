import { neon } from '@neondatabase/serverless';

let _sql = null;

function getClient() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.');
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

// sql is a tagged-template function; all callers use: sql`SELECT ...`
export function sql(strings, ...values) {
  return getClient()(strings, ...values);
}
