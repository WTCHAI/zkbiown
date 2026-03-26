# ZTIZEN Project Makefile
# Development & Database Management

.PHONY: help install setup docker-up docker-down migrate migrate-check dev-all dev-ztizen dev-product dev-frontend clean logs clear-cache db-check test-services db-reset db-setup db-migrate-up db-migrate-down db-status db-drop db-create db-terminate clean-volumes clean-all kill-port-3000 cleanup ensure-setup kill-all-ports docker-build docker-prod docker-prod-down docker-prod-logs docker-all docker-all-down

# Colors
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

# Default target
help:
	@echo "$(GREEN)ZTIZEN Project - Available Commands$(NC)"
	@echo "===================================="
	@echo ""
	@echo "$(YELLOW)Setup Commands:$(NC)"
	@echo "  make setup           - Complete setup (install + docker + migrate)"
	@echo "  make install         - Install all dependencies (pnpm install)"
	@echo ""
	@echo "$(YELLOW)Docker Commands (Development):$(NC)"
	@echo "  make docker-up       - Start database containers only"
	@echo "  make docker-down     - Stop all dev containers"
	@echo "  make docker-all      - Start everything in Docker (DBs + services + frontend)"
	@echo "  make docker-all-down - Stop all Docker services"
	@echo "  make logs            - View container logs"
	@echo ""
	@echo "$(YELLOW)Docker Commands (Production):$(NC)"
	@echo "  make docker-build    - Build all Docker images"
	@echo "  make docker-prod     - Start production stack (all services)"
	@echo "  make docker-prod-down- Stop production stack"
	@echo "  make docker-prod-logs- View production logs"
	@echo ""
	@echo "$(YELLOW)Database Commands:$(NC)"
	@echo "  make db-reset        - Complete database reset (drop + create + migrate)"
	@echo "  make db-setup        - Setup databases from scratch (create + migrate)"
	@echo "  make db-migrate-up   - Run all migrations from migrations/ folder"
	@echo "  make db-migrate-down - Rollback all migrations"
	@echo "  make db-status       - Show database status and service keys"
	@echo "  make db-drop         - Drop both databases"
	@echo "  make db-create       - Create both databases"
	@echo "  make migrate         - Legacy: Run database migrations (schema_v2)"
	@echo "  make migrate-check   - Check migration status"
	@echo "  make db-check        - Check database tables and data"
	@echo ""
	@echo "$(YELLOW)Development Commands (Local):$(NC)"
	@echo "  make dev-all         - Start all services (3 terminals needed)"
	@echo "  make dev-ztizen      - Start ZTIZEN service only"
	@echo "  make dev-product     - Start Product service only"
	@echo "  make dev-frontend    - Start frontend only"
	@echo ""
	@echo "$(YELLOW)Testing Commands:$(NC)"
	@echo "  make test-services   - Test if all services are running"
	@echo ""
	@echo "$(YELLOW)Cleanup Commands:$(NC)"
	@echo "  make clean           - Remove node_modules and reset"
	@echo "  make clean-volumes   - Remove all Docker volumes (databases)"
	@echo "  make clean-all       - Complete cleanup (node_modules + volumes)"
	@echo "  make cleanup         - FULL cleanup (ports + docker + artifacts)"
	@echo "  make clear-cache     - Clear Vite cache and build artifacts"
	@echo "  make kill-all-ports  - Kill all ZTIZEN ports (5501-5505)"
	@echo ""
	@echo "$(YELLOW)Quick Commands:$(NC)"
	@echo "  make ensure-setup    - Complete setup from scratch (cleanup + install + db)"
	@echo ""

# Setup
install:
	@echo "$(GREEN)📦 Installing dependencies...$(NC)"
	@echo ""
	@echo "$(YELLOW)Installing ZTIZEN Service dependencies...$(NC)"
	cd ztizen-service && pnpm install
	@echo "$(GREEN)✅ ZTIZEN Service dependencies installed$(NC)"
	@echo ""
	@echo "$(YELLOW)Installing Product Service dependencies...$(NC)"
	cd product-service && pnpm install
	@echo "$(GREEN)✅ Product Service dependencies installed$(NC)"
	@echo ""
	@echo "$(YELLOW)Installing Frontend dependencies...$(NC)"
	cd vite-demo && pnpm install
	@echo "$(GREEN)✅ Frontend dependencies installed$(NC)"
	@echo ""
	@echo "$(GREEN)🎉 All dependencies installed!$(NC)"

# Docker Management
docker-up:
	@echo "$(GREEN)🐳 Starting database containers...$(NC)"
	docker-compose -f docker-compose.dev.yml up -d ztizen-db ztizen-product-db
	@echo ""
	@echo "$(GREEN)✅ Containers started:$(NC)"
	@echo "  - ZTIZEN DB:  localhost:5504"
	@echo "  - Product DB: localhost:5505"
	@echo "  - Redis:      localhost:6379 (Shared)"
	@echo ""
	@echo "Waiting for databases to be ready..."
	@sleep 5
	@docker ps --filter "name=ztizen-db" --filter "name=ztizen-product-db" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

docker-down:
	@echo "$(YELLOW)🛑 Stopping all containers...$(NC)"
	docker-compose -f docker-compose.dev.yml down

logs:
	@echo "$(GREEN)📋 Container logs (Ctrl+C to exit):$(NC)"
	docker-compose -f docker-compose.dev.yml logs -f ztizen-db ztizen-product-db

# Database Migration
migrate: docker-up
	@echo ""
	@echo "$(GREEN)🔄 Database schemas are auto-loaded via docker-compose volumes$(NC)"
	@echo "======================================"
	@echo ""
	@echo "$(YELLOW)📊 Checking ZTIZEN Database...$(NC)"
	@docker exec ztizen-db psql -U ztizen -d ztizen -c "\dt" 2>&1 | grep -v "NOTICE" || echo "Tables not created yet (first run will auto-create)"
	@echo "$(GREEN)✅ ZTIZEN database ready$(NC)"
	@echo ""
	@echo "$(YELLOW)📊 Checking Product Database...$(NC)"
	@docker exec ztizen-product-db psql -U product -d product -c "\dt" 2>&1 | grep -v "NOTICE" || echo "Tables not created yet (first run will auto-create)"
	@echo "$(GREEN)✅ Product database ready$(NC)"
	@echo ""
	@echo "$(YELLOW)🌱 Seeding Demo Data...$(NC)"
	@docker exec -i ztizen-product-db psql -U product -d product < product-service/sql/seed.sql 2>&1 | grep -v "NOTICE" || true
	@echo "$(GREEN)✅ Demo data seeded$(NC)"
	@echo ""
	@echo "$(GREEN)🎉 Databases ready! Schemas auto-loaded from docker-compose volumes$(NC)"

migrate-check:
	@echo "$(GREEN)Checking ZTIZEN Database Schema:$(NC)"
	@docker exec ztizen-db psql -U ztizen -d ztizen -c "\dt" || echo "$(RED)❌ Cannot connect to ZTIZEN DB$(NC)"
	@echo ""
	@echo "$(GREEN)Checking Product Database Schema:$(NC)"
	@docker exec ztizen-product-db psql -U product -d product -c "\dt" || echo "$(RED)❌ Cannot connect to Product DB$(NC)"

# Development
dev-all:
	@echo "$(YELLOW)⚠️  This requires 3 terminal windows!$(NC)"
	@echo ""
	@echo "Terminal 1: make dev-ztizen"
	@echo "Terminal 2: make dev-product"
	@echo "Terminal 3: make dev-frontend"

dev-ztizen: docker-up migrate
	@echo "$(GREEN)🚀 Starting ZTIZEN Service (Port 5502)...$(NC)"
	cd ztizen-service && pnpm dev

dev-product: docker-up migrate
	@echo "$(GREEN)🚀 Starting Product Service (Port 5503)...$(NC)"
	cd product-service && pnpm dev

dev-frontend:
	@echo "$(GREEN)🚀 Starting Frontend (Port 5501)...$(NC)"
	cd vite-demo && pnpm dev

clean-volumes: docker-down
	@echo "$(YELLOW)🗑️  Removing Docker volumes...$(NC)"
	@docker volume rm ztizen_ztizen-db-data 2>/dev/null || echo "   ZTIZEN volume already removed or doesn't exist"
	@docker volume rm ztizen_ztizen-product-db-data 2>/dev/null || echo "   Product volume already removed or doesn't exist"
	@docker volume rm ztizen_redis-data 2>/dev/null || echo "   Redis volume already removed or doesn't exist"
	@echo "$(GREEN)✅ All database volumes removed$(NC)"

clean-all: docker-down
	@echo "$(RED)🧹 COMPLETE DATABASE CLEANUP$(NC)"
	@echo "$(YELLOW)This will completely wipe both databases!$(NC)"
	@echo ""
	@echo "$(YELLOW)1️⃣  Stopping all containers...$(NC)"
	@docker-compose -f docker-compose.dev.yml down > /dev/null 2>&1 || true
	@echo "   $(GREEN)✓$(NC) Containers stopped"
	@echo ""
	@echo "$(YELLOW)2️⃣  Removing Docker volumes...$(NC)"
	@docker volume rm ztizen_ztizen-db-data 2>/dev/null || echo "   ZTIZEN volume already removed"
	@docker volume rm ztizen_ztizen-product-db-data 2>/dev/null || echo "   Product volume already removed"
	@docker volume rm ztizen_redis-data 2>/dev/null || echo "   Redis volume already removed"
	@echo "   $(GREEN)✓$(NC) All volumes removed"
	@echo ""
	@echo "$(YELLOW)3️⃣  Restarting containers with fresh volumes...$(NC)"
	@docker-compose -f docker-compose.dev.yml up -d ztizen-db ztizen-product-db > /dev/null 2>&1
	@sleep 5
	@echo "   $(GREEN)✓$(NC) Containers restarted with clean volumes"
	@echo ""
	@echo "$(YELLOW)4️⃣  Creating fresh databases and running migrations...$(NC)"
	@$(MAKE) --no-print-directory db-reset
	@echo ""
	@echo "$(GREEN)✅ Complete cleanup and reset done!$(NC)"
	@echo ""
	@echo "$(YELLOW)📋 Both databases are now completely clean and re-initialized:$(NC)"
	@echo "   • ZTIZEN database: Empty (localhost:5504)"
	@echo "   • Product database: Demo data seeded (localhost:5505)"
	@echo ""

# Kill ports
kill-all-ports:
	@echo "$(YELLOW)🔪 Killing all ZTIZEN service ports...$(NC)"
	@lsof -ti:5501 | xargs kill -9 2>/dev/null || echo "   Port 5501 already free"
	@lsof -ti:5502 | xargs kill -9 2>/dev/null || echo "   Port 5502 already free"
	@lsof -ti:5503 | xargs kill -9 2>/dev/null || echo "   Port 5503 already free"
	@lsof -ti:5504 | xargs kill -9 2>/dev/null || echo "   Port 5504 already free"
	@lsof -ti:5505 | xargs kill -9 2>/dev/null || echo "   Port 5505 already free"
	@echo "$(GREEN)✅ All ZTIZEN ports are now free$(NC)"

# Database Utilities
db-check:
	@echo "$(GREEN)Checking Database Tables$(NC)"
	@echo "================================"
	@echo ""
	@echo "$(YELLOW)ZTIZEN Database Tables:$(NC)"
	@docker exec ztizen-db psql -U ztizen -d ztizen -c "\dt"
	@echo ""
	@echo "$(YELLOW)Product Database Tables:$(NC)"
	@docker exec ztizen-product-db psql -U product -d product -c "\dt"
	@echo ""
	@echo "$(YELLOW)Product Database - Products:$(NC)"
	@docker exec ztizen-product-db psql -U product -d product -c "SELECT id, product_name, is_active, created_at FROM products;" || echo "No products yet"
	@echo ""
	@echo "$(YELLOW)ZTIZEN Database - Credentials:$(NC)"
	@docker exec ztizen-db psql -U ztizen -d ztizen -c "SELECT credential_id, product_name, service_name, status, created_at FROM credentials LIMIT 5;" || echo "No credentials yet"

# Clear Vite cache
clear-cache:
	@echo "$(YELLOW)🧹 Clearing Vite cache...$(NC)"
	rm -rf vite-demo/node_modules/.vite
	rm -rf vite-demo/dist
	@echo "$(GREEN)✅ Vite cache cleared$(NC)"
	@echo "Restart your frontend: make dev-frontend"

# Test services
test-services:
	@echo "$(GREEN)Testing Services$(NC)"
	@echo "=================="
	@echo ""
	@echo "$(YELLOW)1. Testing ZTIZEN Service (port 5502)...$(NC)"
	@curl -s http://localhost:5502/health | grep -q "ok" && echo "$(GREEN)✅ ZTIZEN Service is running$(NC)" || echo "$(RED)❌ ZTIZEN Service is NOT running$(NC)"
	@echo ""
	@echo "$(YELLOW)2. Testing Product Service (port 5503)...$(NC)"
	@curl -s http://localhost:5503/health | grep -q "ok" && echo "$(GREEN)✅ Product Service is running$(NC)" || echo "$(RED)❌ Product Service is NOT running$(NC)"
	@echo ""
	@echo "$(YELLOW)3. Testing Frontend (port 5501)...$(NC)"
	@curl -s http://localhost:5501 > /dev/null && echo "$(GREEN)✅ Frontend is running$(NC)" || echo "$(RED)❌ Frontend is NOT running$(NC)"
	@echo ""
	@echo "$(YELLOW)4. Testing Databases...$(NC)"
	@docker ps | grep "ztizen-db" | grep -q "healthy" && echo "$(GREEN)✅ ZTIZEN Database is healthy$(NC)" || echo "$(RED)❌ ZTIZEN Database is NOT healthy$(NC)"
	@docker ps | grep "ztizen-product-db" | grep -q "healthy" && echo "$(GREEN)✅ Product Database is healthy$(NC)" || echo "$(RED)❌ Product Database is NOT healthy$(NC)"

# Quick setup (run everything in order)
setup: check-docker clean-all install docker-up db-reset
	@echo ""
	@echo "$(GREEN)✅ Setup complete! Now start services:$(NC)"
	@echo ""
	@echo "Terminal 1: make dev-ztizen"
	@echo "Terminal 2: make dev-product"
	@echo "Terminal 3: make dev-frontend"

# ============================================================================
# New Migration-Based Database Management
# ============================================================================

# Database configuration
PRODUCT_CONTAINER=ztizen-product-db
PRODUCT_USER=product
PRODUCT_DB=product

ZTIZEN_CONTAINER=ztizen-db
ZTIZEN_USER=ztizen
ZTIZEN_DB=ztizen

# Project paths
PROJECT_ROOT=$(shell pwd)
PRODUCT_MIGRATIONS=$(PROJECT_ROOT)/product-service/sql/migrations
ZTIZEN_MIGRATIONS=$(PROJECT_ROOT)/ztizen-service/sql/migrations

# Terminate all database connections
db-terminate:
	@echo "$(YELLOW)1️⃣  Terminating database connections...$(NC)"
	@docker exec $(PRODUCT_CONTAINER) psql -U $(PRODUCT_USER) -d postgres -c \
		"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$(PRODUCT_DB)';" \
		> /dev/null 2>&1 || true
	@docker exec $(ZTIZEN_CONTAINER) psql -U $(ZTIZEN_USER) -d postgres -c \
		"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$(ZTIZEN_DB)';" \
		> /dev/null 2>&1 || true
	@sleep 1
	@echo "   $(GREEN)✓$(NC) Connections terminated"

# Drop both databases
db-drop: db-terminate
	@echo "$(YELLOW)2️⃣  Dropping databases...$(NC)"
	@docker exec $(PRODUCT_CONTAINER) psql -U $(PRODUCT_USER) -d postgres -c \
		"DROP DATABASE IF EXISTS $(PRODUCT_DB);" > /dev/null 2>&1
	@docker exec $(ZTIZEN_CONTAINER) psql -U $(ZTIZEN_USER) -d postgres -c \
		"DROP DATABASE IF EXISTS $(ZTIZEN_DB);" > /dev/null 2>&1
	@echo "   $(GREEN)✓$(NC) Databases dropped"

# Create both databases
db-create:
	@echo "$(YELLOW)3️⃣  Creating databases...$(NC)"
	@docker exec $(PRODUCT_CONTAINER) psql -U $(PRODUCT_USER) -d postgres -c \
		"CREATE DATABASE $(PRODUCT_DB);" > /dev/null 2>&1
	@docker exec $(ZTIZEN_CONTAINER) psql -U $(ZTIZEN_USER) -d postgres -c \
		"CREATE DATABASE $(ZTIZEN_DB);" > /dev/null 2>&1
	@echo "   $(GREEN)✓$(NC) Databases created"

# Run all migrations (up)
db-migrate-up:
	@echo "$(YELLOW)4️⃣  Running migrations...$(NC)"
	@echo "   → Product Service schema..."
	@docker exec -i $(PRODUCT_CONTAINER) psql -U $(PRODUCT_USER) -d $(PRODUCT_DB) \
		< $(PRODUCT_MIGRATIONS)/001_initial_schema.up.sql > /dev/null 2>&1
	@echo "   $(GREEN)✓$(NC) Product schema created"
	@echo "   → Product Service seed data..."
	@docker exec -i $(PRODUCT_CONTAINER) psql -U $(PRODUCT_USER) -d $(PRODUCT_DB) \
		< $(PRODUCT_MIGRATIONS)/002_seed_demo_bank.up.sql > /dev/null 2>&1
	@echo "   $(GREEN)✓$(NC) Product seed data loaded"
	@echo "   → Product Service verification requests..."
	@docker exec -i $(PRODUCT_CONTAINER) psql -U $(PRODUCT_USER) -d $(PRODUCT_DB) \
		< $(PRODUCT_MIGRATIONS)/003_verification_requests.up.sql > /dev/null 2>&1
	@echo "   $(GREEN)✓$(NC) Verification requests table created"
	@echo "   → Product Service tx_hash column..."
	@docker exec -i $(PRODUCT_CONTAINER) psql -U $(PRODUCT_USER) -d $(PRODUCT_DB) \
		< $(PRODUCT_MIGRATIONS)/004_add_tx_hash_column.up.sql > /dev/null 2>&1 || true
	@echo "   $(GREEN)✓$(NC) tx_hash column added"
	@echo "   → ZTIZEN Service schema..."
	@docker exec -i $(ZTIZEN_CONTAINER) psql -U $(ZTIZEN_USER) -d $(ZTIZEN_DB) \
		< $(ZTIZEN_MIGRATIONS)/001_initial_schema.up.sql > /dev/null 2>&1
	@echo "   $(GREEN)✓$(NC) ZTIZEN schema created"
	@echo "   → ZTIZEN verification request tracking..."
	@docker exec -i $(ZTIZEN_CONTAINER) psql -U $(ZTIZEN_USER) -d $(ZTIZEN_DB) \
		< $(ZTIZEN_MIGRATIONS)/002_verification_request_tracking.up.sql > /dev/null 2>&1
	@echo "   $(GREEN)✓$(NC) ZTIZEN verification tracking table created"

# Rollback all migrations (down)
db-migrate-down:
	@echo "$(YELLOW)Rolling back migrations...$(NC)"
	@echo "   → ZTIZEN verification tracking..."
	@docker exec -i $(ZTIZEN_CONTAINER) psql -U $(ZTIZEN_USER) -d $(ZTIZEN_DB) \
		< $(ZTIZEN_MIGRATIONS)/002_verification_request_tracking.down.sql > /dev/null 2>&1 || true
	@echo "   $(GREEN)✓$(NC) ZTIZEN verification tracking dropped"
	@echo "   → ZTIZEN Service schema..."
	@docker exec -i $(ZTIZEN_CONTAINER) psql -U $(ZTIZEN_USER) -d $(ZTIZEN_DB) \
		< $(ZTIZEN_MIGRATIONS)/001_initial_schema.down.sql > /dev/null 2>&1 || true
	@echo "   $(GREEN)✓$(NC) ZTIZEN schema dropped"
	@echo "   → Product Service tx_hash column..."
	@docker exec -i $(PRODUCT_CONTAINER) psql -U $(PRODUCT_USER) -d $(PRODUCT_DB) \
		< $(PRODUCT_MIGRATIONS)/004_add_tx_hash_column.down.sql > /dev/null 2>&1 || true
	@echo "   $(GREEN)✓$(NC) tx_hash column removed"
	@echo "   → Product Service verification requests..."
	@docker exec -i $(PRODUCT_CONTAINER) psql -U $(PRODUCT_USER) -d $(PRODUCT_DB) \
		< $(PRODUCT_MIGRATIONS)/003_verification_requests.down.sql > /dev/null 2>&1 || true
	@echo "   $(GREEN)✓$(NC) Verification requests table dropped"
	@echo "   → Product Service seed..."
	@docker exec -i $(PRODUCT_CONTAINER) psql -U $(PRODUCT_USER) -d $(PRODUCT_DB) \
		< $(PRODUCT_MIGRATIONS)/002_seed_demo_bank.down.sql > /dev/null 2>&1 || true
	@echo "   $(GREEN)✓$(NC) Product seed data removed"
	@echo "   → Product Service schema..."
	@docker exec -i $(PRODUCT_CONTAINER) psql -U $(PRODUCT_USER) -d $(PRODUCT_DB) \
		< $(PRODUCT_MIGRATIONS)/001_initial_schema.down.sql > /dev/null 2>&1 || true
	@echo "   $(GREEN)✓$(NC) Product schema dropped"

# Full setup (create + migrate)
db-setup: db-create db-migrate-up
	@echo ""
	@echo "$(GREEN)✅ Database setup complete!$(NC)"
	@echo ""
	@$(MAKE) --no-print-directory db-status

# Full reset (drop + create + migrate)
db-reset:
	@echo "$(GREEN)🔄 ZTIZEN Database Reset$(NC)"
	@echo "$(GREEN)=======================$(NC)"
	@echo ""
	@$(MAKE) --no-print-directory db-drop
	@$(MAKE) --no-print-directory db-create
	@$(MAKE) --no-print-directory db-migrate-up
	@echo ""
	@echo "$(GREEN)✅ Database reset complete!$(NC)"
	@echo ""
	@$(MAKE) --no-print-directory db-status

# Show database status
db-status:
	@echo "$(GREEN)📊 Database Status$(NC)"
	@echo "$(GREEN)==================$(NC)"
	@echo ""
	@echo "$(YELLOW)Product Service:$(NC)"
	@docker exec $(PRODUCT_CONTAINER) psql -U $(PRODUCT_USER) -d $(PRODUCT_DB) -c \
		"SELECT p.product_name, ps.service_name, ps.service_type \
		FROM products p JOIN product_services ps ON p.id = ps.product_id ORDER BY ps.service_name;" 2>/dev/null || \
		echo "   $(RED)✗$(NC) Database not initialized"
	@echo ""
	@echo "$(YELLOW)User Credentials (per-user keys):$(NC)"
	@docker exec $(PRODUCT_CONTAINER) psql -U $(PRODUCT_USER) -d $(PRODUCT_DB) -c \
		"SELECT LEFT(user_id, 10) || '...' as user, ps.service_name, LEFT(uc.product_partial_key, 16) || '...' as user_key, uc.status \
		FROM user_credentials uc JOIN product_services ps ON uc.service_id = ps.id ORDER BY uc.created_at DESC LIMIT 5;" 2>/dev/null || \
		echo "   No user enrollments yet"
	@echo ""
	@echo "$(YELLOW)Verification Requests:$(NC)"
	@docker exec $(PRODUCT_CONTAINER) psql -U $(PRODUCT_USER) -d $(PRODUCT_DB) -t -A -c \
		"SELECT COUNT(*) FROM verification_requests;" 2>/dev/null | \
		xargs -I {} echo "   Total requests: {}" || \
		echo "   $(RED)✗$(NC) Verification requests table not found"
	@echo ""
	@echo "$(YELLOW)ZTIZEN Service:$(NC)"
	@docker exec $(ZTIZEN_CONTAINER) psql -U $(ZTIZEN_USER) -d $(ZTIZEN_DB) -t -A -c \
		"SELECT COUNT(*) FROM credentials;" 2>/dev/null | \
		xargs -I {} echo "   Credentials: {}" || \
		echo "   $(RED)✗$(NC) Database not initialized"
	@docker exec $(ZTIZEN_CONTAINER) psql -U $(ZTIZEN_USER) -d $(ZTIZEN_DB) -t -A -c \
		"SELECT COUNT(*) FROM verification_transactions;" 2>/dev/null | \
		xargs -I {} echo "   Verification transactions: {}" || \
		echo "   $(RED)✗$(NC) Verification transactions table not found"
	@echo ""
	@echo "$(GREEN)🎯 Next Steps:$(NC)"
	@echo "   1. Go to http://localhost:5501/product"
	@echo "   2. Select a service (Login/Transfer/Balance)"
	@echo "   3. Click 'Enroll' to register new biometric"
	@echo "   4. Each user gets unique keys per service (stored in user_credentials)"
	@echo "   5. After enrollment, verify to create verification request with request_id"
	@echo ""

# ============================================================================
# Enhanced Cleanup and Setup Commands
# ============================================================================

# Complete cleanup (removes everything)
cleanup: kill-all-ports
	@echo "$(RED)🧹 COMPLETE CLEANUP - This will remove everything!$(NC)"
	@echo "$(YELLOW)Checking Docker status...$(NC)"
	@if docker info > /dev/null 2>&1; then \
		echo "$(YELLOW)Stopping Docker containers...$(NC)"; \
		docker-compose -f docker-compose.dev.yml down -v 2>/dev/null || true; \
		echo "$(YELLOW)Removing Docker volumes...$(NC)"; \
		docker volume rm ztizen_ztizen-db-data 2>/dev/null || true; \
		docker volume rm ztizen_ztizen-product-db-data 2>/dev/null || true; \
		docker volume rm ztizen_redis-data 2>/dev/null || true; \
	else \
		echo "$(YELLOW)Docker not running - skipping container cleanup$(NC)"; \
	fi
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	@rm -rf vite-demo/node_modules/.vite 2>/dev/null || true
	@rm -rf vite-demo/dist 2>/dev/null || true
	@rm -rf ztizen-service/dist 2>/dev/null || true
	@rm -rf product-service/dist 2>/dev/null || true
	@echo "$(GREEN)✅ Complete cleanup done!$(NC)"
	@echo ""
	@echo "$(YELLOW)To start fresh, run:$(NC)"
	@echo "  make ensure-setup"

# Check if Docker is running
check-docker:
	@docker info > /dev/null 2>&1 || (echo "$(RED)❌ Docker is not running. Please start Docker Desktop first!$(NC)" && exit 1)

# Ensure complete setup (guaranteed to work from any state)
ensure-setup: check-docker cleanup
	@echo "$(GREEN)🚀 ZTIZEN - Complete Setup (from scratch)$(NC)"
	@echo "=========================================="
	@echo ""
	@echo "$(YELLOW)1️⃣  Installing dependencies...$(NC)"
	@cd ztizen-service && pnpm install > /dev/null 2>&1
	@cd product-service && pnpm install > /dev/null 2>&1
	@cd vite-demo && pnpm install > /dev/null 2>&1
	@echo "   $(GREEN)✓$(NC) Dependencies installed"
	@echo ""
	@echo "$(YELLOW)2️⃣  Starting Docker containers...$(NC)"
	@docker-compose -f docker-compose.dev.yml up -d ztizen-db ztizen-product-db > /dev/null 2>&1
	@sleep 5
	@echo "   $(GREEN)✓$(NC) Docker containers started"
	@echo ""
	@echo "$(YELLOW)3️⃣  Setting up databases with migrations...$(NC)"
	@$(MAKE) --no-print-directory db-reset
	@echo ""
	@echo "$(GREEN)🎉 SETUP COMPLETE!$(NC)"
	@echo "=================="
	@echo ""
	@echo "$(GREEN)✅ All components are ready:$(NC)"
	@echo "   • Docker containers running"
	@echo "   • Databases configured with correct schema"
	@echo "   • tx_hash column present in verification_requests"
	@echo "   • Demo data seeded"
	@echo "   • Dependencies installed"
	@echo ""
	@echo "$(YELLOW)📋 To start the services:$(NC)"
	@echo "   Terminal 1: $(GREEN)make dev-ztizen$(NC)"
	@echo "   Terminal 2: $(GREEN)make dev-product$(NC)"
	@echo "   Terminal 3: $(GREEN)make dev-frontend$(NC)"
	@echo ""
	@echo "$(YELLOW)Or test the setup:$(NC)"
	@echo "   $(GREEN)make test-services$(NC)"
	@echo ""

# ============================================================================
# Docker Commands (Production & Full Stack)
# ============================================================================

# Build all Docker images
docker-build:
	@echo "$(GREEN)🔨 Building all Docker images...$(NC)"
	@echo ""
	@echo "$(YELLOW)Building ZTIZEN API...$(NC)"
	docker build -t ztizen-api:latest ./ztizen-service
	@echo "$(GREEN)✅ ZTIZEN API built$(NC)"
	@echo ""
	@echo "$(YELLOW)Building Product API...$(NC)"
	docker build -t ztizen-product-api:latest ./product-service
	@echo "$(GREEN)✅ Product API built$(NC)"
	@echo ""
	@echo "$(YELLOW)Building Frontend...$(NC)"
	docker build -t vite-demo:latest ./vite-demo
	@echo "$(GREEN)✅ Frontend built$(NC)"
	@echo ""
	@echo "$(GREEN)🎉 All images built successfully!$(NC)"

# Start production stack (all services in Docker)
docker-prod:
	@echo "$(GREEN)🚀 Starting ZTIZEN Production Stack...$(NC)"
	@echo ""
	@echo "Architecture:"
	@echo "  ├── vite-demo       (Frontend)   → Port 5501"
	@echo "  ├── ztizen-api      (Service)    → Port 5502"
	@echo "  ├── ztizen-product-api (Service) → Port 5503"
	@echo "  ├── ztizen-db       (Database)   → Port 5504"
	@echo "  └── ztizen-product-db (Database) → Port 5505"
	@echo ""
	docker-compose up --build -d
	@echo ""
	@echo "$(GREEN)✅ Production stack is running!$(NC)"
	@echo ""
	@echo "$(YELLOW)Access the application:$(NC)"
	@echo "  Frontend: http://localhost:5501"
	@echo "  ZTIZEN API: http://localhost:5502"
	@echo "  Product API: http://localhost:5503"
	@echo ""
	@echo "$(YELLOW)View logs:$(NC)"
	@echo "  make docker-prod-logs"

# Stop production stack
docker-prod-down:
	@echo "$(YELLOW)🛑 Stopping production stack...$(NC)"
	docker-compose down
	@echo "$(GREEN)✅ Production stack stopped$(NC)"

# View production logs
docker-prod-logs:
	@echo "$(GREEN)📋 Production logs (Ctrl+C to exit):$(NC)"
	docker-compose logs -f

# Start all services in Docker (development mode)
docker-all:
	@echo "$(GREEN)🐳 Starting full Docker development stack...$(NC)"
	@echo ""
	docker-compose -f docker-compose.dev.yml --profile all up --build -d
	@echo ""
	@echo "$(GREEN)✅ All services running in Docker!$(NC)"
	@echo ""
	@echo "$(YELLOW)Access the application:$(NC)"
	@echo "  Frontend: http://localhost:5501"
	@echo "  ZTIZEN API: http://localhost:5502"
	@echo "  Product API: http://localhost:5503"

# Stop all Docker development services
docker-all-down:
	@echo "$(YELLOW)🛑 Stopping all Docker services...$(NC)"
	docker-compose -f docker-compose.dev.yml --profile all down
	@echo "$(GREEN)✅ All services stopped$(NC)"
