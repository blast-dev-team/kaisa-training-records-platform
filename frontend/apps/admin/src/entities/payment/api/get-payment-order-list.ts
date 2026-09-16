import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { PaymentOrderDto } from './dto/payment-order-dto'
import { mapPaymentOrder } from './map-payment-order'
import type { PaymentOrderListQuery } from './query/payment-order-list-query'
import type { PaymentOrder } from '../model/payment-order'
import { USE_MOCK, mockDelay, mockPage } from '@/src/shared/api/mock'
import { MOCK_PAYMENT_ORDERS } from './payment-mock'

export const getPaymentOrderList = async (
  query: PaymentOrderListQuery,
): Promise<Paged<PaymentOrder>> => {
  if (USE_MOCK) {
    await mockDelay()
    const filtered = MOCK_PAYMENT_ORDERS.filter(
      p =>
        (!query.traineeId || p.traineeId === query.traineeId) &&
        (!query.status || p.status === query.status),
    )
    return mockPage(filtered, query.page, query.limit)
  }
  const { data } = await apiClient.get<PagedResponse<PaymentOrderDto>>('/payment-orders', {
    params: {
      trainee_id: query.traineeId || undefined,
      status: query.status || undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    },
  })
  return {
    items: data.items.map(mapPaymentOrder),
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.total_pages,
  }
}
