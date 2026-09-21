import { Link, useSearchParams } from 'react-router';

import { CaretLeftIcon } from '@/src/shared/icon/caret-left';
import { cn } from '@/src/shared/utils/cn';

const TAB_ITEMS = [
  { key: 'use', label: '이용약관' },
  { key: 'privacy', label: '개인정보 수집·이용' },
  { key: 'refund', label: '환불정책' },
  { key: 'unique-info', label: '고유식별정보 처리' },
] as const;

type TermsTab = (typeof TAB_ITEMS)[number]['key'];
const DEFAULT_TAB: TermsTab = 'use';

interface TermsArticle {
  heading?: string;
  paragraphs: string[];
}

interface TermsDocument {
  title: string;
  /** 예: "시행일자 2026.01.01 · 개정 내역 보기" — 확정된 문서에만 표기 */
  meta?: string;
  articles: TermsArticle[];
}

const TAB_CONTENT: Record<TermsTab, TermsDocument> = {
  use: {
    title: '이용약관',
    meta: '시행일자 2026.01.01 · 개정 내역 보기',
    articles: [
      {
        heading: '제1조 (목적)',
        paragraphs: [
          '본 약관은 대한검사교육협회(이하 "협회")가 운영하는 계속교육내역확인서 발급 서비스(이하 "서비스")의 이용 조건 및 절차, 협회와 이용자의 권리·의무에 관한 사항을 규정함을 목적으로 합니다.',
        ],
      },
      {
        heading: '제2조 (정의)',
        paragraphs: [
          '① "서비스"란 협회가 제공하는 계속교육내역확인서 온라인 발급 및 진위확인 서비스를 말합니다.',
          '② "이용자"란 본 약관에 따라 서비스를 이용하는 자를 말합니다.',
          '③ "확인서"란 협회가 발급하는 계속교육내역확인서를 말합니다.',
        ],
      },
      {
        heading: '제3조 (약관의 효력 및 변경)',
        paragraphs: [
          '① 본 약관은 서비스 화면에 게시하거나 기타의 방법으로 이용자에게 공지함으로써 효력이 발생합니다.',
          '② 협회는 관련 법령에 위배되지 않는 범위에서 약관을 개정할 수 있으며, 개정 시 적용일자 7일 전 공지합니다.',
        ],
      },
    ],
  },
  privacy: {
    title: '개인정보 수집·이용',
    meta: '시행일자 2026.01.01 · 개정 내역 보기',
    articles: [
      {
        heading: '제1조 (수집 항목)',
        paragraphs: [
          '협회는 확인서 발급 서비스 제공을 위해 다음의 개인정보를 수집합니다.',
          '① 필수 항목: 성명, 생년월일, 연락처(휴대전화번호)',
          '② 선택 항목: 이메일 주소',
          '③ 자동 수집 항목: 접속 IP, 접속 일시, 서비스 이용 기록',
        ],
      },
      {
        heading: '제2조 (수집·이용 목적)',
        paragraphs: [
          '수집한 개인정보는 다음의 목적으로만 이용됩니다.',
          '① 본인 확인 및 교육내역 조회',
          '② 계속교육내역확인서 발급 및 진위확인 서비스 제공',
          '③ 결제 처리 및 환불',
          '④ 서비스 이용 관련 공지 및 민원 처리',
        ],
      },
      {
        heading: '제3조 (보유 및 이용 기간)',
        paragraphs: [
          '① 개인정보는 수집·이용 목적이 달성된 후 지체 없이 파기합니다.',
          '② 다만, 관련 법령에 따라 보존할 필요가 있는 경우 해당 기간 동안 보관합니다.',
          '  - 계약 또는 청약철회 기록: 5년',
          '  - 대금결제 및 재화 공급 기록: 5년',
          '  - 소비자 불만 및 분쟁처리 기록: 3년',
        ],
      },
    ],
  },
  refund: {
    title: '환불정책',
    meta: '시행일자 2026.01.01 · 개정 내역 보기',
    articles: [
      {
        heading: '제1조 (환불 원칙)',
        paragraphs: [
          '① 확인서 발급이 완료되기 전 결제를 취소하는 경우 전액 환불됩니다.',
          '② 확인서 발급이 완료된 이후에는 환불이 불가합니다.',
          '③ 환불 처리 시 결제 수단에 따라 환불 소요 기간이 상이할 수 있습니다.',
        ],
      },
      {
        heading: '제2조 (자동 환불)',
        paragraphs: [
          '① 시스템 오류로 인한 중복 결제가 확인된 경우 자동으로 환불 처리됩니다.',
          '② 결제 승인 후 발급 처리가 실패한 경우, 결제 금액은 자동 취소됩니다.',
          '③ 자동 환불은 영업일 기준 3~5일 이내에 처리됩니다.',
        ],
      },
      {
        heading: '제3조 (환불 절차)',
        paragraphs: [
          '① 환불을 원하는 이용자는 발급·결제 내역에서 취소 요청을 할 수 있습니다.',
          '② 신용카드 결제의 경우 카드사 승인 취소로 처리되며, 매입 전 취소 시 즉시, 매입 후 취소 시 영업일 기준 3~5일이 소요됩니다.',
          '③ 계좌이체의 경우 환불 계좌로 입금되며, 영업일 기준 3~5일이 소요됩니다.',
        ],
      },
    ],
  },
  'unique-info': {
    title: '고유식별정보 처리',
    meta: '시행일자 2026.01.01 · 개정 내역 보기',
    articles: [
      {
        heading: '제1조 (처리하는 고유식별정보)',
        paragraphs: [
          '협회는 본인인증 서비스 제공을 위해 다음의 고유식별정보를 처리합니다.',
          '① 주민등록번호: 본인인증기관을 통한 본인 확인 목적',
          '② 해당 정보는 본인인증 과정에서만 일시적으로 처리되며, 협회 서버에 저장되지 않습니다.',
        ],
      },
      {
        heading: '제2조 (처리 목적 및 근거)',
        paragraphs: [
          '① 처리 목적: 이용자 본인 확인 및 교육내역 조회를 위한 정확한 신원 확인',
          '② 법적 근거: 개인정보 보호법 제24조의2에 따라 본인인증기관을 통해 처리',
          '③ 협회는 고유식별정보를 본인인증 외의 목적으로 사용하지 않습니다.',
        ],
      },
      {
        heading: '제3조 (보관 및 파기)',
        paragraphs: [
          '① 본인인증에 사용된 고유식별정보는 인증 완료 즉시 파기합니다.',
          '② 인증 결과(성공/실패 여부)만 세션 유효 기간 동안 보관되며, 세션 만료 시 자동 삭제됩니다.',
          '③ 협회는 고유식별정보에 대한 별도의 데이터베이스를 운영하지 않습니다.',
        ],
      },
    ],
  },
};

function parseTab(value: string | null): TermsTab {
  const found = TAB_ITEMS.find((item) => item.key === value);
  return found?.key ?? DEFAULT_TAB;
}

/** 이용약관 — Figma 디자인(node 44:28) 반영. 좌측 탭(?tab=)으로 문서 전환 */
export function TermsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const content = TAB_CONTENT[tab];

  // 기본 탭은 URL에서 키를 생략해 기본 주소와 공유
  const selectTab = (key: TermsTab) => {
    const next = new URLSearchParams(searchParams);
    if (key === DEFAULT_TAB) next.delete('tab');
    else next.set('tab', key);
    setSearchParams(next);
  };

  return (
    <section className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 px-[60px] pb-12 pt-8 mobile:gap-0 mobile:px-5 mobile:pb-12 mobile:pt-0">
      <Link
        to="/"
        className="flex items-center gap-2 self-start text-gray-700 mobile:py-4"
        aria-label="이전 페이지로 돌아가기"
      >
        <CaretLeftIcon className="size-8" />
        <span className="text-[28px] font-bold leading-tight text-gray-900 mobile:text-[20px]">
          약관
        </span>
      </Link>

      {/* 모바일 가로 탭 — 좁은 폭에서 좌우 스크롤 (node 133:2596 · 131:12357) */}
      <nav className="hidden w-full items-center overflow-x-auto mobile:flex">
        {TAB_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => selectTab(item.key)}
            className={cn(
              'shrink-0 cursor-pointer whitespace-nowrap px-4 py-3 text-sm transition-colors',
              tab === item.key
                ? 'bg-gray-900 font-semibold text-white'
                : 'font-normal text-gray-600 hover:bg-gray-100 hover:text-gray-900',
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex gap-8">
        <nav className="flex w-40 shrink-0 flex-col mobile:hidden">
          {TAB_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => selectTab(item.key)}
              className={cn(
                'cursor-pointer px-4 py-3 text-left text-sm transition-colors',
                tab === item.key
                  ? 'bg-gray-900 font-semibold text-white'
                  : 'font-normal text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex flex-1 flex-col gap-5 mobile:w-full mobile:gap-4 mobile:pt-6 mobile:pb-12">
          <h1 className="text-[22px] font-bold leading-tight text-gray-900">{content.title}</h1>
          {content.meta && <p className="text-[13px] text-gray-500">{content.meta}</p>}
          {/* 모바일 — 메타 아래 구분선 (node 133:2607) */}
          <div className="hidden h-px w-full bg-gray-200 mobile:block" />
          {content.articles.map((article, index) => (
            <article key={article.heading ?? index}>
              {article.heading && (
                <h2 className="mb-5 text-base font-bold text-gray-900 mobile:mb-2 mobile:text-[15px]">
                  {article.heading}
                </h2>
              )}
              {/* pre-wrap — 개인정보 보유기간 하위 목록("  - ")의 들여쓰기 유지 */}
              {article.paragraphs.map((paragraph) => (
                <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700 mobile:leading-[22px]">
                  {paragraph}
                </p>
              ))}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
