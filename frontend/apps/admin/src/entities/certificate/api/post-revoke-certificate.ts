import { apiClient } from '@/src/shared/api'
import type { CertificateDto } from './dto/certificate-dto'
import { mapCertificate } from './map-certificate'
import type { Certificate } from '../model/certificate'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { findCertificate } from './certificate-mock'

/** 확인서 철회 — 사유 필수, 감사로그 자동 기록 */
export const postRevokeCertificate = async (
  certificateId: string,
  reason: string,
): Promise<Certificate> => {
  if (USE_MOCK) {
    await mockDelay()
    const certificate = findCertificate(certificateId)
    if (!certificate) throw new Error('확인서를 찾을 수 없어요')
    certificate.status = 'revoked'
    certificate.revokedAt = new Date().toISOString().slice(0, 19)
    certificate.revokedReason = reason
    return { ...certificate }
  }
  const { data } = await apiClient.post<CertificateDto>(
    `/certificates/${certificateId}/revoke`,
    { reason },
  )
  return mapCertificate(data)
}
