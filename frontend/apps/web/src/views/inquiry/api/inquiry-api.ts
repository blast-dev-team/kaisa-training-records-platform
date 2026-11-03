/**
 * 문의하기 API — 회원(PASS 로그인 세션) · 비회원(성명+연락처+비밀번호).
 * 회원: GET/POST /api/me/inquiries, GET /api/me/inquiries/author
 * 비회원: POST /api/public/inquiries, POST /api/public/inquiries/lookup
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export type InquiryCategory =
  | "training_record"
  | "certificate"
  | "payment"
  | "auth"
  | "verification"
  | "etc";

/** 문의 유형 — 서버 코드값과 화면 라벨 */
export const INQUIRY_CATEGORY_OPTIONS: { value: InquiryCategory; label: string }[] = [
  { value: "training_record", label: "교육내역(누락·정정)" },
  { value: "certificate", label: "확인서 발급" },
  { value: "payment", label: "결제·환불" },
  { value: "auth", label: "본인인증·로그인" },
  { value: "verification", label: "진위확인" },
  { value: "etc", label: "기타" },
];

export const categoryLabel = (value: string) =>
  INQUIRY_CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? "기타";

export const TITLE_MAX = 100;
export const CONTENT_MAX = 2000;

export interface Inquiry {
  id: string;
  category: string;
  title: string;
  content: string;
  status: "open" | "answered";
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
}

export interface MemberAuthor {
  name: string;
  certNo: string | null;
  phoneMasked: string | null;
}

export interface InquiryBody {
  category: InquiryCategory;
  title: string;
  content: string;
}

export interface GuestInquiryBody extends InquiryBody {
  name: string;
  phone: string;
  certNo: string;
  email: string;
  password: string;
  privacyAgreed: boolean;
  /** 봇 차단용 숨은 칸 — 사람은 비워 둔다 */
  website: string;
}

export interface GuestLookupBody {
  name: string;
  phone: string;
  password: string;
}

interface InquiryDto {
  id: string;
  category: string;
  title: string;
  content: string;
  status: "open" | "answered";
  answer: string | null;
  answered_at: string | null;
  created_at: string;
}

const toInquiry = (dto: InquiryDto): Inquiry => ({
  id: dto.id,
  category: dto.category,
  title: dto.title,
  content: dto.content,
  status: dto.status,
  answer: dto.answer,
  answeredAt: dto.answered_at,
  createdAt: dto.created_at,
});

/** 서버 오류 → 사용자 메시지. 422 는 필드 오류를 묶어 '입력값을 확인해 주세요' 로 온다 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    // GET 에 Content-Type 을 붙이면 다른 도메인 API 로 불필요한 CORS preflight 가 생긴다
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? "문제가 생겼어요. 잠시 후 다시 시도해 주세요");
  }
  return response.json();
}

export async function getMyInquiries(): Promise<Inquiry[]> {
  const data = await request<InquiryDto[]>("/api/me/inquiries");
  return data.map(toInquiry);
}

export async function getMemberAuthor(): Promise<MemberAuthor> {
  const data = await request<{ name: string; cert_no: string | null; phone_masked: string | null }>(
    "/api/me/inquiries/author",
  );
  return { name: data.name, certNo: data.cert_no, phoneMasked: data.phone_masked };
}

export async function postMyInquiry(body: InquiryBody): Promise<void> {
  await request("/api/me/inquiries", { method: "POST", body: JSON.stringify(body) });
}

export async function postGuestInquiry(body: GuestInquiryBody): Promise<void> {
  await request("/api/public/inquiries", {
    method: "POST",
    body: JSON.stringify({
      category: body.category,
      title: body.title,
      content: body.content,
      name: body.name,
      phone: body.phone,
      cert_no: body.certNo,
      email: body.email,
      password: body.password,
      privacy_agreed: body.privacyAgreed,
      website: body.website,
    }),
  });
}

export async function lookupGuestInquiries(body: GuestLookupBody): Promise<Inquiry[]> {
  const data = await request<InquiryDto[]>("/api/public/inquiries/lookup", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.map(toInquiry);
}
