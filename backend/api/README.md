# Kaisa API

FastAPI + SQLAlchemy(async) + Alembic 백엔드. 패키지 매니저는 [uv](https://docs.astral.sh/uv/).

## 스택

- **FastAPI** — 웹 프레임워크 (`app/main.py`)
- **SQLAlchemy 2.0 (async)** — ORM (`app/core/database.py`)
- **Alembic** — 마이그레이션 (`alembic/`)
- **Pydantic Settings** — 환경설정 (`app/core/config.py`)

## 구조

```
app/
  main.py            # FastAPI 진입점, 라우터 등록
  core/              # 인프라 (config, database, security, response, dependencies)
  domain/            # 도메인별 모듈 (<domain>/router.py, model.py, schema.py, service.py)
    health/          # 헬스체크 (샘플)
  integrations/      # 외부 연동 클라이언트
  utils/             # 공용 유틸
alembic/             # DB 마이그레이션
```

새 도메인을 추가할 땐 `app/domain/<name>/` 아래 `router.py`(+ `model.py`, `schema.py`, `service.py`)를
두고, 모델은 `app/domain/__init__.py` 에 import 를 추가해 Alembic 이 발견하도록 한다.

## 로컬 실행

전제: 로컬에 PostgreSQL 이 떠 있고 `kaisa` role + `kaisa` DB 가 있어야 한다.

```bash
createuser kaisa --createdb --pwprompt   # 비밀번호: kaisa
createdb kaisa -O kaisa

cp .env.example .env      # 필요 시 값 수정
make install              # uv sync
make migrate              # alembic upgrade head
make dev                  # http://localhost:8000
```

- API 문서(Scalar): http://localhost:8000/scalar
- OpenAPI JSON: http://localhost:8000/openapi.json
- 헬스체크: http://localhost:8000/api/health

## Docker

```bash
cp .env.example .env      # DB_PASSWORD 설정
make up                   # db + api 컨테이너 기동
make logs
```

## 마이그레이션

```bash
make migration name="add_something"   # 자동 생성
make migrate                          # 적용
```
