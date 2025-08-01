'use client'

import { useState } from 'react'
import { Reservation, RefundPolicy } from '@/types/reservation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  AlertCircle, 
  DollarSign, 
  Clock,
  Calendar,
  Info
} from 'lucide-react'
import { format, differenceInHours } from 'date-fns'

interface CancellationModalProps {
  reservation: Reservation
  refundPolicy?: RefundPolicy
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => Promise<void>
}

export function CancellationModal({
  reservation,
  refundPolicy = {
    fullRefundHours: 48,
    partialRefundHours: 24,
    partialRefundPercentage: 50,
    noRefundHours: 12
  },
  open,
  onOpenChange,
  onConfirm
}: CancellationModalProps) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Calculate refund details
  const reservationDateTime = new Date(`${reservation.date}T${reservation.startTime}`)
  const now = new Date()
  const hoursUntilReservation = differenceInHours(reservationDateTime, now)
  
  const getRefundDetails = () => {
    if (hoursUntilReservation >= refundPolicy.fullRefundHours) {
      return {
        percentage: 100,
        amount: reservation.totalPrice,
        type: 'full',
        message: 'You will receive a full refund'
      }
    } else if (hoursUntilReservation >= refundPolicy.partialRefundHours) {
      const amount = reservation.totalPrice * (refundPolicy.partialRefundPercentage / 100)
      return {
        percentage: refundPolicy.partialRefundPercentage,
        amount,
        type: 'partial',
        message: `You will receive a ${refundPolicy.partialRefundPercentage}% refund`
      }
    } else if (hoursUntilReservation >= refundPolicy.noRefundHours) {
      return {
        percentage: 0,
        amount: 0,
        type: 'none',
        message: 'No refund available for late cancellations'
      }
    } else {
      return {
        percentage: 0,
        amount: 0,
        type: 'too_late',
        message: 'This reservation cannot be cancelled'
      }
    }
  }

  const refundDetails = getRefundDetails()
  const canCancel = refundDetails.type !== 'too_late'

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('Please provide a reason for cancellation')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await onConfirm(reason)
      onOpenChange(false)
    } catch (err) {
      setError('Failed to cancel reservation. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Cancel Reservation</DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel this reservation?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Reservation Details */}
          <div className="space-y-2 p-4 bg-muted rounded-lg">
            <h4 className="font-medium">{reservation.field?.name}</h4>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {format(new Date(reservation.date), 'MMMM d, yyyy')}
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {format(new Date(`2000-01-01T${reservation.startTime}`), 'h:mm a')} - 
                {format(new Date(`2000-01-01T${reservation.endTime}`), 'h:mm a')}
              </div>
            </div>
          </div>

          {/* Refund Information */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Time until reservation:</span>
              <Badge variant={hoursUntilReservation < 24 ? 'destructive' : 'secondary'}>
                {hoursUntilReservation} hours
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Original Amount:</span>
                <span className="font-medium">${reservation.totalPrice.toFixed(2)}</span>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span>Refund Amount:</span>
                <span className={`font-medium ${
                  refundDetails.percentage === 100 ? 'text-green-600' :
                  refundDetails.percentage > 0 ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  ${refundDetails.amount.toFixed(2)} ({refundDetails.percentage}%)
                </span>
              </div>
            </div>

            <Progress 
              value={refundDetails.percentage} 
              className="h-2"
            />

            <Alert className={
              refundDetails.percentage === 100 ? 'border-green-200' :
              refundDetails.percentage > 0 ? 'border-yellow-200' :
              'border-red-200'
            }>
              <DollarSign className="w-4 h-4" />
              <AlertDescription>
                {refundDetails.message}
              </AlertDescription>
            </Alert>
          </div>

          {/* Refund Policy Info */}
          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription>
              <p className="font-medium mb-1">Cancellation Policy:</p>
              <ul className="text-xs space-y-1">
                <li>• {refundPolicy.fullRefundHours}+ hours before: 100% refund</li>
                <li>• {refundPolicy.partialRefundHours}-{refundPolicy.fullRefundHours} hours before: {refundPolicy.partialRefundPercentage}% refund</li>
                <li>• Less than {refundPolicy.partialRefundHours} hours: No refund</li>
              </ul>
            </AlertDescription>
          </Alert>

          {canCancel ? (
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for cancellation *</Label>
              <Textarea
                id="reason"
                placeholder="Please tell us why you're cancelling..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                disabled={loading}
              />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                This reservation cannot be cancelled less than {refundPolicy.noRefundHours} hours before the start time.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Keep Reservation
          </Button>
          {canCancel && (
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={loading || !reason.trim()}
            >
              {loading ? 'Cancelling...' : 'Cancel Reservation'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}