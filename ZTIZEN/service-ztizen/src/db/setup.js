/**
 * Database Setup Script
 * Initializes database schema for ZTIZEN service
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pool, { query, closePool } from './pool.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run SQL migration file
 */
async function runMigration() {
  try {
    console.log('🚀 Starting database setup...\n');

    // Read schema file
    const schemaPath = path.join(__dirname, '../../sql/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('📄 Running schema.sql...');

    // Execute schema
    await query(schemaSql);

    console.log('✅ Schema created successfully\n');

    // Verify tables
    const tablesResult = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log('📊 Created tables:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    // Check if we need to seed initial data
    const userCount = await query('SELECT COUNT(*) FROM users');

    if (parseInt(userCount.rows[0].count) === 0) {
      console.log('\n🌱 No users found, you can add seed data if needed');
    } else {
      console.log(`\n👥 Found ${userCount.rows[0].count} existing users`);
    }

    console.log('\n✅ Database setup completed successfully!');

  } catch (error) {
    console.error('\n❌ Database setup failed:', error.message);
    throw error;
  } finally {
    await closePool();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Setup failed:', error);
      process.exit(1);
    });
}

export default runMigration;
