---
description: "PostgreSQL + Prisma ORM 패턴"
paths:
  - "**/prisma/**"
  - "**/*.service.ts"
---

# Database Guidelines (Prisma)

## 스키마 관리

- 스키마는 `prisma/schema.prisma` 에서 단일 관리
- 변경 후 `npx prisma migrate dev --name <설명>` 으로 마이그레이션 생성
- 프로덕션은 `npx prisma migrate deploy`
- 직접 DB 스키마 변경 금지 — 반드시 마이그레이션 파일로

## 네이밍

- **모델**: `PascalCase` 단수형 (`Streamer`, `LiveSnapshot`, `StreamerGroup`)
- **필드**: `camelCase` (`channelId`, `createdAt`, `followerCount`)
- **테이블**: Prisma 기본값 사용 (모델명 그대로). 필요 시 `@@map("snake_case")`
- **인덱스**: 자주 조회하는 필드에 `@@index` 명시

## 쿼리 패턴

### 기본 CRUD

별도 Repository 레이어를 두지 않고 Service 에서 직접 쿼리한다. NestJS 프로젝트는 `PrismaService` DI로 사용, 그 외는 Prisma Client 직접 import.

### 관계 로드 — `include` / `select`

- 필요한 관계만 명시적으로 `include` 또는 `select`
- 중첩 관계는 depth 를 최소화
- `_count` 집계로 카운트만 필요한 경우 join 없이 처리

```typescript
const company = await this.prisma.company.findUnique({
  where: { id: companyId },
  include: {
    _count: { select: { groups: true, streamers: true } },
    groups: {
      include: { members: { select: { streamer: true } } },
    },
  },
});
```

### 트랜잭션

여러 테이블에 걸친 작업은 `$transaction` 사용

```typescript
await this.prisma.$transaction([
  this.prisma.liveRanking.deleteMany({ where: { snapshotId } }),
  this.prisma.liveSnapshot.delete({ where: { id: snapshotId } }),
]);
```

### Upsert

"있으면 업데이트, 없으면 생성" 패턴은 `upsert` 사용

```typescript
await this.prisma.streamer.upsert({
  where: { channelId },
  create: { channelId, channelName, followerCount },
  update: { channelName, followerCount },
});
```

## 데이터 정합성

- 중복 소속 가능한 다대다 관계는 **서비스 레이어에서 dedupe** (DB unique 제약 + JS Set)
- 통계 집계 시 `_count` 값을 단순 합산하면 중복 카운트 위험 — 유니크 ID 기반으로 계산
- nullable 외래키(`companyId?`) 는 `onDelete: SetNull` 로 안전하게 처리

## 성능

- 자주 필터/정렬하는 필드에 `@@index` 추가
- 대량 조회 시 `select` 로 필요한 컬럼만 가져오기
- N+1 방지: `include` 로 한 번에 로드하거나, 서비스에서 배치 처리
