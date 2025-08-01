import { NextRequest, NextResponse } from 'next/server'
import { RefundService } from '@/lib/stripe/refund-service'
import { errorResponse, successResponse, withErrorHandler } from '@/lib/api/middleware'
import { RefundReason } from '@/types/payment'

const refundService = new RefundService()

// Get refunds for league
export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const leagueId = searchParams.get('leagueId')
  const paymentId = searchParams.get('paymentId')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const status = searchParams.get('status')

  if (paymentId) {
    const refunds = await refundService.getPaymentRefunds(paymentId)
    return successResponse({ refunds })
  }

  if (!leagueId) {
    return errorResponse('League ID or Payment ID is required', 400)
  }

  const refunds = await refundService.getLeagueRefunds({
    leagueId,
    limit,
    offset,
    status: status || undefined,
  })

  return successResponse({
    refunds,
    pagination: {
      limit,
      offset,
      hasMore: refunds.length === limit,
    },
  })
})

// Create refund
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json()
  const {
    paymentId,
    reservationId,
    amount,
    reason,
    notes,
    refundApplicationFee = false,
    reverseTransfer = false,
    metadata = {},
  } = body

  // Handle reservation cancellation refund
  if (reservationId && !paymentId) {
    const refund = await refundService.processReservationCancellationRefund({
      reservationId,
      reason: reason as RefundReason || RefundReason.CANCELLATION,
    })

    if (!refund) {
      return successResponse({
        message: 'No refund processed (outside refund window or no payment found)',
        refund: null,
      })
    }

    return successResponse({
      refund: refund.refund,
      stripeRefund: refund.stripeRefund,
    })
  }

  // Handle direct payment refund
  if (!paymentId) {
    return errorResponse('Payment ID or Reservation ID is required', 400)
  }

  if (!reason) {
    return errorResponse('Refund reason is required', 400)
  }

  const refund = await refundService.createRefund({
    paymentId,
    amount: amount ? Math.round(amount * 100) : undefined, // Convert to cents
    reason: reason as RefundReason,
    notes,
    refundApplicationFee,
    reverseTransfer,
    metadata,
  })

  return successResponse({
    refund: refund.refund,
    stripeRefund: refund.stripeRefund,
  })
})