import sql from 'mssql'

const config: sql.config = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'very_good_auctions',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: process.env.NODE_ENV === 'development',
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
}

let pool: sql.ConnectionPool | null = null

export async function initializeDatabase(): Promise<sql.ConnectionPool> {
  if (pool) {
    return pool
  }

  try {
    pool = await sql.connect(config)
    return pool
  } catch (error) {
    console.error('Database connection failed:', error)
    throw error
  }
}

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    return initializeDatabase()
  }
  return pool
}

// Simplified query result type that avoids strict unknown typing
export interface QueryResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordset: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordsets: any[][]
  rowsAffected: number[]
}

export async function query(
  queryString: string,
  params?: Record<string, unknown>
): Promise<QueryResult> {
  const pool = await getPool()
  const request = pool.request()

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      request.input(key, value)
    })
  }

  const result = await request.query(queryString)
  return {
    recordset: result.recordset,
    recordsets: result.recordsets as any[][],
    rowsAffected: result.rowsAffected,
  }
}

export { sql }
