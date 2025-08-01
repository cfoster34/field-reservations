'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Sport, FieldType } from '@/types/field'
import { Filter, X } from 'lucide-react'

interface Filters {
  sports: Sport[]
  fieldTypes: FieldType[]
  priceRange: [number, number]
  capacity: number
  location: string
}

interface FieldFiltersProps {
  onFiltersChange: (filters: Filters) => void
}

export function FieldFilters({ onFiltersChange }: FieldFiltersProps) {
  const [filters, setFilters] = useState<Filters>({
    sports: [],
    fieldTypes: [],
    priceRange: [0, 500],
    capacity: 0,
    location: '',
  })

  const sports = Object.values(Sport)
  const fieldTypes = Object.values(FieldType)

  const handleSportToggle = (sport: Sport) => {
    const newSports = filters.sports.includes(sport)
      ? filters.sports.filter((s) => s !== sport)
      : [...filters.sports, sport]
    
    const newFilters = { ...filters, sports: newSports }
    setFilters(newFilters)
    onFiltersChange(newFilters)
  }

  const handleFieldTypeToggle = (type: FieldType) => {
    const newTypes = filters.fieldTypes.includes(type)
      ? filters.fieldTypes.filter((t) => t !== type)
      : [...filters.fieldTypes, type]
    
    const newFilters = { ...filters, fieldTypes: newTypes }
    setFilters(newFilters)
    onFiltersChange(newFilters)
  }

  const handlePriceChange = (value: number[]) => {
    const newFilters = { ...filters, priceRange: value as [number, number] }
    setFilters(newFilters)
    onFiltersChange(newFilters)
  }

  const handleReset = () => {
    const newFilters = {
      sports: [],
      fieldTypes: [],
      priceRange: [0, 500] as [number, number],
      capacity: 0,
      location: '',
    }
    setFilters(newFilters)
    onFiltersChange(newFilters)
  }

  const activeFiltersCount = 
    filters.sports.length + 
    filters.fieldTypes.length + 
    (filters.priceRange[0] > 0 || filters.priceRange[1] < 500 ? 1 : 0) +
    (filters.capacity > 0 ? 1 : 0) +
    (filters.location ? 1 : 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          <CardTitle>Filters</CardTitle>
          {activeFiltersCount > 0 && (
            <Badge variant="secondary">{activeFiltersCount}</Badge>
          )}
        </div>
        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-8 px-2"
          >
            <X className="h-3 w-3 mr-1" />
            Reset
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sports Filter */}
        <div className="space-y-3">
          <Label>Sports</Label>
          <div className="space-y-2">
            {sports.map((sport) => (
              <div key={sport} className="flex items-center space-x-2">
                <Checkbox
                  id={sport}
                  checked={filters.sports.includes(sport)}
                  onCheckedChange={() => handleSportToggle(sport)}
                />
                <label
                  htmlFor={sport}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 capitalize"
                >
                  {sport}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Field Type Filter */}
        <div className="space-y-3">
          <Label>Field Type</Label>
          <div className="space-y-2">
            {fieldTypes.map((type) => (
              <div key={type} className="flex items-center space-x-2">
                <Checkbox
                  id={type}
                  checked={filters.fieldTypes.includes(type)}
                  onCheckedChange={() => handleFieldTypeToggle(type)}
                />
                <label
                  htmlFor={type}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 capitalize"
                >
                  {type}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Price Range Filter */}
        <div className="space-y-3">
          <Label>Price Range (per hour)</Label>
          <div className="px-2">
            <Slider
              value={filters.priceRange}
              onValueChange={handlePriceChange}
              min={0}
              max={500}
              step={10}
              className="mb-2"
            />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>${filters.priceRange[0]}</span>
              <span>${filters.priceRange[1]}</span>
            </div>
          </div>
        </div>

        {/* Capacity Filter */}
        <div className="space-y-3">
          <Label htmlFor="capacity">Minimum Capacity</Label>
          <Input
            id="capacity"
            type="number"
            placeholder="0"
            value={filters.capacity || ''}
            onChange={(e) => {
              const newFilters = {
                ...filters,
                capacity: parseInt(e.target.value) || 0,
              }
              setFilters(newFilters)
              onFiltersChange(newFilters)
            }}
          />
        </div>

        {/* Location Filter */}
        <div className="space-y-3">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            placeholder="City or ZIP code"
            value={filters.location}
            onChange={(e) => {
              const newFilters = { ...filters, location: e.target.value }
              setFilters(newFilters)
              onFiltersChange(newFilters)
            }}
          />
        </div>
      </CardContent>
    </Card>
  )
}