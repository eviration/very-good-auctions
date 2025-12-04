import sql from 'mssql'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const config: sql.config = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'very_good_auctions',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: process.env.NODE_ENV === 'development',
  },
}

async function runMigrations() {
  let pool: sql.ConnectionPool | null = null

  try {
    console.log('Connecting to database...')
    pool = await sql.connect(config)
    console.log('Connected!')

    // Create migrations tracking table if not exists
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='_migrations' AND xtype='U')
      CREATE TABLE _migrations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL UNIQUE,
        executed_at DATETIME2 DEFAULT GETUTCDATE()
      )
    `)

    // Get list of migrations
    const migrationsDir = path.join(__dirname, '../../database/migrations')
    
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found. Running schema.sql...')
      
      const schemaPath = path.join(__dirname, '../../database/schema.sql')
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8')
        
        // Split by GO statements and execute each batch
        const batches = schema.split(/^GO$/gim).filter(b => b.trim())
        
        for (const batch of batches) {
          if (batch.trim()) {
            await pool.request().query(batch)
          }
        }
        
        console.log('Schema created successfully!')
      }
      return
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()

    // Get already executed migrations
    const executed = await pool.request().query<{ name: string }>(
      'SELECT name FROM _migrations'
    )
    const executedNames = new Set(executed.recordset.map(r => r.name))

    // Run pending migrations
    for (const file of files) {
      if (!executedNames.has(file)) {
        console.log(`Running migration: ${file}`)
        
        const migrationPath = path.join(migrationsDir, file)
        const migration = fs.readFileSync(migrationPath, 'utf8')
        
        const batches = migration.split(/^GO$/gim).filter(b => b.trim())
        
        for (const batch of batches) {
          if (batch.trim()) {
            const result = await pool.request().query(batch)
            // Log query results for debugging
            if (result.recordset && result.recordset.length > 0) {
              console.log('Query result:', JSON.stringify(result.recordset, null, 2))
            }
          }
        }

        await pool.request()
          .input('name', sql.NVarChar, file)
          .query('INSERT INTO _migrations (name) VALUES (@name)')
        
        console.log(`Completed: ${file}`)
      }
    }

    console.log('All migrations completed!')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}

runMigrations()
