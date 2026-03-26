.PHONY: help clean setup start stop restart logs db-shell db-reset dev

# Colors for output
GREEN  := \033[0;32m
YELLOW := \033[0;33m
RED    := \033[0;31m
NC     := \033[0m # No Color

help: ## Show this help message
	@echo "$(GREEN)ZTIZEN Service - Make Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-15s$(NC) %s\n", $$1, $$2}'
	@echo ""

clean: ## Stop and remove all containers, volumes, and database
	@echo "$(RED)🧹 Cleaning up...$(NC)"
	@docker-compose down -v
	@echo "$(GREEN)✅ Cleanup completed$(NC)"

setup: clean ## Clean and setup fresh database with Docker
	@echo "$(GREEN)🚀 Setting up ZTIZEN database...$(NC)"
	@echo ""
	@echo "$(YELLOW)Step 1: Starting PostgreSQL in Docker...$(NC)"
	@docker-compose up -d postgres
	@echo ""
	@echo "$(YELLOW)Step 2: Waiting for PostgreSQL to be ready...$(NC)"
	@sleep 5
	@docker-compose exec -T postgres pg_isready -U postgres || (echo "$(RED)❌ PostgreSQL not ready$(NC)" && exit 1)
	@echo "$(GREEN)✅ PostgreSQL is ready$(NC)"
	@echo ""
	@echo "$(YELLOW)Step 3: Running database schema...$(NC)"
	@docker-compose exec -T postgres psql -U postgres -d ztizen_db -f - < sql/schema.sql
	@echo ""
	@echo "$(GREEN)✅ Database setup completed!$(NC)"
	@echo ""
	@echo "$(YELLOW)📊 Database Info:$(NC)"
	@echo "  Host: localhost"
	@echo "  Port: 5432"
	@echo "  Database: ztizen_db"
	@echo "  User: postgres"
	@echo "  Password: postgres"
	@echo ""
	@echo "$(YELLOW)🔗 Connection string:$(NC)"
	@echo "  postgresql://postgres:postgres@localhost:5432/ztizen_db"
	@echo ""

start: ## Start all services (PostgreSQL)
	@echo "$(GREEN)▶️  Starting services...$(NC)"
	@docker-compose up -d
	@echo "$(GREEN)✅ Services started$(NC)"

stop: ## Stop all services
	@echo "$(YELLOW)⏸️  Stopping services...$(NC)"
	@docker-compose stop
	@echo "$(GREEN)✅ Services stopped$(NC)"

restart: stop start ## Restart all services

logs: ## View Docker logs
	@docker-compose logs -f postgres

db-shell: ## Open PostgreSQL shell
	@docker-compose exec postgres psql -U postgres -d ztizen_db

db-reset: ## Reset database (drop and recreate schema)
	@echo "$(YELLOW)🔄 Resetting database...$(NC)"
	@docker-compose exec -T postgres psql -U postgres -d ztizen_db -c "DROP TABLE IF EXISTS verification_transactions CASCADE;"
	@docker-compose exec -T postgres psql -U postgres -d ztizen_db -c "DROP TABLE IF EXISTS verification_logs CASCADE;"
	@docker-compose exec -T postgres psql -U postgres -d ztizen_db -c "DROP TABLE IF EXISTS credentials CASCADE;"
	@docker-compose exec -T postgres psql -U postgres -d ztizen_db -c "DROP TABLE IF EXISTS users CASCADE;"
	@docker-compose exec -T postgres psql -U postgres -d ztizen_db -f - < sql/schema.sql
	@echo "$(GREEN)✅ Database reset completed$(NC)"

dev: setup ## Setup database and start development server
	@echo "$(GREEN)🚀 Starting development server...$(NC)"
	@npm run dev
