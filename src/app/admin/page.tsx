'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  BarChart3, 
  Calendar, 
  DollarSign, 
  Users, 
  Settings, 
  MapPin,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  LogOut
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

// Demo data
const stats = {
  totalRevenue: 15420,
  monthlyRevenue: 3280,
  totalBookings: 142,
  activeUsers: 89,
  fieldsActive: 12,
  upcomingBookings: 23,
  utilizationRate: 68
}

const recentBookings = [
  {
    id: '1',
    userName: 'John Doe',
    fieldName: 'Soccer Field A',
    date: new Date(),
    time: '14:00 - 15:00',
    status: 'confirmed',
    amount: 120
  },
  {
    id: '2',
    userName: 'Jane Smith',
    fieldName: 'Basketball Court 1',
    date: new Date(Date.now() + 24 * 60 * 60 * 1000),
    time: '18:00 - 19:00',
    status: 'pending',
    amount: 80
  },
  {
    id: '3',
    userName: 'Mike Johnson',
    fieldName: 'Tennis Court A',
    date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    time: '10:00 - 11:00',
    status: 'confirmed',
    amount: 50
  }
]

const fields = [
  { id: '1', name: 'Soccer Field A', type: 'Soccer', status: 'available', utilizationToday: 75 },
  { id: '2', name: 'Soccer Field B', type: 'Soccer', status: 'maintenance', utilizationToday: 0 },
  { id: '3', name: 'Basketball Court 1', type: 'Basketball', status: 'available', utilizationToday: 62 },
  { id: '4', name: 'Tennis Court A', type: 'Tennis', status: 'available', utilizationToday: 88 }
]

export default function AdminDashboard() {
  const router = useRouter()
  const { user, loading, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
    // In a real app, check if user has admin role
  }, [user, loading, router])

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push('/')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-2xl font-bold">
              Field Reservations
            </Link>
            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm font-medium">
              Admin
            </span>
          </div>
          <nav className="flex items-center gap-4">
            <Button variant="ghost" size="icon">
              <Settings className="w-5 h-5" />
            </Button>
            <Button variant="ghost" onClick={handleSignOut}>
              <LogOut className="w-5 h-5 mr-2" />
              Sign Out
            </Button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Manage fields, bookings, and monitor system performance</p>
        </div>

        {/* Key Metrics */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center justify-between">
                Total Revenue
                <DollarSign className="w-4 h-4 text-gray-400" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.totalRevenue.toLocaleString()}</div>
              <p className="text-xs text-green-600 mt-1">+12% from last month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center justify-between">
                Total Bookings
                <Calendar className="w-4 h-4 text-gray-400" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalBookings}</div>
              <p className="text-xs text-green-600 mt-1">+23 this week</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center justify-between">
                Active Users
                <Users className="w-4 h-4 text-gray-400" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeUsers}</div>
              <p className="text-xs text-green-600 mt-1">+5 new this week</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center justify-between">
                Utilization Rate
                <TrendingUp className="w-4 h-4 text-gray-400" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.utilizationRate}%</div>
              <p className="text-xs text-green-600 mt-1">+3% from last week</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="fields">Fields</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Recent Bookings */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Bookings</CardTitle>
                <CardDescription>Latest field reservations across all facilities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentBookings.map((booking) => (
                    <div key={booking.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          booking.status === 'confirmed' ? 'bg-green-100' : 'bg-yellow-100'
                        }`}>
                          {booking.status === 'confirmed' ? 
                            <CheckCircle className="w-5 h-5 text-green-600" /> :
                            <Clock className="w-5 h-5 text-yellow-600" />
                          }
                        </div>
                        <div>
                          <p className="font-medium">{booking.userName}</p>
                          <p className="text-sm text-gray-600">
                            {booking.fieldName} • {format(booking.date, 'MMM d')} • {booking.time}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${booking.amount}</p>
                        <p className="text-xs text-gray-500">{booking.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Field Status */}
            <Card>
              <CardHeader>
                <CardTitle>Field Status</CardTitle>
                <CardDescription>Current status and utilization of all fields</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {fields.map((field) => (
                    <div key={field.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <MapPin className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="font-medium">{field.name}</p>
                          <p className="text-sm text-gray-600">{field.type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium">{field.utilizationToday}%</p>
                          <p className="text-xs text-gray-500">Today</p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          field.status === 'available' ? 'bg-green-100 text-green-700' :
                          field.status === 'maintenance' ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {field.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bookings">
            <Card>
              <CardHeader>
                <CardTitle>All Bookings</CardTitle>
                <CardDescription>Manage and monitor all field reservations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-4 mb-4">
                    <Button variant="outline" size="sm">Today</Button>
                    <Button variant="outline" size="sm">This Week</Button>
                    <Button variant="outline" size="sm">This Month</Button>
                  </div>
                  {recentBookings.map((booking) => (
                    <div key={booking.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">{booking.userName}</p>
                        <p className="text-sm text-gray-600">
                          {booking.fieldName} • {format(booking.date, 'MMMM d, yyyy')} • {booking.time}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">${booking.amount}</span>
                        <Button variant="outline" size="sm">View</Button>
                        <Button variant="outline" size="sm" className="text-red-600">Cancel</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fields">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Field Management</CardTitle>
                    <CardDescription>Add, edit, and manage facility fields</CardDescription>
                  </div>
                  <Button>Add New Field</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {fields.map((field) => (
                    <div key={field.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">{field.name}</p>
                        <p className="text-sm text-gray-600">Type: {field.type} • Status: {field.status}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">Edit</Button>
                        <Button variant="outline" size="sm">View Schedule</Button>
                        <Button variant="outline" size="sm" className="text-red-600">Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>View and manage system users</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-gray-500">User management interface coming soon</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <Card>
              <CardHeader>
                <CardTitle>Analytics & Reports</CardTitle>
                <CardDescription>Detailed insights and performance metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Revenue Trends</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-48 bg-gray-100 rounded flex items-center justify-center">
                        <BarChart3 className="w-12 h-12 text-gray-400" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Booking Patterns</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-48 bg-gray-100 rounded flex items-center justify-center">
                        <TrendingUp className="w-12 h-12 text-gray-400" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}