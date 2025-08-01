import { ConflictInfo } from '@/types/reservation'
import { Badge } from '@/components/ui/badge'
import { 
  AlertCircle, 
  Users, 
  User,
  Clock,
  Calendar
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ConflictIndicatorProps {
  conflicts: ConflictInfo[]
  className?: string
}

export function ConflictIndicator({ conflicts, className }: ConflictIndicatorProps) {
  if (!conflicts || conflicts.length === 0) return null

  const conflictType = conflicts[0].type
  const conflictCount = conflicts.length

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={conflictType === 'full' ? 'destructive' : 'outline'}
            className={`cursor-help ${className}`}
          >
            <AlertCircle className="w-3 h-3 mr-1" />
            {conflictCount > 1 ? `${conflictCount} Conflicts` : 'Conflict'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-2">
            <p className="font-semibold">Booking Conflicts:</p>
            {conflicts.map((conflict, index) => (
              <div key={conflict.reservationId} className="text-sm">
                <div className="flex items-center gap-2">
                  {conflict.teamName ? (
                    <>
                      <Users className="w-3 h-3" />
                      <span>{conflict.teamName}</span>
                    </>
                  ) : (
                    <>
                      <User className="w-3 h-3" />
                      <span>{conflict.userName || 'Another user'}</span>
                    </>
                  )}
                </div>
                {conflict.type === 'partial' && (
                  <span className="text-xs text-muted-foreground ml-5">
                    Partial overlap
                  </span>
                )}
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface TimeSlotStatusProps {
  available: boolean
  conflicts?: ConflictInfo[]
  price?: number
  className?: string
}

export function TimeSlotStatus({ 
  available, 
  conflicts, 
  price,
  className 
}: TimeSlotStatusProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {price && available && (
        <Badge variant="secondary" className="text-xs">
          ${price}
        </Badge>
      )}
      
      {!available && conflicts && conflicts.length > 0 && (
        <ConflictIndicator conflicts={conflicts} />
      )}
      
      {!available && (!conflicts || conflicts.length === 0) && (
        <Badge variant="outline" className="text-xs">
          Unavailable
        </Badge>
      )}
      
      {available && (
        <Badge variant="default" className="text-xs bg-green-500">
          Available
        </Badge>
      )}
    </div>
  )
}

interface ConflictWarningProps {
  conflicts: Array<{
    date: string
    startTime: string
    endTime: string
    conflicts: ConflictInfo[]
  }>
}

export function ConflictWarning({ conflicts }: ConflictWarningProps) {
  if (!conflicts || conflicts.length === 0) return null

  return (
    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-destructive">
            Booking Conflicts Detected
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            The following time slots have conflicts:
          </p>
          <div className="mt-2 space-y-1">
            {conflicts.map((slot, index) => (
              <div key={index} className="text-sm flex items-center gap-2">
                <Calendar className="w-3 h-3" />
                <span>{new Date(slot.date).toLocaleDateString()}</span>
                <Clock className="w-3 h-3" />
                <span>
                  {slot.startTime.substring(0, 5)} - {slot.endTime.substring(0, 5)}
                </span>
                <span className="text-muted-foreground">
                  ({slot.conflicts.length} conflict{slot.conflicts.length > 1 ? 's' : ''})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}