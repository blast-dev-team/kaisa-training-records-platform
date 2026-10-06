import type { PaymentOrderDto } from './dto/payment-order-dto'
import type { PaymentOrder } from '../model/payment-order'

export function mapPaymentOrder(dto: PaymentOrderDto): PaymentOrder {
  return {
    id: dto.id,
    orderNo: dto.order_no,
    certificateRequestId: dto.certificate_request_id,
    traineeId: dto.trainee_id,
    traineeName: dto.trainee_name ?? null,
    gradeName: dto.grade_name ?? null,
    certNo: dto.cert_no ?? null,
    docCount: dto.doc_count ?? 0,
    firstCourseName: dto.first_course_name ?? null,
    amountKrw: dto.amount_krw,
    currency: dto.currency,
    status: dto.status,
    paidAt: dto.paid_at,
    createdAt: dto.created_at,
  }
}
