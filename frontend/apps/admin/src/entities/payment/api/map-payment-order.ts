import type { PaymentOrderDto } from './dto/payment-order-dto'
import type { PaymentOrder } from '../model/payment-order'

export function mapPaymentOrder(dto: PaymentOrderDto): PaymentOrder {
  return {
    id: dto.id,
    orderNo: dto.order_no,
    certificateRequestId: dto.certificate_request_id,
    traineeId: dto.trainee_id,
    amountKrw: dto.amount_krw,
    currency: dto.currency,
    status: dto.status,
    paidAt: dto.paid_at,
    createdAt: dto.created_at,
  }
}
