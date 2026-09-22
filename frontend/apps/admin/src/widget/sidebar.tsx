import { NavLink } from "react-router";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  CalendarDays,
  ListOrdered,
  GraduationCap,
  Building2,
  Medal,
  FileBadge,
  CreditCard,
  UserCog,
  MailPlus,
  ScrollText,
} from "lucide-react";
import { cn } from "@/src/shared/utils/cn";
import logoMark from "@/src/assets/logo-mark.svg";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** super 전용 메뉴 */
  superOnly?: boolean;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "대시보드",
    items: [{ to: "/", label: "대시보드", icon: LayoutDashboard }],
  },
  {
    title: "회원",
    items: [
      { to: "/trainees", label: "감리원", icon: Users },
      { to: "/membership-grades", label: "회원등급", icon: Medal },
      { to: "/identity-reviews", label: "본인인증 심사", icon: ShieldCheck },
    ],
  },
  {
    title: "교육",
    items: [
      { to: "/course-sessions", label: "교육 일정", icon: CalendarDays },
      { to: "/training-records", label: "교육 내역", icon: GraduationCap },
      { to: "/external-completions", label: "외부 내역", icon: FileBadge },
      { to: "/institutions", label: "기관 · 과정", icon: Building2 },
      { to: "/session-names", label: "회차명 관리", icon: ListOrdered },
    ],
  },
  {
    title: "발급 · 결제",
    items: [
      { to: "/certificates", label: "확인서 발급 내역", icon: FileBadge },
      { to: "/payment-orders", label: "결제 내역", icon: CreditCard },
    ],
  },
  {
    title: "운영",
    items: [
      { to: "/admin-users", label: "관리자 계정", icon: UserCog, superOnly: true },
      { to: "/allowed-emails", label: "초대 이메일", icon: MailPlus },
      { to: "/audit-logs", label: "감사 로그", icon: ScrollText },
    ],
  },
];

export function Sidebar({ role }: { role: "super" | "staff" }) {
  return (
    <aside className="w-[220px] shrink-0 border-r border-line bg-panel flex flex-col">
      {/* 브랜드 */}
      <div className="h-14 flex items-center gap-2.5 px-5 border-b border-line shrink-0">
        <img src={logoMark} alt="KAISA 로고" className="size-10" />

        <div className="leading-tight">
          <p className="text-[14px] font-semibold text-ink">KAISA 관리자</p>
          <p className="text-[11px] text-ink-3">교육내역 관리</p>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 flex flex-col gap-5">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.superOnly || role === "super");
          if (items.length === 0) return null;
          return (
            <div key={group.title} className="flex flex-col gap-1">
              <p className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {group.title}
              </p>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 px-2.5 h-9 rounded-md text-[13px] font-medium transition-colors",
                      isActive
                        ? "bg-accent-soft text-accent-ink"
                        : "text-ink-2 hover:bg-panel-2 hover:text-ink",
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
