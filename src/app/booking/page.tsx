'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface Field {
  id: string
  name: string
  type: string
  description?: string
  capacity?: number
  price_per_hour?: number
  location?: string
  image_url?: string
}

export default function BookingPage() {
  const [fields, setFields] = useState<Field[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const supabase = createClientComponentClient()

  useEffect(() => {
    fetchFields()
  }, [])

  const fetchFields = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('fields')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (error) throw error
      setFields(data || [])
    } catch (err) {
      console.error('Error fetching fields:', err)
      setError('Unable to load fields. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold">
            Field Reservations
          </Link>
          <nav className="flex gap-4">
            <Link href="/booking">
              <Button variant="ghost">Book a Field</Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link href="/signup">
              <Button>Sign Up</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Available Fields</h1>

        {loading && (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading fields...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-8">
            {error}
          </div>
        )}

        {!loading && !error && fields.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600">No fields available at the moment.</p>
          </div>
        )}

        {!loading && !error && fields.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {fields.map((field) => (
              <Card key={field.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle>{field.name}</CardTitle>
                  <CardDescription>{field.type}</CardDescription>
                </CardHeader>
                <CardContent>
                  {field.description && (
                    <p className="text-sm text-gray-600 mb-4">{field.description}</p>
                  )}
                  <div className="space-y-2 text-sm">
                    {field.location && (
                      <p><span className="font-medium">Location:</span> {field.location}</p>
                    )}
                    {field.capacity && (
                      <p><span className="font-medium">Capacity:</span> {field.capacity} people</p>
                    )}
                    {field.price_per_hour && (
                      <p><span className="font-medium">Price:</span> ${field.price_per_hour}/hour</p>
                    )}
                  </div>
                  <div className="mt-4">
                    <Link href={`/booking/time-slots?field=${field.id}`}>
                      <Button className="w-full">Select Time Slot</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Demo data for testing when no database connection */}
        {!loading && error && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Demo Fields (for testing)</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle>Soccer Field A</CardTitle>
                  <CardDescription>Full-size soccer field</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-4">Professional-grade grass field with lighting</p>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium">Location:</span> North Campus</p>
                    <p><span className="font-medium">Capacity:</span> 22 people</p>
                    <p><span className="font-medium">Price:</span> $120/hour</p>
                  </div>
                  <div className="mt-4">
                    <Link href="/booking/time-slots?field=demo1">
                      <Button className="w-full">Select Time Slot</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle>Basketball Court 1</CardTitle>
                  <CardDescription>Indoor basketball court</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-4">Regulation size indoor court</p>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium">Location:</span> Sports Complex</p>
                    <p><span className="font-medium">Capacity:</span> 12 people</p>
                    <p><span className="font-medium">Price:</span> $80/hour</p>
                  </div>
                  <div className="mt-4">
                    <Link href="/booking/time-slots?field=demo2">
                      <Button className="w-full">Select Time Slot</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle>Tennis Court A</CardTitle>
                  <CardDescription>Outdoor tennis court</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-4">Well-maintained hard court</p>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium">Location:</span> East Courts</p>
                    <p><span className="font-medium">Capacity:</span> 4 people</p>
                    <p><span className="font-medium">Price:</span> $50/hour</p>
                  </div>
                  <div className="mt-4">
                    <Link href="/booking/time-slots?field=demo3">
                      <Button className="w-full">Select Time Slot</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}