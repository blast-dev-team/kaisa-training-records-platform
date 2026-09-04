# Marketing & SEO Guidelines

마케팅 요소와 SEO를 고려한 개발 가이드라인.

## SEO 필수 사항

### 메타 태그

모든 public 페이지에 반드시 포함:

```typescript
export const metadata: Metadata = {
  title: '페이지 제목 - 브랜드명',
  description: '150자 이내, 핵심 키워드 포함',
  openGraph: {
    title: '공유 시 노출될 제목',
    description: '공유 시 노출될 설명',
    url: canonicalUrl,
    siteName: '브랜드명',
    type: 'website', // 또는 'article'
    images: [{ url: ogImageUrl, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '트위터 공유 제목',
    description: '트위터 공유 설명',
  },
  alternates: {
    canonical: canonicalUrl,
    languages: { /* 지원 로케일별 URL */ },
  },
};
```

### 비공개 페이지

사용자 전용 페이지(마이페이지, 폼 등)는 인덱싱 방지:

```typescript
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
```

### Sitemap & Robots

- `sitemap.xml`: 동적 페이지 포함하여 자동 생성 (Next.js `app/sitemap.ts` 활용)
- `robots.txt`: 크롤링 허용/차단 경로 명시 (Next.js `app/robots.ts` 활용)

### 구조화 데이터 (JSON-LD)

검색 결과 노출 강화를 위해 주요 페이지에 JSON-LD 추가:

```typescript
// 리스트 페이지: WebSite, ItemList
// 상세 페이지: SoftwareApplication, Product, Article 등 적합한 스키마
// 조직 정보: Organization
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
/>
```

## Analytics & 이벤트 추적

### 필수 트래킹

- **페이지 뷰**: Google Analytics (GA4) 또는 동등한 도구 연동
- **핵심 이벤트**: 사용자 행동 중 비즈니스에 중요한 액션 추적

### 추적할 핵심 이벤트 예시

| 이벤트 | 설명 |
|--------|------|
| `sign_up` | 회원가입 완료 |
| `submit_content` | 콘텐츠(프로젝트 등) 등록 |
| `vote` | 투표/좋아요 |
| `share` | 공유 (채널별 구분) |
| `click_cta` | 주요 CTA 클릭 |
| `start_checkout` | 결제 시작 |
| `complete_purchase` | 결제 완료 |

### 구현 패턴

```typescript
// shared/lib/analytics/track-event.ts
export function trackEvent(name: string, params?: Record<string, string | number>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', name, params);
  }
}
```

- 이벤트 추적 함수는 `shared/lib/analytics/`에 중앙화
- 컴포넌트에서 직접 `gtag` 호출 금지, 반드시 래퍼 함수 사용

## CTA & 전환 최적화

### CTA 배치 원칙

- **Primary CTA**: 페이지당 1개, 시각적으로 가장 눈에 띄게
- **Secondary CTA**: 보조 액션, Primary보다 약한 스타일
- 스크롤 없이 보이는 영역(above the fold)에 반드시 CTA 배치
- 빈 상태(empty state)에도 다음 행동을 유도하는 CTA 포함

### CTA 스타일 계층

```
Primary: 배경색 채움 (bg-primary text-white)
Secondary: 아웃라인 (border text-muted)
Tertiary: 텍스트만 (text-primary underline)
```

## 소셜 공유

### 필수 공유 채널

- 링크 복사 (Clipboard API)
- Twitter/X
- 타겟 사용자층에 맞는 추가 채널 (Facebook, LinkedIn 등)

### 공유 시 고려사항

- OG 이미지는 반드시 1200x630px
- 공유 텍스트에 핵심 가치 제안(value proposition) 포함
- 공유 후 시각적 피드백 제공 (복사 완료 표시 등)

## 랜딩 페이지 체크리스트

새 랜딩 페이지 또는 홈페이지 수정 시 확인:

- [ ] 가치 제안(value proposition)이 3초 내에 이해되는가
- [ ] Primary CTA가 스크롤 없이 보이는가
- [ ] 소셜 증거(social proof)가 있는가 (사용자 수, 리뷰, 랭킹 등)
- [ ] 모바일에서 CTA가 터치하기 쉬운 크기인가 (최소 44x44px)
- [ ] OG 태그가 올바르게 설정되었는가
- [ ] 페이지 로딩 속도가 3초 이내인가

## 성능과 마케팅

- **Core Web Vitals** (LCP, FID, CLS) 기준 충족 → 검색 순위에 직접 영향
- 이미지는 `next/image`로 최적화, WebP/AVIF 포맷 우선
- 폰트는 `next/font`로 로드하여 CLS 방지
- 불필요한 JS 번들 최소화 (dynamic import 활용)
