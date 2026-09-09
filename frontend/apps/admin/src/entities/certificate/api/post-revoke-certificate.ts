import { apiClient } from '@/src/shared/api'
import type { CertificateDto } from './dto/certificate-dto'
import { mapCertificate } from './map-certificate'
import type { Certificate } from '../model/certificate'

/** 확인서 철회 — 사유 필수, 감사로그 자동 기록 */
export const postRevokeCertificate = async (
  certificateId: string,
  reason: string,
): Promise<Certificate> => {
  const { data } = await apiClient.post<CertificateDto>(
    `/certificates/${certificateId}/revoke`,
    { reason },
  )
  return mapCertificate(data)
}
