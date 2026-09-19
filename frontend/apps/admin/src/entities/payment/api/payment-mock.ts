import type { PaymentOrder } from '../model/payment-order'

/**
 * 결제 주문 목업. 교육생(tr-00x)·확인서(crt-00x)와 id를 공유한다.
 * USE_MOCK 동안 환불이 배열을 직접 갱신한다.
 */
export const MOCK_PAYMENT_ORDERS: PaymentOrder[] = [
  {
    id: 'pay-001',
    orderNo: 'ORD-20260906-0001',
    certificateRequestId: 'crq-001',
    traineeName: '홍○○',
    traineeId: 'tr-001',
    amountKrw: 3000,
    currency: 'KRW',
    status: 'paid',
    paidAt: '2026-09-06T14:21:00',
    createdAt: '2026-09-06T14:20:00',
  },
  {
    id: 'pay-002',
    orderNo: 'ORD-20260305-0002',
    certificateRequestId: 'crq-002',
    traineeName: '홍○○',
    traineeId: 'tr-002',
    amountKrw: 3000,
    currency: 'KRW',
    status: 'paid',
    paidAt: '2026-03-05T09:39:00',
    createdAt: '2026-03-05T09:38:00',
  },
  {
    id: 'pay-003',
    orderNo: 'ORD-20240801-0003',
    certificateRequestId: 'crq-003',
    traineeName: '홍○○',
    traineeId: 'tr-005',
    amountKrw: 3000,
    currency: 'KRW',
    status: 'refunded',
    paidAt: '2024-07-31T23:59:00',
    createdAt: '2024-07-31T23:55:00',
  },
  {
    id: 'pay-004',
    orderNo: 'ORD-20260410-0004',
    certificateRequestId: null,
    traineeName: '홍○○',
    traineeId: 'tr-004',
    amountKrw: 3000,
    currency: 'KRW',
    status: 'pending',
    paidAt: null,
    createdAt: '2026-04-10T16:40:00',
  },
]
