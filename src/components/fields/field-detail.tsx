'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  MapPin,
  Users,
  DollarSign,
  Star,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Wifi,
  Car,
  Lightbulb,
  Droplet,
} from 'lucide-react'
import Link from 'next/link'
import { Field } from '@/types/field'

// Mock data - replace with actual API call
const mockField: Field = {
  id: '1',
  name: 'Central Park Soccer Field A',
  description: 'Professional-grade soccer field with FIFA-approved artificial turf. Perfect for league games, tournaments, and training sessions.',
  location: {
    address: '123 Central Park Ave',
    city: 'New York',
    state: 'NY',
    zipCode: '10001',
    coordinates: { lat: 40.7829, lng: -73.9654 },
  },
  type: 'turf',
  sport: ['soccer', 'football'],
  capacity: 22,
  amenities: [
    { id: '1', name: 'Lighting', icon: 'lightbulb' },
    { id: '2', name: 'Parking', icon: 'car' },
    { id: '3', name: 'Restrooms', icon: 'droplet' },
    { id: '4', name: 'WiFi', icon: 'wifi' },
  ],
  images: [
    '/api/placeholder/800/600',
    '/api/placeholder/800/600',
    '/api/placeholder/800/600',
  ],
  status: 'available',
  pricing: {
    basePrice: 120,
    peakHours: { start: '18:00', end: '22:00', multiplier: 1.5 },
    weekendMultiplier: 1.25,
    deposit: 50,
  },
  rules: 'No metal cleats allowed. Clean up after use. Report any damage immediately.',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const amenityIcons: Record<string, any> = {
  wifi: Wifi,
  car: Car,
  lightbulb: Lightbulb,
  droplet: Droplet,
}

interface FieldDetailProps {
  fieldId: string
}

export function FieldDetail({ fieldId }: FieldDetailProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const field = mockField // Replace with actual data fetching

  const nextImage = () => {
    setCurrentImageIndex((prev) => 
      prev === field.images.length - 1 ? 0 : prev + 1
    )
  }

  const prevImage = () => {
    setCurrentImageIndex((prev) => 
      prev === 0 ? field.images.length - 1 : prev - 1
    )
  }

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-xl">
        <motion.div
          key={currentImageIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="relative h-[400px] sm:h-[500px]"
        >
          <img
            src={field.images[currentImageIndex]}
            alt={field.name}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </motion.div>

        {/* Image Navigation */}
        {field.images.length > 1 && (
          <>
            <button
              onClick={prevImage}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={nextImage}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
              {field.images.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentImageIndex(index)}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    index === currentImageIndex
                      ? 'bg-white'
                      : 'bg-white/50'
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {/* Status Badge */}
        <Badge
          className="absolute top-4 right-4"
          variant={field.status === 'available' ? 'success' : 'destructive'}
        >
          {field.status}
        </Badge>
      </div>

      {/* Main Content */}
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold mb-2">{field.name}</h1>
            <div className="flex items-center gap-4 text-muted-foreground">
              <div className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                <span>{field.location.address}, {field.location.city}</span>
              </div>
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="font-medium text-foreground">4.8</span>
                <span>(124 reviews)</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="amenities">Amenities</TabsTrigger>
              <TabsTrigger value="rules">Rules & Info</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-6 mt-6">
              <div>
                <h3 className="font-semibold mb-2">Description</h3>
                <p className="text-muted-foreground">{field.description}</p>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Sports Supported</h3>
                <div className="flex gap-2">
                  {field.sport.map((sport) => (
                    <Badge key={sport} variant="secondary">
                      {sport}
                    </Badge>
                  ))}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2">Field Type</h3>
                  <p className="text-muted-foreground capitalize">{field.type}</p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Maximum Capacity</h3>
                  <p className="text-muted-foreground">{field.capacity} players</p>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="amenities" className="mt-6">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {field.amenities.map((amenity) => {
                  const Icon = amenityIcons[amenity.icon] || Wifi
                  return (
                    <div
                      key={amenity.id}
                      className="flex items-center gap-3 rounded-lg border p-4"
                    >
                      <Icon className="h-5 w-5 text-primary" />
                      <span className="font-medium">{amenity.name}</span>
                    </div>
                  )
                })}
              </div>
            </TabsContent>
            
            <TabsContent value="rules" className="mt-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Field Rules</h3>
                  <p className="text-muted-foreground whitespace-pre-line">
                    {field.rules}
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Booking Policy</h3>
                  <ul className="space-y-2 text-muted-foreground">
                    <li>• Minimum 2-hour booking required</li>
                    <li>• Cancellations must be made 24 hours in advance</li>
                    <li>• Deposit of ${field.pricing.deposit} required</li>
                    <li>• Peak hours: {field.pricing.peakHours?.start} - {field.pricing.peakHours?.end}</li>
                  </ul>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Booking Card */}
        <div className="lg:col-span-1">
          <Card className="sticky top-24">
            <CardHeader>
              <CardTitle>Book This Field</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Base Price</span>
                  <span className="font-semibold">${field.pricing.basePrice}/hr</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Peak Hours</span>
                  <span>+{((field.pricing.peakHours?.multiplier || 1) - 1) * 100}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Weekends</span>
                  <span>+{((field.pricing.weekendMultiplier || 1) - 1) * 100}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Deposit</span>
                  <span>${field.pricing.deposit}</span>
                </div>
              </div>
              
              <div className="pt-4 space-y-3">
                <Link href={`/booking/${field.id}`} className="block">
                  <Button className="w-full" size="lg">
                    <Calendar className="mr-2 h-4 w-4" />
                    Check Availability
                  </Button>
                </Link>
                <Button variant="outline" className="w-full">
                  <Clock className="mr-2 h-4 w-4" />
                  View Schedule
                </Button>
              </div>
              
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground text-center">
                  Free cancellation up to 24 hours before
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}