'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Field } from '@/types/field'
import { FieldCard } from '@/components/fields/field-card'
import { FieldFilters } from '@/components/fields/field-filters'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Calendar, Clock, MapPin, Users } from 'lucide-react'

export default function BookingFieldSelectionPage() {
  const router = useRouter()
  const [fields, setFields] = useState<Field[]>([])
  const [filteredFields, setFilteredFields] = useState<Field[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedField, setSelectedField] = useState<string | null>(null)
  const [filters, setFilters] = useState({
    type: '',
    status: 'available',
    search: ''
  })

  useEffect(() => {
    fetchFields()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [fields, filters])

  const fetchFields = async () => {
    try {
      const response = await fetch('/api/fields')
      if (!response.ok) throw new Error('Failed to fetch fields')
      const data = await response.json()
      setFields(data)
    } catch (error) {
      console.error('Error fetching fields:', error)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = fields.filter(field => field.status === 'available')

    if (filters.type) {
      filtered = filtered.filter(field => field.type === filters.type)
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(field => 
        field.name.toLowerCase().includes(searchLower) ||
        field.description?.toLowerCase().includes(searchLower) ||
        field.address.toLowerCase().includes(searchLower)
      )
    }

    setFilteredFields(filtered)
  }

  const handleFieldSelect = (fieldId: string) => {
    setSelectedField(fieldId)
  }

  const handleContinue = () => {
    if (selectedField) {
      router.push(`/booking/time-slots?fieldId=${selectedField}`)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Book a Field</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Book a Field</h1>
        <p className="text-muted-foreground">
          Select a field to check availability and make a reservation
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-semibold">
              1
            </div>
            <span className="ml-2 font-medium">Select Field</span>
          </div>
          <div className="w-16 h-0.5 bg-gray-300" />
          <div className="flex items-center opacity-50">
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center font-semibold">
              2
            </div>
            <span className="ml-2">Choose Time</span>
          </div>
          <div className="w-16 h-0.5 bg-gray-300" />
          <div className="flex items-center opacity-50">
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center font-semibold">
              3
            </div>
            <span className="ml-2">Confirm Booking</span>
          </div>
        </div>
      </div>

      <FieldFilters 
        filters={filters}
        onFilterChange={setFilters}
      />

      {filteredFields.length === 0 ? (
        <Alert className="mt-8">
          <AlertDescription>
            No fields available matching your criteria. Try adjusting your filters.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {filteredFields.map((field) => (
              <div
                key={field.id}
                className={`cursor-pointer transition-all ${
                  selectedField === field.id 
                    ? 'ring-2 ring-primary ring-offset-2 rounded-lg' 
                    : ''
                }`}
                onClick={() => handleFieldSelect(field.id)}
              >
                <FieldCard field={field} />
                {selectedField === field.id && (
                  <div className="mt-2 p-4 bg-primary/10 rounded-lg">
                    <p className="text-sm font-medium text-primary">
                      Selected for booking
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-end">
            <Button
              size="lg"
              onClick={handleContinue}
              disabled={!selectedField}
            >
              Continue to Time Selection
            </Button>
          </div>
        </>
      )}
    </div>
  )
}