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

# 개발용 시드 (등급/마스터 관리자/교육생 3 — .env.example 의 ADMIN_EMAIL·ADMIN_PASSWORD 사용)
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

# docker-compose.local.yml (gitignore — 8443 + 자체서명 인증서) 이 있을 때만 명시 로드.
# override.yml 이름은 compose가 자동 로드하므로 금지 — 서버에 유출되면 nginx가 죽는다
# (2026-09-16 실제 사고). local.yml 은 자동 로드되지 않아 유출돼도 무해.
COMPOSE_FILES := -f docker-compose.yml $(if $(wildcard docker-compose.local.yml),-f docker-compose.local.yml,)

build:
	docker compose $(COMPOSE_FILES) build

up:
	docker compose $(COMPOSE_FILES) up -d

down:
	docker compose $(COMPOSE_FILES) down

restart:
	docker compose $(COMPOSE_FILES) up -d --build api

logs:
	docker compose $(COMPOSE_FILES) logs -f api

shell:
	docker compose $(COMPOSE_FILES) exec api bash

db-shell:
	docker compose $(COMPOSE_FILES) exec db psql -U kaisa -d kaisa
