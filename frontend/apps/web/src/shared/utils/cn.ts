import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Tailwind 클래스 병합 유틸 — 조건부 클래스 + 충돌 해소.
 *
 * 타입 스케일이 `text-12`(=12px) 같은 숫자형 클래스라 tailwind-merge 기본
 * 설정은 이걸 폰트 크기가 아닌 텍스트 색으로 분류한다. 그러면 `cn(
 * "text-gray-700", "text-12")` 에서 색 클래스가 충돌 제거돼 사라지므로,
 * 숫자 크기를 font-size 그룹으로 등록해 막는다.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["10", "11", "12", "13", "14", "15", "16", "18", "20", "22", "24", "28"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
