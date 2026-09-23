import { apiClient } from '@/src/shared/api'

/** 어드민 발급 결과 — 그룹(=문서 1건)별로 돌아온다 */
export interface CertificateIssueGroupResult {
  traineeId: string
  /** 발급 이벤트당 채번된 문서번호 — 모든 내역이 발급되므로 항상 있다 */
  docNo: string
  certificateIds: string[]
}

export interface CertificateIssueRequest {
  groups: {
    traineeId: string
    recordIds: string[]
  }[]
}

/** 어드민 발급 저장 — 결제 없이 감리원별 묶음씩 발급을 확정하고 문서번호를 부여한다 */
export const postIssueCertificates = async (
  body: CertificateIssueRequest,
): Promise<{ groups: CertificateIssueGroupResult[] }> => {
  const { data } = await apiClient.post<{
    groups: {
      trainee_id: string
      doc_no: string
      certificate_ids: string[]
    }[]
  }>('/certificates/issue', {
    groups: body.groups.map((g) => ({
      trainee_id: g.traineeId,
      record_ids: g.recordIds,
    })),
  })
  return {
    groups: data.groups.map((g) => ({
      traineeId: g.trainee_id,
      docNo: g.doc_no,
      certificateIds: g.certificate_ids,
    })),
  }
}
