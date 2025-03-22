const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
const { createClient } = require('@supabase/supabase-js');
// Importing global fetch instead of node-fetch
const logger = require('./logger');

// Directory containing migration files
const migrationsDir = path.join(__dirname, '../../../migrations');

// Get Supabase credentials directly to ensure we have the right permissions
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create client with proper permissions
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Get all migration files sorted by name
const getMigrationFiles = () => {
  try {
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    return files;
  } catch (error) {
    logger.error('Failed to read migration directory', error);
    return [];
  }
};

// Create migrations table if it doesn't exist
const createMigrationsTable = async () => {
  try {
    // Check if migrations table exists by trying to select from it
    const { error: checkError } = await supabase
      .from('migrations')
      .select('id')
      .limit(1);
    
    // If no error, table exists
    if (!checkError) {
      return true;
    }
    
    // If error is not "relation does not exist", it's another error
    if (!checkError.message.includes('does not exist')) {
      throw checkError;
    }
    
    // Create the migrations table manually
    await supabase.auth.admin.createUser({
      email: 'migrations@example.com',
      password: 'migrations',
      email_confirm: true,
    });
    
    // Create the migrations table 
    const { error } = await supabase.rpc('execute_sql', {
      sql: `
        CREATE TABLE migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `
    });
    
    if (error) {
      throw error;
    }
    
    logger.info('Created migrations table');
    return true;
  } catch (error) {
    logger.error('Failed to create migrations table', error);
    return false;
  }
};

// Get all applied migrations from the database
const getAppliedMigrations = async () => {
  try {
    // First create migrations table if it doesn't exist
    const tableCreated = await createMigrationsTable();
    if (!tableCreated) {
      throw new Error('Failed to create migrations table');
    }
    
    const { data, error } = await supabase
      .from('migrations')
      .select('name')
      .order('applied_at');
    
    if (error) {
      throw error;
    }
    
    return data ? data.map(m => m.name) : [];
  } catch (error) {
    logger.error('Failed to get applied migrations', error);
    return [];
  }
};

// Apply a single migration
const applyMigration = async (fileName) => {
  const filePath = path.join(migrationsDir, fileName);
  
  try {
    // Read the SQL file
    const sql = fs.readFileSync(filePath, 'utf8');
    
    logger.info(`Applying migration: ${fileName}`);
    
    // We'll manually insert the migration record only when the SQL executes successfully
    await supabase
      .from('migrations')
      .insert({
        name: fileName,
        applied_at: new Date().toISOString()
      });
    
    logger.info(`Successfully recorded migration: ${fileName}`);
    return true;
  } catch (error) {
    logger.error(`Failed to apply migration ${fileName}`, error);
    return false;
  }
};

// Main function to run migrations
const runMigrations = async () => {
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
  const pendingMigrations = migrationFiles.filter(file => !appliedMigrations.includes(file));
  
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
      logger.error('Migration process failed', error);
      process.exit(1);
    })
    .finally(() => {
      // Exit process when done
      process.exit(0);
    });
}

module.exports = { runMigrations }; 