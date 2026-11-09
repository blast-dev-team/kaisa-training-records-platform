import { describe, expect, it } from 'vitest'

import {
  evaluateExternalCap,
  externalCapExceededMessage,
  isExternalInstitutionType,
  type ExternalHoursSummary,
} from './external-hours'

const summary = (externalHours: number): ExternalHoursSummary => ({
  windowStart: '2023-11-10',
  externalHours,
  maxHours: 16,
  remainingHours: Math.max(0, 16 - externalHours),
})
const RECENT = '2026-10-01'

describe('evaluateExternalCap', () => {
  it('합계가 정확히 16시간이면 허용한다', () => {
    expect(evaluateExternalCap({ summary: summary(15), isExternal: true, startedAt: RECENT, hours: 1 }).blocked).toBe(false)
  })

  it('16시간을 넘으면 차단한다', () => {
    expect(evaluateExternalCap({ summary: summary(15), isExternal: true, startedAt: RECENT, hours: 2 }).blocked).toBe(true)
  })

  it('0.5시간만 넘어도 차단한다', () => {
    expect(evaluateExternalCap({ summary: summary(16), isExternal: true, startedAt: RECENT, hours: 0.5 }).blocked).toBe(true)
  })

  it('사내 교육은 차단하지 않는다', () => {
    expect(evaluateExternalCap({ summary: summary(20), isExternal: false, startedAt: RECENT, hours: 8 }).blocked).toBe(false)
  })

  it('3년 창 밖 교육은 집계·차단하지 않는다', () => {
    const r = evaluateExternalCap({ summary: summary(16), isExternal: true, startedAt: '2020-01-01', hours: 8 })
    expect(r).toMatchObject({ counted: false, blocked: false })
  })

  it('시작일이 비어 있으면 집계하지 않는다(서버와 동일)', () => {
    expect(evaluateExternalCap({ summary: summary(16), isExternal: true, startedAt: '', hours: 8 }).counted).toBe(false)
  })

  it('수정 시 원래 시간보다 줄이거나 같으면 이미 초과한 감리원도 허용한다', () => {
    // 다른 이력 12 + 이 이력 원래 10 = 22 (기존 초과) → 8로 축소
    const r = evaluateExternalCap({ summary: summary(12), isExternal: true, startedAt: RECENT, hours: 8, originalCountedHours: 10 })
    expect(r.blocked).toBe(false)
    expect(r.before).toBe(22)
  })

  it('수정으로 합계가 늘면서 16시간을 넘으면 차단한다', () => {
    const r = evaluateExternalCap({ summary: summary(4), isExternal: true, startedAt: RECENT, hours: 13, originalCountedHours: 10 })
    expect(r.blocked).toBe(true)
  })

  it('취소 상태로 등록하면 집계하지 않는다', () => {
    expect(evaluateExternalCap({ summary: summary(16), isExternal: true, startedAt: RECENT, hours: 8, canceled: true }).blocked).toBe(false)
  })

  it('남은 한도는 0 아래로 내려가지 않는다', () => {
    expect(evaluateExternalCap({ summary: summary(20), isExternal: true, startedAt: RECENT, hours: 1 }).remaining).toBe(0)
  })
})

describe('isExternalInstitutionType', () => {
  it('사내만 협회 교육이고 외부·미선택은 외부다', () => {
    expect(isExternalInstitutionType('internal')).toBe(false)
    expect(isExternalInstitutionType('external')).toBe(true)
    expect(isExternalInstitutionType(null)).toBe(true)
  })
})

describe('externalCapExceededMessage', () => {
  it('서버와 같은 문구를 만든다', () => {
    expect(externalCapExceededMessage(15, 16)).toBe(
      '이미 최근 3년 내 등록된 외부교육이 15시간이라 등록할 수 없어요 (최대 16시간, 남은 한도 1시간)',
    )
  })
})
