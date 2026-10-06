/**
 * from/to 기간 쌍 보정 — 범위가 어긋나면 반대쪽 필드를 입력값에 맞춘다.
 *
 * 'YYYY-MM-DD' 문자열 비교는 사전순 = 시간순이라 그대로 비교한다.
 */
export interface DateRange {
  from: string;
  to: string;
}

/**
 * from 변경 시 to보다 크면 to가 따라 올라가고,
 * to 변경 시 from보다 작으면 from이 따라 내려간다 (from ≤ to 유지).
 */
export function adjustDateRange(
  current: DateRange,
  changed: "from" | "to",
  value: string,
): DateRange {
  const from = changed === "from" ? value : current.from;
  const to = changed === "to" ? value : current.to;
  if (from && to && from > to) {
    return changed === "from" ? { from, to: from } : { from: to, to };
  }
  return { from, to };
}
