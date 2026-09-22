---
description: "Feature-Sliced Design 아키텍처 가이드"
---

# Feature-Sliced Design (FSD) 아키텍처

프로젝트는 [FSD 공식문서](https://feature-sliced.github.io/documentation/kr/docs/get-started/overview)를 참고하여 구조화되어 있습니다.

## apps 내 폴더 구조
```
src/
├── app/            # 앱 초기화, 프로바이더, 라우팅
├── entities/       # 도메인 모델, API
├── feature/        # 비즈니스 기능
├── shared/         # 공통 유틸, UI
├── views/          # 페이지 컴포넌트
└── widget/         # 독립적 UI 블록
```

## 레이어 의존성 규칙
- `views` → `widget`, `feature`, `entities`, `shared`
- `widget` → `feature`, `entities`, `shared`
- `feature` → `entities`, `shared`
- `entities` → `shared`
- `shared` → 외부 라이브러리만

## 개발 가이드라인
1. **FSD 아키텍처 준수**: 레이어 구조를 유지합니다
2. **명명 규칙**: 파일명과 폴더명은 케밥 케이스 사용
3. **타입 안정성**: TypeScript로 타입을 명확하게 정의
4. **코드 재사용**: 공통 로직은 shared, 도메인 로직은 entities에 배치
