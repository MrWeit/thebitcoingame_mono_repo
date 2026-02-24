# ============================================================================
# The Bitcoin Game — Development Makefile
# ============================================================================
# Usage: make <target>
#   make help          — Show all available targets
#   make up            — Start all services (Docker + dashboard)
#   make test          — Run all tests (backend + frontend)
# ============================================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help

# Paths
ROOT_DIR     := $(shell pwd)
SERVICES_DIR := $(ROOT_DIR)/services
API_DIR      := $(SERVICES_DIR)/api
DASHBOARD_DIR:= $(ROOT_DIR)/dashboard
COMPOSE      := docker compose -f $(SERVICES_DIR)/docker-compose.yml

# Colors
CYAN  := \033[36m
GREEN := \033[32m
YELLOW:= \033[33m
RED   := \033[31m
RESET := \033[0m
BOLD  := \033[1m

# ── Help ────────────────────────────────────────────────────────────────────

help: ## Show this help
	@printf "$(BOLD)$(CYAN)The Bitcoin Game — Development Commands$(RESET)\n\n"
	@printf "$(BOLD)Usage:$(RESET) make $(GREEN)<target>$(RESET)\n\n"
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { \
		printf "  $(GREEN)%-22s$(RESET) %s\n", $$1, $$2 \
	}' $(MAKEFILE_LIST)
	@printf "\n"

# ── Infrastructure (Docker) ────────────────────────────────────────────────

.PHONY: infra infra-up infra-down infra-logs infra-ps infra-clean

infra-up: ## Start infrastructure only (DB, Redis, Bitcoin, Prometheus, Grafana)
	$(COMPOSE) up -d bitcoin-signet redis timescaledb prometheus grafana
	@printf "$(GREEN)Infrastructure started.$(RESET)\n"
	@printf "  Redis:       localhost:6379\n"
	@printf "  TimescaleDB: localhost:5432\n"
	@printf "  Bitcoin RPC: localhost:38332\n"
	@printf "  Prometheus:  http://localhost:9090\n"
	@printf "  Grafana:     http://localhost:3030 (admin/tbgdev2026)\n"

infra-down: ## Stop infrastructure
	$(COMPOSE) down

infra-logs: ## Tail infrastructure logs
	$(COMPOSE) logs -f redis timescaledb bitcoin-signet

infra-ps: ## Show running containers
	$(COMPOSE) ps

infra-clean: ## Stop everything and remove volumes (DESTRUCTIVE)
	@printf "$(RED)This will destroy all data volumes. Are you sure? [y/N] $(RESET)" && \
	read ans && [ "$${ans:-N}" = y ] && \
	$(COMPOSE) down -v --remove-orphans || printf "$(YELLOW)Cancelled.$(RESET)\n"

# ── Full Stack ──────────────────────────────────────────────────────────────

.PHONY: up down restart logs ps

up: ## Start everything (Docker services + dashboard dev server)
	$(COMPOSE) up -d
	@printf "\n$(GREEN)Docker services started.$(RESET)\n"
	@printf "  API:             http://localhost:8000\n"
	@printf "  API Docs:        http://localhost:8000/docs\n"
	@printf "  WebSocket:       ws://localhost:8000/ws\n"
	@printf "  Stratum (pool):  localhost:3333\n"
	@printf "  Redis:           localhost:6379\n"
	@printf "  TimescaleDB:     localhost:5432\n"
	@printf "  Prometheus:      http://localhost:9090\n"
	@printf "  Grafana:         http://localhost:3030\n"
	@printf "\n$(YELLOW)Starting dashboard dev server...$(RESET)\n"
	@printf "  Dashboard:       http://localhost:5173\n\n"
	cd $(DASHBOARD_DIR) && npm run dev

down: ## Stop everything
	$(COMPOSE) down
	@printf "$(GREEN)All services stopped.$(RESET)\n"

restart: down up ## Restart everything

logs: ## Tail all Docker logs
	$(COMPOSE) logs -f

ps: ## Show all container statuses
	$(COMPOSE) ps -a

# ── Backend API ─────────────────────────────────────────────────────────────

.PHONY: api api-up api-logs api-shell api-lint api-test api-test-cov api-migrate api-migrate-new api-worker

api-up: ## Start API + dependencies (DB, Redis) in Docker
	$(COMPOSE) up -d timescaledb redis api event-consumer
	@printf "$(GREEN)API running at http://localhost:8000$(RESET)\n"
	@printf "  Docs: http://localhost:8000/docs\n"

api-logs: ## Tail API container logs
	$(COMPOSE) logs -f api event-consumer

api-shell: ## Open a shell in the API container
	$(COMPOSE) exec api bash

api-local: ## Run API locally (requires DB + Redis running)
	cd $(API_DIR) && \
	TBG_DATABASE_URL=postgresql+asyncpg://tbg:tbgdev2026@localhost:5432/thebitcoingame \
	TBG_REDIS_URL=redis://localhost:6379/0 \
	TBG_DEBUG=true \
	TBG_ENVIRONMENT=development \
	TBG_LOG_LEVEL=DEBUG \
	TBG_BTC_NETWORK=signet \
	TBG_JWT_PRIVATE_KEY_PATH=$(API_DIR)/keys/jwt_private.pem \
	TBG_JWT_PUBLIC_KEY_PATH=$(API_DIR)/keys/jwt_public.pem \
	TBG_CORS_ORIGINS='["http://localhost:5173"]' \
	python -m uvicorn tbg.main:app --reload --host 0.0.0.0 --port 8000

api-worker: ## Run arq event consumer locally
	cd $(API_DIR) && \
	TBG_DATABASE_URL=postgresql+asyncpg://tbg:tbgdev2026@localhost:5432/thebitcoingame \
	TBG_REDIS_URL=redis://localhost:6379/0 \
	TBG_CONSUMER_NAME=local-worker-1 \
	python -m tbg.workers.event_consumer_runner

api-lint: ## Lint backend with ruff
	cd $(API_DIR) && python -m ruff check src/ tests/
	@printf "$(GREEN)Lint passed.$(RESET)\n"

api-lint-fix: ## Auto-fix lint issues
	cd $(API_DIR) && python -m ruff check --fix src/ tests/

api-typecheck: ## Run mypy type checking
	cd $(API_DIR) && python -m mypy src/tbg/

api-test: ## Run backend tests (requires DB + Redis)
	$(COMPOSE) up -d timescaledb redis
	@printf "$(YELLOW)Waiting for services...$(RESET)\n"
	@sleep 3
	cd $(API_DIR) && \
	TBG_DATABASE_URL=postgresql+asyncpg://tbg:tbgdev2026@localhost:5432/thebitcoingame \
	TBG_REDIS_URL=redis://localhost:6379/0 \
	TBG_BTC_NETWORK=mainnet \
	TBG_JWT_PRIVATE_KEY_PATH=$(API_DIR)/keys/jwt_private.pem \
	TBG_JWT_PUBLIC_KEY_PATH=$(API_DIR)/keys/jwt_public.pem \
	python -m pytest tests/ -v

api-test-cov: ## Run backend tests with coverage report
	$(COMPOSE) up -d timescaledb redis
	@sleep 3
	cd $(API_DIR) && \
	TBG_DATABASE_URL=postgresql+asyncpg://tbg:tbgdev2026@localhost:5432/thebitcoingame \
	TBG_REDIS_URL=redis://localhost:6379/0 \
	TBG_BTC_NETWORK=mainnet \
	TBG_JWT_PRIVATE_KEY_PATH=$(API_DIR)/keys/jwt_private.pem \
	TBG_JWT_PUBLIC_KEY_PATH=$(API_DIR)/keys/jwt_public.pem \
	python -m pytest tests/ -v --cov=src/tbg --cov-report=term-missing --cov-report=html:htmlcov

api-test-phase: ## Run tests for a specific phase (usage: make api-test-phase P=ws)
	$(COMPOSE) up -d timescaledb redis
	@sleep 3
	cd $(API_DIR) && \
	TBG_DATABASE_URL=postgresql+asyncpg://tbg:tbgdev2026@localhost:5432/thebitcoingame \
	TBG_REDIS_URL=redis://localhost:6379/0 \
	TBG_BTC_NETWORK=mainnet \
	TBG_JWT_PRIVATE_KEY_PATH=$(API_DIR)/keys/jwt_private.pem \
	TBG_JWT_PUBLIC_KEY_PATH=$(API_DIR)/keys/jwt_public.pem \
	python -m pytest tests/$(P)/ -v

api-migrate: ## Run Alembic migrations
	$(COMPOSE) up -d timescaledb
	@sleep 2
	cd $(API_DIR) && \
	TBG_DATABASE_URL=postgresql+asyncpg://tbg:tbgdev2026@localhost:5432/thebitcoingame \
	python -m alembic upgrade head
	@printf "$(GREEN)Migrations applied.$(RESET)\n"

api-migrate-new: ## Create a new migration (usage: make api-migrate-new M="add foo table")
	cd $(API_DIR) && python -m alembic revision --autogenerate -m "$(M)"

api-health: ## Check API health endpoint
	@curl -sf http://localhost:8000/health | python3 -m json.tool || \
	printf "$(RED)API is not running.$(RESET)\n"

api-rebuild: ## Rebuild API Docker image
	$(COMPOSE) build api
	$(COMPOSE) up -d api event-consumer
	@printf "$(GREEN)API rebuilt and restarted.$(RESET)\n"

# ── Dashboard (Frontend) ───────────────────────────────────────────────────

.PHONY: dash dash-dev dash-build dash-preview dash-test dash-lint dash-typecheck dash-install

dash-dev: ## Start dashboard dev server
	cd $(DASHBOARD_DIR) && npm run dev

dash-build: ## Build dashboard for production
	cd $(DASHBOARD_DIR) && npm run build
	@printf "$(GREEN)Dashboard built to dashboard/dist/$(RESET)\n"

dash-preview: ## Preview production build
	cd $(DASHBOARD_DIR) && npm run preview

dash-test: ## Run frontend Vitest tests
	cd $(DASHBOARD_DIR) && npx vitest run

dash-test-watch: ## Run frontend tests in watch mode
	cd $(DASHBOARD_DIR) && npx vitest

dash-test-ui: ## Run frontend tests with Vitest UI
	cd $(DASHBOARD_DIR) && npx vitest --ui

dash-lint: ## Lint frontend with ESLint
	cd $(DASHBOARD_DIR) && npm run lint

dash-typecheck: ## Type-check frontend with tsc
	cd $(DASHBOARD_DIR) && npx tsc --noEmit
	@printf "$(GREEN)TypeScript check passed.$(RESET)\n"

dash-install: ## Install dashboard npm dependencies
	cd $(DASHBOARD_DIR) && npm install
	@printf "$(GREEN)Dependencies installed.$(RESET)\n"

# ── Run All Tests ──────────────────────────────────────────────────────────

.PHONY: test test-all test-quick

test: test-all ## Run all tests (alias)

test-all: ## Run all tests (backend + frontend + type checks)
	@printf "$(BOLD)$(CYAN)━━━ Backend Tests ━━━$(RESET)\n"
	@$(MAKE) api-test
	@printf "\n$(BOLD)$(CYAN)━━━ Frontend Tests ━━━$(RESET)\n"
	@$(MAKE) dash-test
	@printf "\n$(BOLD)$(CYAN)━━━ Frontend Type Check ━━━$(RESET)\n"
	@$(MAKE) dash-typecheck
	@printf "\n$(BOLD)$(GREEN)All tests passed!$(RESET)\n"

test-quick: ## Run quick tests only (frontend unit tests + type check, no Docker needed)
	@printf "$(BOLD)$(CYAN)━━━ Frontend Tests ━━━$(RESET)\n"
	@$(MAKE) dash-test
	@printf "\n$(BOLD)$(CYAN)━━━ Frontend Type Check ━━━$(RESET)\n"
	@$(MAKE) dash-typecheck
	@printf "\n$(BOLD)$(GREEN)Quick tests passed!$(RESET)\n"

# ── Code Quality ───────────────────────────────────────────────────────────

.PHONY: lint lint-fix typecheck fmt

lint: ## Lint everything (backend + frontend)
	@printf "$(BOLD)$(CYAN)━━━ Backend Lint ━━━$(RESET)\n"
	@$(MAKE) api-lint
	@printf "\n$(BOLD)$(CYAN)━━━ Frontend Lint ━━━$(RESET)\n"
	@$(MAKE) dash-lint

lint-fix: ## Auto-fix lint issues
	@$(MAKE) api-lint-fix
	@cd $(DASHBOARD_DIR) && npm run lint -- --fix

typecheck: ## Type-check everything
	@printf "$(BOLD)$(CYAN)━━━ Backend (mypy) ━━━$(RESET)\n"
	@$(MAKE) api-typecheck
	@printf "\n$(BOLD)$(CYAN)━━━ Frontend (tsc) ━━━$(RESET)\n"
	@$(MAKE) dash-typecheck

# ── Database ───────────────────────────────────────────────────────────────

.PHONY: db-up db-shell db-reset db-dump

db-up: ## Start TimescaleDB
	$(COMPOSE) up -d timescaledb
	@printf "$(GREEN)TimescaleDB running on localhost:5432$(RESET)\n"

db-shell: ## Open psql shell to the database
	$(COMPOSE) exec timescaledb psql -U tbg thebitcoingame

db-reset: ## Reset database (drop all tables, re-run migrations)
	@printf "$(RED)This will destroy all database data. Are you sure? [y/N] $(RESET)" && \
	read ans && [ "$${ans:-N}" = y ] && ( \
		$(COMPOSE) exec timescaledb psql -U tbg thebitcoingame -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" && \
		$(MAKE) api-migrate \
	) || printf "$(YELLOW)Cancelled.$(RESET)\n"

db-dump: ## Dump database to file
	$(COMPOSE) exec timescaledb pg_dump -U tbg thebitcoingame > $(ROOT_DIR)/backup-$$(date +%Y%m%d-%H%M%S).sql
	@printf "$(GREEN)Database dumped.$(RESET)\n"

# ── Redis ──────────────────────────────────────────────────────────────────

.PHONY: redis-up redis-cli redis-flush redis-monitor

redis-up: ## Start Redis
	$(COMPOSE) up -d redis
	@printf "$(GREEN)Redis running on localhost:6379$(RESET)\n"

redis-cli: ## Open redis-cli
	$(COMPOSE) exec redis redis-cli

redis-flush: ## Flush all Redis data
	$(COMPOSE) exec redis redis-cli FLUSHALL
	@printf "$(YELLOW)Redis flushed.$(RESET)\n"

redis-monitor: ## Monitor Redis commands in real-time
	$(COMPOSE) exec redis redis-cli MONITOR

# ── Mining / CKPool ───────────────────────────────────────────────────────

.PHONY: pool-up pool-logs pool-test

pool-up: ## Start CKPool + Bitcoin + dependencies
	$(COMPOSE) up -d bitcoin-signet ckpool redis event-collector
	@printf "$(GREEN)Mining stack started.$(RESET)\n"
	@printf "  Stratum: localhost:3333\n"

pool-logs: ## Tail CKPool logs
	$(COMPOSE) logs -f ckpool

pool-test: ## Test Stratum connection with cpuminer
	@printf "$(YELLOW)Connecting cpuminer to localhost:3333...$(RESET)\n"
	@command -v minerd >/dev/null 2>&1 && \
	minerd -a sha256d -o stratum+tcp://localhost:3333 -u bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls -p x --no-longpoll -t 1 || \
	printf "$(RED)cpuminer (minerd) not found. Install it or use: make pool-test-docker$(RESET)\n"

# ── JWT Keys ───────────────────────────────────────────────────────────────

.PHONY: keys-gen

keys-gen: ## Generate RS256 JWT key pair for development
	@mkdir -p $(API_DIR)/keys
	openssl genrsa -out $(API_DIR)/keys/jwt_private.pem 2048
	openssl rsa -in $(API_DIR)/keys/jwt_private.pem -pubout -out $(API_DIR)/keys/jwt_public.pem
	@printf "$(GREEN)JWT keys generated at services/api/keys/$(RESET)\n"

# ── Setup ──────────────────────────────────────────────────────────────────

.PHONY: setup install

setup: install keys-gen api-migrate ## Full first-time setup (install deps, generate keys, run migrations)
	@printf "\n$(BOLD)$(GREEN)Setup complete!$(RESET)\n"
	@printf "Run $(CYAN)make up$(RESET) to start everything.\n"

install: ## Install all dependencies
	@printf "$(BOLD)$(CYAN)━━━ Dashboard Dependencies ━━━$(RESET)\n"
	cd $(DASHBOARD_DIR) && npm install
	@printf "\n$(BOLD)$(CYAN)━━━ API Dependencies ━━━$(RESET)\n"
	cd $(API_DIR) && pip install -e ".[dev]"
	@printf "\n$(BOLD)$(GREEN)All dependencies installed.$(RESET)\n"

# ── Docker Build ───────────────────────────────────────────────────────────

.PHONY: build build-all

build-all: ## Build all Docker images
	$(COMPOSE) build
	@printf "$(GREEN)All images built.$(RESET)\n"

build-api: ## Build only API image
	$(COMPOSE) build api
	@printf "$(GREEN)API image built.$(RESET)\n"

build-ckpool: ## Build only CKPool image
	$(COMPOSE) build ckpool
	@printf "$(GREEN)CKPool image built.$(RESET)\n"

# ── Monitoring ─────────────────────────────────────────────────────────────

.PHONY: monitor-up monitor-logs

monitor-up: ## Start monitoring stack (Prometheus + Grafana)
	$(COMPOSE) up -d prometheus grafana
	@printf "$(GREEN)Monitoring started.$(RESET)\n"
	@printf "  Prometheus: http://localhost:9090\n"
	@printf "  Grafana:    http://localhost:3030 (admin/tbgdev2026)\n"

monitor-logs: ## Tail monitoring logs
	$(COMPOSE) logs -f prometheus grafana

# ── Utility ────────────────────────────────────────────────────────────────

.PHONY: clean nuke status urls

status: ## Show status of all services
	@printf "$(BOLD)$(CYAN)━━━ Docker Containers ━━━$(RESET)\n"
	@$(COMPOSE) ps -a 2>/dev/null || printf "$(YELLOW)No containers running.$(RESET)\n"
	@printf "\n$(BOLD)$(CYAN)━━━ Service Health ━━━$(RESET)\n"
	@printf "  API:       " && (curl -sf http://localhost:8000/health > /dev/null 2>&1 && printf "$(GREEN)UP$(RESET)\n" || printf "$(RED)DOWN$(RESET)\n")
	@printf "  Dashboard: " && (curl -sf http://localhost:5173 > /dev/null 2>&1 && printf "$(GREEN)UP$(RESET)\n" || printf "$(RED)DOWN$(RESET)\n")
	@printf "  Redis:     " && ($(COMPOSE) exec -T redis redis-cli ping 2>/dev/null | grep -q PONG && printf "$(GREEN)UP$(RESET)\n" || printf "$(RED)DOWN$(RESET)\n")
	@printf "  Postgres:  " && ($(COMPOSE) exec -T timescaledb pg_isready -U tbg 2>/dev/null | grep -q "accepting" && printf "$(GREEN)UP$(RESET)\n" || printf "$(RED)DOWN$(RESET)\n")
	@printf "  Prometheus:" && (curl -sf http://localhost:9090/-/healthy > /dev/null 2>&1 && printf " $(GREEN)UP$(RESET)\n" || printf " $(RED)DOWN$(RESET)\n")
	@printf "  Grafana:   " && (curl -sf http://localhost:3030/api/health > /dev/null 2>&1 && printf "$(GREEN)UP$(RESET)\n" || printf "$(RED)DOWN$(RESET)\n")

urls: ## Print all service URLs
	@printf "$(BOLD)$(CYAN)Service URLs:$(RESET)\n"
	@printf "  Dashboard:      $(GREEN)http://localhost:5173$(RESET)\n"
	@printf "  API:            $(GREEN)http://localhost:8000$(RESET)\n"
	@printf "  API Docs:       $(GREEN)http://localhost:8000/docs$(RESET)\n"
	@printf "  WebSocket:      $(GREEN)ws://localhost:8000/ws?token=<jwt>$(RESET)\n"
	@printf "  Stratum:        $(GREEN)stratum+tcp://localhost:3333$(RESET)\n"
	@printf "  Redis:          $(GREEN)localhost:6379$(RESET)\n"
	@printf "  TimescaleDB:    $(GREEN)localhost:5432$(RESET)\n"
	@printf "  Prometheus:     $(GREEN)http://localhost:9090$(RESET)\n"
	@printf "  Grafana:        $(GREEN)http://localhost:3030$(RESET)  (admin/tbgdev2026)\n"
	@printf "  Bitcoin RPC:    $(GREEN)localhost:38332$(RESET)  (tbg/tbgdev2026)\n"
	@printf "  CKPool Metrics: $(GREEN)http://localhost:9100/metrics$(RESET)\n"

clean: ## Remove build artifacts and caches
	rm -rf $(DASHBOARD_DIR)/dist $(DASHBOARD_DIR)/node_modules/.vite
	rm -rf $(API_DIR)/htmlcov $(API_DIR)/.coverage $(API_DIR)/.pytest_cache
	find $(API_DIR) -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	@printf "$(GREEN)Cleaned.$(RESET)\n"

nuke: infra-clean clean ## Full cleanup: destroy volumes + remove artifacts
	@printf "$(GREEN)Everything cleaned.$(RESET)\n"
