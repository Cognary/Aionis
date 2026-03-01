.PHONY: db-up db-down db-migrate db-psql
.PHONY: api-dev
.PHONY: stack-up stack-down quickstart killer-demo killer-demo-cleanup value-dashboard ops-dashboard value-dashboard-json
.PHONY: sdk-build sdk-pack-dry-run sdk-release-check sdk-publish-dry-run
.PHONY: sdk-py-compile sdk-py-release-check sdk-py-build-dist sdk-py-publish-dry-run
.PHONY: perf-phase-d-matrix

OPS_DASHBOARD_PORT ?= 3100

db-up:
	docker compose up -d db

db-down:
	docker compose down

db-migrate:
	./scripts/db-migrate.sh

db-psql:
	./scripts/db-psql.sh

api-dev:
	npm run dev

stack-up:
	docker compose up -d

stack-down:
	docker compose down

quickstart:
	./scripts/quickstart.sh

killer-demo:
	./examples/killer_demo.sh

killer-demo-cleanup:
	./examples/killer_demo_cleanup.sh --all

value-dashboard: ops-dashboard

ops-dashboard:
	@echo "Launching Aionis Ops dashboard on http://127.0.0.1:$(OPS_DASHBOARD_PORT)"
	@echo "Set AIONIS_BASE_URL/AIONIS_ADMIN_TOKEN in env if needed."
	@echo "Optional gate: OPS_BASIC_AUTH_ENABLED=true OPS_BASIC_AUTH_USER=ops OPS_BASIC_AUTH_PASS=..."
	@echo "Optional gate: OPS_IP_ALLOWLIST=127.0.0.1,::1,10.0.0.0/8"
	@echo "Dangerous actions are disabled by default (set OPS_DANGEROUS_ACTIONS_ENABLED=true to enable)."
	npm --prefix apps/ops install
	AIONIS_BASE_URL=$${AIONIS_BASE_URL:-http://127.0.0.1:3001} npm --prefix apps/ops run dev -- --port $(OPS_DASHBOARD_PORT)

value-dashboard-json:
	./examples/value_dashboard.sh "memory graph"

sdk-build:
	npm run -s sdk:build

sdk-pack-dry-run:
	npm run -s sdk:pack-dry-run

sdk-release-check:
	npm run -s sdk:release-check

sdk-publish-dry-run:
	npm run -s sdk:publish:dry-run

sdk-py-compile:
	npm run -s sdk:py:compile

sdk-py-release-check:
	npm run -s sdk:py:release-check

sdk-py-build-dist:
	npm run -s sdk:py:build-dist

sdk-py-publish-dry-run:
	npm run -s sdk:py:publish:dry-run

perf-phase-d-matrix:
	npm run -s perf:phase-d-matrix
