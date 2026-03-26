#!/bin/bash
# Reset ZTIZEN Database
# This will drop and recreate the database with updated schema

set -e

echo "🗑️  Resetting ZTIZEN Database..."

# Database connection info
DB_HOST="localhost"
DB_PORT="5504"
DB_NAME="ztizen"
DB_USER="ztizen"
PGPASSWORD="ztizen_dev_password"

export PGPASSWORD

# Drop and recreate database
echo "📦 Dropping existing database..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"

echo "📦 Creating fresh database..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;"

echo "📋 Applying schema..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f sql/schema.sql

echo "🔄 Applying migrations..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f sql/migrations/002_expand_algorithm_column.sql

echo "✅ Database reset complete!"
echo ""
echo "📊 Verifying schema..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "\d+ credentials" | grep template_type

unset PGPASSWORD
