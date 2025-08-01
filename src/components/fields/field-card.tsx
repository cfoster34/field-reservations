'use client'

import { motion } from 'framer-motion'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Users, DollarSign, Star } from 'lucide-react'
import Link from 'next/link'
import { Field } from '@/types/field'
import { cn } from '@/utils/cn'

interface FieldCardProps {
  field: Field
  view?: 'grid' | 'list'
}

export function FieldCard({ field, view = 'grid' }: FieldCardProps) {
  const isGridView = view === 'grid'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02 }}
      className={cn(isGridView ? '' : 'w-full')}
    >
      <Card className={cn(
        'overflow-hidden transition-shadow hover:shadow-lg',
        !isGridView && 'flex flex-col sm:flex-row'
      )}>
        <div className={cn(
          'relative',
          isGridView ? 'h-48' : 'h-48 sm:h-auto sm:w-64'
        )}>
          <img
            src={field.images[0] || '/api/placeholder/400/300'}
            alt={field.name}
            className="h-full w-full object-cover"
          />
          <Badge
            className="absolute top-2 right-2"
            variant={field.status === 'available' ? 'success' : 'destructive'}
          >
            {field.status}
          </Badge>
        </div>
        
        <div className={cn('flex flex-1 flex-col', !isGridView && 'p-6')}>
          <CardContent className={cn(isGridView && 'p-4')}>
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-lg">{field.name}</h3>
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-medium">4.8</span>
                </div>
              </div>
              
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {field.location.address}
              </div>
              
              <div className="flex flex-wrap gap-2">
                {field.sport.map((sport) => (
                  <Badge key={sport} variant="secondary" className="text-xs">
                    {sport}
                  </Badge>
                ))}
              </div>
              
              {field.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {field.description}
                </p>
              )}
              
              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center gap-1 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{field.capacity} max</span>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span>${field.pricing.basePrice}/hr</span>
                </div>
              </div>
            </div>
          </CardContent>
          
          <CardFooter className={cn(
            'gap-2',
            isGridView ? 'p-4 pt-0' : 'mt-auto'
          )}>
            <Link href={`/fields/${field.id}`} className="flex-1">
              <Button variant="outline" className="w-full">
                View Details
              </Button>
            </Link>
            <Link href={`/booking/${field.id}`} className="flex-1">
              <Button className="w-full">
                Book Now
              </Button>
            </Link>
          </CardFooter>
        </div>
      </Card>
    </motion.div>
  )
}