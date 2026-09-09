import { queryOptions } from '@tanstack/react-query'
import { getPaymentOrderList } from './get-payment-order-list'
import type { PaymentOrderListQuery } from './query/payment-order-list-query'

export const paymentOrderQueries = {
  all: () => ['payment-orders'] as const,
  lists: () => [...paymentOrderQueries.all(), 'list'] as const,
  list: (query: PaymentOrderListQuery) =>
    queryOptions({
      queryKey: [...paymentOrderQueries.lists(), query],
      queryFn: () => getPaymentOrderList(query),
    }),
}
