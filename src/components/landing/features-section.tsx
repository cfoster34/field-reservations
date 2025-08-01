'use client'

import { motion } from 'framer-motion'
import {
  Calendar,
  CreditCard,
  Bell,
  Shield,
  BarChart3,
  Users,
  MapPin,
  Clock,
  Smartphone,
} from 'lucide-react'

const features = [
  {
    name: 'Real-Time Availability',
    description: 'See available time slots instantly and book your field in seconds.',
    icon: Calendar,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    name: 'Secure Payments',
    description: 'Pay safely with multiple payment options and instant confirmations.',
    icon: CreditCard,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    name: 'Smart Notifications',
    description: 'Get reminders, updates, and alerts for all your reservations.',
    icon: Bell,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  {
    name: 'Team Management',
    description: 'Organize your team, share schedules, and coordinate effortlessly.',
    icon: Users,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  {
    name: 'Analytics Dashboard',
    description: 'Track your usage, expenses, and team performance with detailed insights.',
    icon: BarChart3,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
  },
  {
    name: 'Multiple Locations',
    description: 'Find and book fields across different venues and neighborhoods.',
    icon: MapPin,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  {
    name: '24/7 Access',
    description: 'Book fields anytime, anywhere. Our platform is always available.',
    icon: Clock,
    color: 'text-teal-600',
    bgColor: 'bg-teal-100',
  },
  {
    name: 'Mobile First',
    description: 'Fully responsive design works perfectly on all your devices.',
    icon: Smartphone,
    color: 'text-pink-600',
    bgColor: 'bg-pink-100',
  },
  {
    name: 'Secure & Reliable',
    description: 'Your data is protected with enterprise-grade security measures.',
    icon: Shield,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Everything You Need to Manage Field Reservations
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Our comprehensive platform provides all the tools you need to book, manage, and optimize your sports field usage.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div
              key={feature.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="relative group"
            >
              <div className="h-full rounded-2xl border bg-card p-8 shadow-sm transition-all hover:shadow-lg hover:scale-105">
                <div className={`${feature.bgColor} w-12 h-12 rounded-lg flex items-center justify-center mb-4`}>
                  <feature.icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {feature.name}
                </h3>
                <p className="text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}