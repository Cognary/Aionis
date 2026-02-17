.PHONY: db-up db-down db-migrate db-psql
.PHONY: api-dev
.PHONY: stack-up stack-down quickstart killer-demo killer-demo-cleanup value-dashboard
.PHONY: sdk-build sdk-pack-dry-run sdk-release-check sdk-publish-dry-run
.PHONY: sdk-py-compile sdk-py-release-check sdk-py-build-dist sdk-py-publish-dry-run
.PHONY: perf-phase-d-matrix

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

value-dashboard:
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
