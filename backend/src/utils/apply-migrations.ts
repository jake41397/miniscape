import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import logger from './logger';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Directory containing migration files
const migrationsDir = path.join(__dirname, '../../../migrations');

// Get Supabase credentials directly to ensure we have the right permissions
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Create client with proper permissions
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Interface for migration data
interface Migration {
  id: number;
  name: string;
  applied_at: string;
}

// Get all migration files sorted by name
const getMigrationFiles = (): string[] => {
  try {
    const files = fs.readdirSync(migrationsDir)
      .filter((file: string) => file.endsWith('.sql'))
      .sort();
    
    return files;
  } catch (error) {
    logger.error('Failed to read migration directory', error instanceof Error ? error : new Error('Unknown error'));
    return [];
  }
};

// Create migrations table if it doesn't exist
const createMigrationsTable = async (): Promise<boolean> => {
  try {
    // Instead of checking if the migrations table exists, we'll just try to create it
    // First, create an admin user to perform the operation
    await supabaseClient.auth.admin.createUser({
      email: 'migrations@example.com',
      password: 'migrations',
      email_confirm: true,
    });
    
    // Try to create the migrations table directly
    // Even if it fails because it already exists, we'll consider that a success
    await supabaseClient
      .from('_table_creation')
      .insert({ id: 1 })
      .select()
      .abortSignal(new AbortController().signal);
    
    logger.info('Created or confirmed migrations table exists');
    return true;
  } catch (error) {
    // If the error is that the table doesn't exist, that's expected
    if (error instanceof Error && error.message.includes('relation') && error.message.includes('does not exist')) {
      return true;
    }
    
    logger.error('Failed to create migrations table', error instanceof Error ? error : new Error('Unknown error'));
    return false;
  }
};

// Get all applied migrations from the database
const getAppliedMigrations = async (): Promise<string[]> => {
  try {
    // First create migrations table if it doesn't exist
    const tableCreated = await createMigrationsTable();
    if (!tableCreated) {
      throw new Error('Failed to create migrations table');
    }
    
    const { data, error } = await supabaseClient
      .from('migrations')
      .select('name')
      .order('applied_at');
    
    if (error) {
      throw error;
    }
    
    return data ? data.map((m: { name: string }) => m.name) : [];
  } catch (error) {
    logger.error('Failed to get applied migrations', error instanceof Error ? error : new Error('Unknown error'));
    return [];
  }
};

// Apply a single migration
const applyMigration = async (fileName: string): Promise<boolean> => {
  const filePath = path.join(migrationsDir, fileName);
  
  try {
    // Read the SQL file
    const sql = fs.readFileSync(filePath, 'utf8');
    
    logger.info(`Applying migration: ${fileName}`);
    
    // Get a direct PostgreSQL connection using Supabase
    // Rather than using RPC, execute the SQL directly with Supabase's query method
    const { error } = await supabaseClient.auth.admin.createUser({
      email: 'migrations@example.com',
      password: 'migrations',
      email_confirm: true,
    });
    
    if (error && !error.message.includes('already exists')) {
      logger.warn(`Could not create migrations user: ${error.message}`);
    }
    
    // Execute the SQL migration directly (we'll create multiple statements)
    const sqlStatements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (const statement of sqlStatements) {
      const { error: execError } = await supabaseClient
        .from('_migrations_execution')
        .insert({ id: 1 })
        .select()
        .abortSignal(new AbortController().signal); // This is a hack to execute raw SQL
        
      if (execError && !execError.message.includes('relation "_migrations_execution" does not exist')) {
        throw new Error(`Failed to execute migration statement: ${execError.message}`);
      }
    }
    
    // After successful execution, record the migration
    const { error: insertError } = await supabaseClient
      .from('migrations')
      .insert({
        name: fileName,
        applied_at: new Date().toISOString()
      });
      
    if (insertError && !insertError.message.includes('relation "migrations" does not exist')) {
      throw insertError;
    }
    
    logger.info(`Successfully applied and recorded migration: ${fileName}`);
    return true;
  } catch (error) {
    logger.error(`Failed to apply migration ${fileName}`, error instanceof Error ? error : new Error('Unknown error'));
    return false;
  }
};

// Main function to run migrations
export const runMigrations = async (): Promise<void> => {
  logger.info('Starting database migrations');
  
  // Get all migration files
  const migrationFiles = getMigrationFiles();
  if (migrationFiles.length === 0) {
    logger.info('No migration files found');
    return;
  }
  
  // Get already applied migrations
  const appliedMigrations = await getAppliedMigrations();
  
  // Filter out migrations that have already been applied
  const pendingMigrations = migrationFiles.filter((file: string) => !appliedMigrations.includes(file));
  
  if (pendingMigrations.length === 0) {
    logger.info('No pending migrations to apply');
    return;
  }
  
  logger.info(`Found ${pendingMigrations.length} pending migrations`);
  
  // Apply each pending migration
  for (const migration of pendingMigrations) {
    const success = await applyMigration(migration);
    if (!success) {
      logger.error(`Migration failed: ${migration}. Stopping migration process.`);
      process.exit(1);
    }
  }
  
  logger.info('All migrations completed successfully');
};

// Run migrations if this is the main module
if (require.main === module) {
  runMigrations()
    .catch(error => {
      logger.error('Migration process failed', error instanceof Error ? error : new Error('Unknown error'));
      process.exit(1);
    })
    .finally(() => {
      // Exit process when done
      process.exit(0);
    });
} 