'use client'

import { useState } from 'react'
import { FieldCard } from '@/components/fields/field-card'
import { FieldFilters } from '@/components/fields/field-filters'
import { Button } from '@/components/ui/button'
import { Grid3X3, List } from 'lucide-react'
import { Field } from '@/types/field'
import { cn } from '@/utils/cn'

// Mock data - replace with actual API call
const mockFields: Field[] = [
  {
    id: '1',
    name: 'Central Park Soccer Field A',
    description: 'Professional-grade soccer field with FIFA-approved artificial turf',
    location: {
      address: '123 Central Park Ave',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      coordinates: { lat: 40.7829, lng: -73.9654 },
    },
    type: 'turf',
    sport: ['soccer'],
    capacity: 22,
    amenities: [
      { id: '1', name: 'Lighting', icon: 'lightbulb' },
      { id: '2', name: 'Parking', icon: 'car' },
      { id: '3', name: 'Restrooms', icon: 'restroom' },
    ],
    images: ['/api/placeholder/800/600'],
    status: 'available',
    pricing: {
      basePrice: 120,
      peakHours: { start: '18:00', end: '22:00', multiplier: 1.5 },
      weekendMultiplier: 1.25,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // Add more mock fields as needed
]

export function FieldList() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [filteredFields, setFilteredFields] = useState(mockFields)

  const handleFiltersChange = (filters: any) => {
    // Implement filtering logic here
    console.log('Filters changed:', filters)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Available Fields</h1>
          <p className="text-muted-foreground">
            Browse and book from {filteredFields.length} available fields
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setViewMode('grid')}
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-80">
          <FieldFilters onFiltersChange={handleFiltersChange} />
        </aside>
        
        <main className="flex-1">
          <div className={cn(
            viewMode === 'grid'
              ? 'grid gap-6 sm:grid-cols-2 xl:grid-cols-3'
              : 'space-y-4'
          )}>
            {filteredFields.map((field) => (
              <FieldCard key={field.id} field={field} view={viewMode} />
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}