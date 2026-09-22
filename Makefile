.PHONY: install dev build test typecheck db-up db-down migrate ml-dev ml-test

install:
	npm install
	python -m pip install -r services/ml/requirements-dev.txt

dev:
	npm run dev

build:
	npm run build

test:
	npm test
	python -m pytest services/ml

typecheck:
	npm run typecheck

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

migrate:
	npm run db:migrate

ml-dev:
	python -m uvicorn app.main:app --app-dir services/ml --reload --port 8000

ml-test:
	python -m pytest services/ml

