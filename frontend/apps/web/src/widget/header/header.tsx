import { Link } from 'react-router';

import { useAuthStore } from '@/src/shared/store/auth-store';
import { cn } from '@/src/shared/utils/cn';

interface HeaderNavItem {
  label: string;
  to: string;
  /** 강조 메뉴 — primary-700 SemiBold */
  emphasized?: boolean;
  /** 인증 상태로 목적지가 갈림 — 미인증이면 /verification-no-auth 로 보낸다 */
  authGate?: boolean;
}

// 본인인증 CTA — intro 페이지로 이동해 본인인증 후 조회를 시작한다
const AUTH_CTA_ITEM: HeaderNavItem = {
  label: '본인인증하고 조회',
  to: '/',
  emphasized: true,
};

const HEADER_NAV_ITEMS: HeaderNavItem[] = [];

// 비인증 진위확인 페이지 — 서비스 안내 + 본인인증하고 조회만 노출 (node 29:2434)
const VERIFICATION_NAV_ITEMS: HeaderNavItem[] = [{ label: '서비스 안내', to: '/' }, AUTH_CTA_ITEM];

// 이용약관 페이지 — 기본 메뉴 + 본인인증 CTA (node 44:114)
const TERMS_NAV_ITEMS: HeaderNavItem[] = [...HEADER_NAV_ITEMS, AUTH_CTA_ITEM];

interface HeaderVariantConfig {
  title: string;
  navItems: HeaderNavItem[];
}

const HEADER_VARIANTS: Record<'default' | 'terms' | 'verification', HeaderVariantConfig> = {
  default: {
    title: '교육이력 서비스',
    navItems: HEADER_NAV_ITEMS,
  },
  terms: {
    title: '교육이력 서비스',
    navItems: TERMS_NAV_ITEMS,
  },
  verification: {
    title: '확인서 진위확인',
    navItems: VERIFICATION_NAV_ITEMS,
  },
};

export interface HeaderProps {
  /** terms — 이용약관 (node 44:114) · verification — 비인증 진위확인 (node 29:2434) */
  variant?: 'default' | 'terms' | 'verification';
  className?: string;
}

/**
 * 상단 내비게이션 바 — Figma 디자인 시스템 (node 22:2297) 기반.
 *
 * 좌측 서비스명(primary-700 Bold) + 우측 메뉴(gray-700 Medium, 32px 간격).
 * variant 로 페이지별 제목·메뉴 구성·타이포그래피를 전환한다.
 */
export function Header({ variant = 'default', className }: HeaderProps) {
  const config = HEADER_VARIANTS[variant];
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // 진위확인 — 미인증이면 본인인증 없이 확인 가능한 페이지로 보낸다
  const resolveTo = (item: HeaderNavItem) =>
    item.authGate && !isAuthenticated ? '/verification-no-auth' : item.to;

  return (
    <header className={cn('border-b border-solid border-gray-200 bg-white font-sans', className)}>
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between px-20">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 text-lg font-bold leading-normal text-primary-700"
        >
          <img src="/logo-mark.svg" alt="KAISA" className="h-8 w-auto" />
          {config.title}
        </Link>
        <nav className="flex shrink-0 items-center gap-8 text-[15px] font-medium leading-normal whitespace-nowrap text-gray-700">
          {config.navItems.map((item) => (
            <Link
              key={item.label}
              to={resolveTo(item)}
              className={cn('shrink-0', item.emphasized && 'font-semibold text-primary-700')}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
