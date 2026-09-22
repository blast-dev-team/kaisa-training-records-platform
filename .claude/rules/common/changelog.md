---
description: "Changelog 작성 규칙"
---

# Changelog Rules

## 필수 규칙

- [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) 형식 준수
- Semantic Versioning 준수
- 최신 변경사항은 `[Unreleased]` 섹션에 추가

## 섹션 구조

```markdown
# Changelog

## [Unreleased]

### Added
- 새로운 기능

### Changed
- 기존 기능의 변경

### Deprecated
- 곧 제거될 기능

### Removed
- 제거된 기능

### Fixed
- 버그 수정

### Security
- 보안 패치

## [1.0.0] - 2024-01-01
```

## 버전 릴리즈 시

1. `[Unreleased]` 내용을 새 버전 섹션으로 이동
2. 릴리즈 날짜 추가
3. 새로운 `[Unreleased]` 섹션 생성

```markdown
## [Unreleased]

## [1.1.0] - 2024-02-01
### Added
- 이전에 Unreleased에 있던 내용
```

## 중요

- **Always** update CHANGELOG.md when making changes
- 배포 시 반드시 changelog 확인
