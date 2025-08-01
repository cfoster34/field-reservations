'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Search, MapPin, Star, Users, Filter } from 'lucide-react'
import { Field } from '@/types/field'
import { cn } from '@/utils/cn'

// Mock data - replace with actual API call
const mockFields: Field[] = [
  {
    id: '1',
    name: 'Central Park Soccer Field A',
    description: 'Professional-grade soccer field',
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
    amenities: [],
    images: ['/api/placeholder/400/300'],
    status: 'available',
    pricing: { basePrice: 120 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // Add more fields
]

interface FieldSelectionProps {
  onSelectField: (field: Field) => void
  selectedFieldId?: string
}

export function FieldSelection({ onSelectField, selectedFieldId }: FieldSelectionProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSport, setSelectedSport] = useState('all')
  const [filteredFields, setFilteredFields] = useState(mockFields)

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    // Implement search logic
  }

  const handleSportFilter = (sport: string) => {
    setSelectedSport(sport)
    // Implement filter logic
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search fields by name or location..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          <Button
            variant={selectedSport === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSportFilter('all')}
          >
            All Sports
          </Button>
          <Button
            variant={selectedSport === 'soccer' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSportFilter('soccer')}
          >
            Soccer
          </Button>
          <Button
            variant={selectedSport === 'basketball' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSportFilter('basketball')}
          >
            Basketball
          </Button>
          <Button
            variant={selectedSport === 'tennis' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSportFilter('tennis')}
          >
            Tennis
          </Button>
          <Button
            variant={selectedSport === 'baseball' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSportFilter('baseball')}
          >
            Baseball
          </Button>
        </div>
      </div>

      {/* Field List */}
      <RadioGroup
        value={selectedFieldId}
        onValueChange={(value) => {
          const field = filteredFields.find((f) => f.id === value)
          if (field) onSelectField(field)
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {filteredFields.map((field, index) => (
            <motion.div
              key={field.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card
                className={cn(
                  'cursor-pointer transition-all hover:shadow-md',
                  selectedFieldId === field.id && 'ring-2 ring-primary'
                )}
              >
                <CardContent className="p-0">
                  <div className="relative">
                    <img
                      src={field.images[0] || '/api/placeholder/400/200'}
                      alt={field.name}
                      className="h-32 w-full object-cover rounded-t-lg"
                    />
                    <Badge
                      className="absolute top-2 right-2"
                      variant={field.status === 'available' ? 'success' : 'destructive'}
                    >
                      {field.status}
                    </Badge>
                  </div>
                  
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <RadioGroupItem
                        value={field.id}
                        id={field.id}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor={field.id}
                          className="text-base font-semibold cursor-pointer"
                        >
                          {field.name}
                        </Label>
                        
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span>{field.location.address}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              <span>{field.capacity} max</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              <span className="text-sm font-medium">4.8</span>
                              <span className="text-xs text-muted-foreground">(124)</span>
                            </div>
                            <div className="text-lg font-bold text-primary">
                              ${field.pricing.basePrice}/hr
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </RadioGroup>

      {filteredFields.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No fields found matching your criteria</p>
        </div>
      )}
    </div>
  )
}