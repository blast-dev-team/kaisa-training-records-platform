.PHONY: install dev migrate migration reset seed lint fmt test test-v \
        build up down restart logs shell db-shell

# ══════════════════════════════════════════════════════════════════════════════
# 로컬 개발 (uv)
# ══════════════════════════════════════════════════════════════════════════════

install:
	uv sync --all-extras

# TZ=UTC: 프로덕션 서버(UTC)와 동일하게 프로세스 타임존을 UTC 로 고정.
# asyncpg 는 naive datetime 을 프로세스 로컬 TZ 로 인코딩하므로, 로컬에서 이걸
# 안 맞추면 캘린더 날짜(자정)를 timestamptz 에 저장할 때 하루 밀릴 수 있다.
dev:
	TZ=UTC uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

migrate:
	uv run alembic upgrade head

# 사용법: make migration name="add_user_table"
migration:
	uv run alembic revision --autogenerate -m "$(name)"

# DB 초기화 (로컬 PostgreSQL — DROP/CREATE DATABASE 후 마이그레이션 재적용)
# 전제: localhost:5432 에 kaisa role 이 존재 (CREATEDB 권한)
reset:
	psql -h localhost -U kaisa -d postgres -c "DROP DATABASE IF EXISTS kaisa;"
	psql -h localhost -U kaisa -d postgres -c "CREATE DATABASE kaisa OWNER kaisa;"
	uv run alembic upgrade head

# 개발용 시드 (등급/마스터 관리자/교육생 3 — .env 의 ADMIN_EMAIL·ADMIN_PASSWORD 사용)
seed:
	uv run python -m app.seed

lint:
	uv run ruff check .
	uv run ruff format --check .

fmt:
	uv run ruff check --fix .
	uv run ruff format .

test:
	uv run pytest

test-v:
	uv run pytest -v

# ══════════════════════════════════════════════════════════════════════════════
# Docker (로컬)
# ══════════════════════════════════════════════════════════════════════════════

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose up -d --build api

logs:
	docker compose logs -f api

shell:
	docker compose exec api bash

db-shell:
	docker compose exec db psql -U kaisa -d kaisa
