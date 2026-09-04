---
description: "FastAPI 아키텍처 및 패턴"
paths:
  - "backend/**/*.py"
---

# FastAPI 백엔드 아키텍처

> 응답 형태·에러 코드·페이지네이션은 반드시 `back/api-design.md` 기준을 따른다.

## 계층 구조

```
Router  →  Service  →  Repository  →  DB
(엔드포인트)  (비즈니스 로직)  (SQL 쿼리)
```

- **Router**: 얇게 유지. 파라미터 받아 service 호출 후 반환만.
- **Service**: 비즈니스 로직, 유효성 검사, `HTTPException` 발생. Repository를 호출해 데이터를 처리.
- **Repository**: DB 접근만. SQL 쿼리 / ORM 조작. 비즈니스 로직 절대 금지.
- **Model**: SQLAlchemy ORM 테이블 정의.
- **Schema**: Pydantic I/O 스키마. Request / Response 분리.

---

## 도메인 구조

```
app/domain/(도메인)/
├── model/
│   ├── __init__.py          # 모델 re-export
│   ├── (entity).py          # SQLAlchemy 모델
│   └── enums.py             # str enum 상수 (상태값 등)
├── schema/
│   ├── __init__.py          # 스키마 re-export
│   ├── (entity).py          # Pydantic 스키마 (Create / Update / Response)
│   └── _helpers.py          # 도메인 내 공유 유틸 (date_str 등)
├── repository/
│   ├── __init__.py          # repository 모듈 re-export
│   └── (entity)_repository.py
├── service/
│   ├── __init__.py          # service 모듈 re-export
│   └── (entity)_service.py
└── router.py
```

### 단순 도메인 예외

`auth`, `health`, `stats`처럼 DB 접근이 없거나 로직이 없는 도메인은
`router.py` + `schema.py`만으로 구성 가능.

---

## Model

```python
# domain/vehicle/model/vehicle.py
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Table, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.domain.maker.model import Maker  # 순환 참조 방지

# M2M 관계 테이블은 연관 모델 파일에 함께 정의
vehicle_option_association = Table(
    "vehicle_option_map",
    Base.metadata,
    Column("vehicle_id", Integer, ForeignKey("vehicle.id"), primary_key=True),
    Column("option_id", Integer, ForeignKey("vehicle_option.id"), primary_key=True),
)


class Vehicle(Base):
    __tablename__ = "vehicle"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    license_plate: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="standby")
    memo: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    # 1:N 자식 (부모 삭제 시 자식도 삭제)
    maintenance_logs: Mapped[list["MaintenanceLog"]] = relationship(
        "MaintenanceLog", back_populates="vehicle", cascade="all, delete-orphan"
    )
    # FK 참조 (삭제 시 NULL 처리)
    maker: Mapped["Maker | None"] = relationship("Maker", lazy="joined")
```

### 컨벤션

| 항목 | 규칙 |
|------|------|
| 타입 힌트 | `Mapped[타입]` + `mapped_column()` 사용 |
| nullable | `nullable=True` 명시 + `Mapped[str \| None]` |
| created_at | `server_default=func.now()` |
| updated_at | `server_default=func.now(), onupdate=func.now()` |
| 1:N 자식 | `cascade="all, delete-orphan"` |
| FK (SET NULL) | `ondelete="SET NULL"`, `nullable=True` |
| JOIN 로딩 | `lazy="joined"` (단건) / `lazy="selectin"` (컬렉션) |
| 순환 참조 | `TYPE_CHECKING` 블록 안에서 import, `Mapped["ClassName"]` 문자열 사용 |

---

## Enums

상태값·분류값은 `model/enums.py`에 `str enum`으로 정의.

```python
# domain/lead/model/enums.py
import enum

class LeadStatus(str, enum.Enum):
    new = "new"
    consulting = "consulting"
    contracted = "contracted"
    lost = "lost"

class DocReviewStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    review_required = "review_required"
```

- `str, enum.Enum` 상속 → Pydantic 직렬화·비교 모두 호환
- 모델 컬럼은 `String` 타입으로 저장 (PostgreSQL ENUM 타입 미사용)
- Schema에서 `str` 타입 유지, Enum은 서비스 레이어에서 검증용으로 사용 가능

---

## Schema

```python
# domain/vehicle/schema/vehicle.py
from pydantic import BaseModel

class VehicleCreate(BaseModel):
    license_plate: str
    model_year: int
    color: str | None = None
    memo: str | None = None

class VehicleUpdate(BaseModel):
    # Update는 모든 필드 Optional
    license_plate: str | None = None
    model_year: int | None = None
    color: str | None = None
    memo: str | None = None

class VehicleResponse(BaseModel):
    id: int
    license_plate: str
    model_year: int
    color: str | None
    status: str
    created_at: str
    updated_at: str

    # 단순 ORM 매핑: model_config 사용
    model_config = {"from_attributes": True}
```

### 관계 데이터가 있는 경우 — `from_orm` classmethod

ORM relationship에서 중첩 데이터를 추출할 때:

```python
class VehicleResponse(BaseModel):
    id: int
    license_plate: str
    maker_name: str | None     # relationship에서 추출
    option_ids: list[int]      # M2M에서 추출

    @classmethod
    def from_orm(cls, v) -> "VehicleResponse":
        return cls(
            id=v.id,
            license_plate=v.license_plate,
            maker_name=v.maker.name if v.maker else None,
            option_ids=[o.id for o in v.options],
        )
```

라우터에서 호출:
```python
return VehicleResponse.from_orm(vehicle)
# 또는 리스트
return [VehicleResponse.from_orm(v) for v in vehicles]
```

### `__init__.py` — 스키마 re-export

```python
# domain/vehicle/schema/__init__.py
from app.domain.vehicle.schema.vehicle import VehicleCreate, VehicleUpdate, VehicleResponse
from app.domain.vehicle.schema.maintenance_log import MaintenanceLogCreate, MaintenanceLogResponse

__all__ = [
    "VehicleCreate", "VehicleUpdate", "VehicleResponse",
    "MaintenanceLogCreate", "MaintenanceLogResponse",
]
```

### 컨벤션

| 이름 | 용도 |
|------|------|
| `XxxCreate` | POST 요청 바디 |
| `XxxUpdate` | PATCH 요청 바디 (모든 필드 Optional) |
| `XxxResponse` | 응답 (항상 `response_model`에 지정) |
| `XxxSummaryResponse` | 집계/요약 전용 |
| `_helpers.py` | 도메인 내 공유 유틸 (`date_str` 등) |

---

## Repository

```python
# domain/vehicle/repository/vehicle_repository.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.vehicle.model import Vehicle


async def find_by_id(db: AsyncSession, vehicle_id: int) -> Vehicle | None:
    result = await db.execute(select(Vehicle).where(Vehicle.id == vehicle_id))
    return result.scalar_one_or_none()


async def find_all(
    db: AsyncSession,
    status: str | None = None,
    search: str | None = None,
) -> list[Vehicle]:
    stmt = select(Vehicle)
    if status:
        stmt = stmt.where(Vehicle.status == status)
    if search:
        stmt = stmt.where(Vehicle.license_plate.ilike(f"%{search}%"))
    stmt = stmt.order_by(Vehicle.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def save(db: AsyncSession, vehicle: Vehicle) -> Vehicle:
    """신규 저장 (INSERT)"""
    db.add(vehicle)
    await db.commit()
    await db.refresh(vehicle)
    return vehicle


async def commit_refresh(db: AsyncSession, vehicle: Vehicle) -> Vehicle:
    """기존 객체 수정 후 커밋 (UPDATE)"""
    await db.commit()
    await db.refresh(vehicle)
    return vehicle


async def delete(db: AsyncSession, vehicle: Vehicle) -> None:
    await db.delete(vehicle)
    await db.commit()
```

### 컨벤션

| 함수명 | 역할 |
|--------|------|
| `find_by_id` | 단건 조회 → `XxxModel \| None` |
| `find_all` | 목록 조회 (필터 파라미터 포함) → `list[XxxModel]` |
| `find_all_for_{parent}` | 부모 ID 기준 목록 조회 |
| `save` | INSERT → commit + refresh |
| `commit_refresh` | UPDATE → commit + refresh |
| `delete` | DELETE → commit |

- **Repository에서 `HTTPException` 절대 금지** — 예외는 Service에서 처리
- 단순 `db.get(Model, pk)`는 `find_by_id` 내에서 래핑해서 사용

### `__init__.py`

```python
# domain/vehicle/repository/__init__.py
from app.domain.vehicle.repository import (
    vehicle_repository,
    maintenance_log_repository,
    accident_log_repository,
)

__all__ = [
    "vehicle_repository",
    "maintenance_log_repository",
    "accident_log_repository",
]
```

---

## Service

```python
# domain/vehicle/service/vehicle_service.py
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.vehicle.model import Vehicle
from app.domain.vehicle.repository import vehicle_repository as repo
from app.domain.vehicle.schema import VehicleCreate, VehicleUpdate


async def get_vehicle(db: AsyncSession, vehicle_id: int) -> Vehicle:
    """공통 조회 — 없으면 404. 다른 service 함수에서도 재사용."""
    vehicle = await repo.find_by_id(db, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="차량을 찾을 수 없어요")
    return vehicle


async def list_vehicles(
    db: AsyncSession,
    status: str | None = None,
    search: str | None = None,
) -> list[Vehicle]:
    return await repo.find_all(db, status=status, search=search)


async def create_vehicle(db: AsyncSession, data: VehicleCreate) -> Vehicle:
    vehicle = Vehicle(
        license_plate=data.license_plate,
        model_year=data.model_year,
        color=data.color,
    )
    return await repo.save(db, vehicle)


async def update_vehicle(
    db: AsyncSession, vehicle_id: int, data: VehicleUpdate
) -> Vehicle:
    vehicle = await get_vehicle(db, vehicle_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(vehicle, field, value)
    return await repo.commit_refresh(db, vehicle)


async def delete_vehicle(db: AsyncSession, vehicle_id: int) -> None:
    vehicle = await get_vehicle(db, vehicle_id)
    await repo.delete(db, vehicle)
```

### 컨벤션

- Repository는 `from app.domain.xxx.repository import xxx_repository as repo` 로 alias
- `get_xxx` 함수를 반드시 먼저 정의 — 같은 service 내에서 재사용
- `model_dump(exclude_unset=True)` — PATCH 시 전달된 필드만 업데이트
- 비즈니스 규칙 위반 시 `HTTPException` 여기서 raise

### `__init__.py`

```python
# domain/vehicle/service/__init__.py
from app.domain.vehicle.service import (
    vehicle_service,
    maintenance_log_service,
    accident_log_service,
)

__all__ = ["vehicle_service", "maintenance_log_service", "accident_log_service"]
```

---

## Router

```python
# domain/vehicle/router.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.domain.vehicle.schema import VehicleCreate, VehicleResponse, VehicleUpdate
from app.domain.vehicle.service import vehicle_service
from app.domain.user.model import User

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


@router.get("", response_model=list[VehicleResponse])
async def list_vehicles(
    status: str | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),   # 인증만 검사, 사용 안 하면 _
):
    vehicles = await vehicle_service.list_vehicles(db, status=status, search=search)
    return [VehicleResponse.from_orm(v) for v in vehicles]


@router.post("", response_model=VehicleResponse, status_code=201)
async def create_vehicle(
    body: VehicleCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    vehicle = await vehicle_service.create_vehicle(db, body)
    return VehicleResponse.from_orm(vehicle)


@router.patch("/{vehicle_id}", response_model=VehicleResponse)
async def update_vehicle(
    vehicle_id: int,
    body: VehicleUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    vehicle = await vehicle_service.update_vehicle(db, vehicle_id, body)
    return VehicleResponse.from_orm(vehicle)


@router.delete("/{vehicle_id}", status_code=204)
async def delete_vehicle(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    await vehicle_service.delete_vehicle(db, vehicle_id)
```

### 컨벤션

- `response_model` 항상 명시 (내부 필드 노출 방지)
- `status_code=201` — POST 생성 응답
- `status_code=204` — DELETE 응답 (반환값 없음)
- 인증만 필요하면 `_: User = Depends(get_current_user)`
- 관리자 전용이면 `_: User = Depends(require_admin)`
- 현재 유저 정보가 필요하면 `current_user: User = Depends(get_current_user)`
- Router는 service 호출 + 반환만. 조건 분기·비즈니스 로직 금지

---

## 다중 엔티티 도메인 (Multi-entity)

`lead`, `contract`처럼 하나의 도메인이 여러 서브 엔티티를 포함할 때:
각 서브 엔티티마다 독립적인 router / service / repository / schema 파일 작성.

```
domain/lead/
├── model/
│   ├── lead.py
│   ├── sales_log.py
│   ├── doc_upload.py
│   └── enums.py
├── schema/
│   ├── lead.py
│   ├── sales_log.py
│   └── doc_upload.py
├── repository/
│   ├── lead_repository.py
│   ├── sales_log_repository.py
│   └── doc_upload_repository.py
├── service/
│   ├── lead_service.py
│   ├── sales_log_service.py
│   └── doc_upload_service.py
└── router.py   # 모든 엔드포인트 한 파일, 여러 APIRouter 객체 선언
```

### 여러 APIRouter 선언

```python
# domain/lead/router.py
router = APIRouter(prefix="/leads", tags=["leads"])
sales_log_router = APIRouter(prefix="/sales-logs", tags=["leads"])
doc_upload_router = APIRouter(prefix="/doc-uploads", tags=["leads"])
```

### main.py 등록

```python
from app.domain.lead.router import router, sales_log_router, doc_upload_router

app.include_router(router, prefix="/api")
app.include_router(sales_log_router, prefix="/api")
app.include_router(doc_upload_router, prefix="/api")
```

---

## Core

### `core/database.py`

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

engine = create_async_engine(settings.database_url)
async_session = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with async_session() as session:
        yield session
```

### `core/dependencies.py`

```python
async def get_current_user(
    crm_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """쿠키(crm_session)에서 user_id 추출 → User 반환. 인증 실패 시 401."""
    ...

async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """관리자 전용 엔드포인트. 비관리자 403."""
    ...
```

---

## 에러 처리

`detail`에 반드시 `code` + `message` 딕셔너리를 전달한다. (`back/api-design.md` 형식 준수)

```python
# Service에서만 raise
raise HTTPException(
    status_code=404,
    detail={"code": "VEHICLE_NOT_FOUND", "message": "차량을 찾을 수 없어요"}
)
raise HTTPException(
    status_code=409,
    detail={"code": "DUPLICATE_PLATE", "message": "이미 등록된 번호판이에요"}
)
raise HTTPException(
    status_code=400,
    detail={"code": "INVALID_STATUS_TRANSITION", "message": "잘못된 상태 전환이에요"}
)
raise HTTPException(
    status_code=401,
    detail={"code": "UNAUTHORIZED", "message": "인증이 필요해요"}
)
raise HTTPException(
    status_code=403,
    detail={"code": "FORBIDDEN", "message": "권한이 없어요"}
)
```

FastAPI 기본 동작은 `{ "detail": ... }` 으로 감싸지만,
`main.py`에 등록된 전역 핸들러가 `detail`을 언래핑해서 반환한다.

```python
# main.py — 전역 예외 핸들러 (반드시 유지)
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": "INTERNAL_ERROR", "message": exc.detail},
    )
```

```json
// 클라이언트가 받는 응답 (언래핑됨)
{ "code": "VEHICLE_NOT_FOUND", "message": "차량을 찾을 수 없어요" }
```

FE에서 `error.response.data.code` 로 접근.

- `message`는 한국어, 사용자에게 보여줄 수 있는 문장으로
- 에러 코드 목록은 `back/api-design.md` 참고
- Router에서 직접 raise 금지 — Service에서 처리

---

## 비동기

- 모든 함수는 `async def`
- DB 작업은 `AsyncSession` + `await`
- `await db.execute(...)` → `result.scalar_one_or_none()` / `result.scalars().all()`

---

## 새 도메인 추가 체크리스트

```
1. domain/(name)/ 폴더 생성
2. model/(entity).py + enums.py + __init__.py
3. schema/(entity).py + __init__.py
4. repository/(entity)_repository.py + __init__.py
5. service/(entity)_service.py + __init__.py
6. router.py
7. main.py에 include_router 추가
```
