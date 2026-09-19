import type { Certificate } from '../model/certificate'

/**
 * 확인서 목업. 교육생(tr-00x)·교육이력(rcd-00x)과 id를 공유한다.
 * USE_MOCK 동안 철회(revoke)가 배열을 직접 갱신한다.
 */
export const MOCK_CERTIFICATES: Certificate[] = [
  {
    id: 'crt-001',
    certificateNo: 'KAISA-2026-0004821',
    certificateRequestId: null,
    traineeId: 'tr-001',
    trainingRecordId: 'rcd-001',
    paymentOrderId: 'pay-001',
    issuedName: '김민준',
    courseName: '비파괴검사 계속교육 (정기)',
    institutionName: '협회 본부',
    totalHours: 8,
    completedHours: 8,
    trainingStartedAt: '2026-05-14',
    trainingEndedAt: '2026-05-14',
    issuedAt: '2026-09-06T14:22:00',
    expiresAt: '2026-12-06',
    downloadedAt: '2026-09-18T10:00:00+09:00',
    downloadCount: 1,
    status: 'issued',
    revokedAt: null,
    revokedReason: null,
  },
  {
    id: 'crt-002',
    certificateNo: 'KAISA-2026-0004102',
    certificateRequestId: null,
    traineeId: 'tr-002',
    trainingRecordId: 'rcd-002',
    paymentOrderId: 'pay-002',
    issuedName: '이서연',
    courseName: '감리원 법정 계속교육 2차',
    institutionName: '부산지회',
    totalHours: 16,
    completedHours: 16,
    trainingStartedAt: '2025-11-02',
    trainingEndedAt: '2025-11-03',
    issuedAt: '2026-03-05T09:40:00',
    expiresAt: '2026-06-05',
    downloadedAt: '2026-09-18T10:00:00+09:00',
    downloadCount: 1,
    status: 'issued',
    revokedAt: null,
    revokedReason: null,
  },
  {
    id: 'crt-003',
    certificateNo: 'KAISA-2025-0002861',
    certificateRequestId: null,
    traineeId: 'tr-005',
    trainingRecordId: 'rcd-003',
    paymentOrderId: 'pay-003',
    issuedName: '정하준',
    courseName: '안전관리 실무 심화과정',
    institutionName: '협회 본부',
    totalHours: 4,
    completedHours: 4,
    trainingStartedAt: '2024-07-19',
    trainingEndedAt: '2024-07-19',
    issuedAt: '2024-08-01T10:00:00',
    expiresAt: '2024-11-01',
    downloadedAt: null,
    downloadCount: 0,
    status: 'revoked',
    revokedAt: '2024-09-01T09:00:00',
    revokedReason: '발급 정보 오류 — 재발급 후 철회',
  },
]


/** id로 확인서 목업을 찾는다 */
export function findCertificate(certificateId: string): Certificate | undefined {
  return MOCK_CERTIFICATES.find(c => c.id === certificateId)
}
