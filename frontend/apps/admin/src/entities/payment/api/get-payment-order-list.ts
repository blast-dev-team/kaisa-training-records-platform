import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { PaymentOrderDto } from './dto/payment-order-dto'
import { mapPaymentOrder } from './map-payment-order'
import type { PaymentOrderListQuery } from './query/payment-order-list-query'
import type { PaymentOrder } from '../model/payment-order'

export const getPaymentOrderList = async (
  query: PaymentOrderListQuery,
): Promise<Paged<PaymentOrder>> => {
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
