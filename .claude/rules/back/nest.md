---
description: "NestJS 아키텍처 및 패턴"
paths:
  - "**/*.controller.ts"
  - "**/*.service.ts"
  - "**/*.module.ts"
  - "**/*.guard.ts"
  - "**/*.dto.ts"
---

# NestJS Guidelines

> 응답 형태·에러 코드·페이지네이션은 반드시 `back/api-design.md` 기준을 따른다.

## 모듈 구조

```
src/
├── app.module.ts
├── (도메인)/
│   ├── (도메인).module.ts
│   ├── (도메인).controller.ts
│   ├── (도메인).service.ts
│   ├── dto/
│   │   ├── create-(도메인).dto.ts
│   │   └── update-(도메인).dto.ts
│   └── entities/
│       └── (도메인).entity.ts
└── common/
    ├── guards/
    ├── filters/
    └── interceptors/
```

## 레이어 역할

- **Controller**: 요청/응답 처리, 유효성 검사만. 비즈니스 로직 없음
- **Service**: 비즈니스 로직 담당
- **PrismaService**: DB 쿼리 담당 (Service 에서 직접 주입)

## DTO & Validation

`class-validator` + `class-transformer` 로 입력 유효성 검사. `main.ts` 에 전역 `ValidationPipe` 적용.

```typescript
// main.ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

```typescript
// create-user.dto.ts
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  name?: string;
}
```

- `whitelist: true` — DTO 에 없는 필드는 자동 제거
- `transform: true` — 쿼리 파라미터 숫자 자동 변환 (`?page=1` → `number`)

## 에러 처리

NestJS 기본 에러 포맷(`statusCode`, `error` 필드 포함)을 `back/api-design.md` 형식으로 변환하려면
전역 `HttpExceptionFilter`를 등록한다.

```typescript
// common/filters/http-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse() as any;

    response.status(status).json({
      code: body.code ?? 'INTERNAL_ERROR',
      message: body.message ?? '문제가 생겼어요. 잠시 후 다시 시도해 주세요',
      ...(body.errors ? { errors: body.errors } : {}),
    });
  }
}

// main.ts
app.useGlobalFilters(new HttpExceptionFilter());
```

예외를 던질 때는 `code` + `message` 를 함께 전달:

```typescript
// ✅ code + message 전달
throw new HttpException(
  { code: 'VEHICLE_NOT_FOUND', message: '차량을 찾을 수 없어요' },
  HttpStatus.NOT_FOUND,
);
throw new HttpException(
  { code: 'DUPLICATE_EMAIL', message: '이미 등록된 이메일이에요' },
  HttpStatus.CONFLICT,
);
throw new HttpException(
  {
    code: 'VALIDATION_ERROR',
    message: '입력값을 확인해 주세요',
    errors: [{ field: 'email', message: '올바른 이메일 형식이 아니에요' }],
  },
  HttpStatus.BAD_REQUEST,
);
```

- 에러 코드 목록은 `back/api-design.md` 참고
- Service에서만 throw, Controller에서 직접 throw 금지

## Guards

API Key 인증 등 단순 토큰 기반 접근 제어.

```typescript
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.headers['x-api-key'];
    const expected = process.env.ADMIN_API_KEY;
    if (!expected) return true; // 미설정 시 로컬 개발 편의상 통과
    return key === expected;
  }
}
```

- 전역 Guard: `app.useGlobalGuards()`
- 라우트별: `@UseGuards(ApiKeyGuard)` 데코레이터

## Config

`@nestjs/config` 로 환경변수 관리. `ConfigService` 로 접근.

```typescript
// app.module.ts
ConfigModule.forRoot({ isGlobal: true })

// service
constructor(private readonly config: ConfigService) {}
const url = this.config.get<string>('DATABASE_URL');
```

## Swagger

`@nestjs/swagger` 로 API 문서 자동 생성.

```typescript
// main.ts
const config = new DocumentBuilder()
  .setTitle('API')
  .setVersion('1.0')
  .addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key' }, 'api-key')
  .build();
SwaggerModule.setup('api-docs', app, SwaggerModule.createDocument(app, config));
```

Controller/DTO 에 `@ApiOperation`, `@ApiProperty` 로 문서화.

## CORS & rawBody

```typescript
// main.ts
app.enableCors({ origin: process.env.ALLOWED_ORIGIN ?? '*' });

// webhook 등 rawBody 필요 시
const app = await NestFactory.create(AppModule, { rawBody: true });
```

## 원칙

- Controller 는 얇게 유지 (로직은 Service 로)
- 하나의 Service 는 하나의 도메인 책임
- 순환 의존성 금지
- 공유 서비스(Slack, Mail 등)는 별도 Module 로 분리 후 `exports` 로 공유
