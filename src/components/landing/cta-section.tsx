'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, CheckCircle } from 'lucide-react'

const benefits = [
  'No credit card required',
  'Free for coaches',
  'Cancel anytime',
  '24/7 support',
]

export function CTASection() {
  return (
    <section className="relative overflow-hidden bg-primary py-24">
      <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/80" />
      <div className="container relative z-10 mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mx-auto max-w-4xl text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Ready to Transform Your Field Management?
          </h2>
          <p className="mt-6 text-lg leading-8 text-white/90">
            Join thousands of teams and leagues who trust us to manage their field reservations. 
            Start your free trial today and see the difference.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {benefits.map((benefit) => (
              <div key={benefit} className="flex items-center gap-2 text-white">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm font-medium">{benefit}</span>
              </div>
            ))}
          </div>

          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link href="/signup">
              <Button 
                size="lg" 
                variant="secondary"
                className="rounded-full px-8 bg-white text-primary hover:bg-white/90"
              >
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button 
                size="lg" 
                variant="outline" 
                className="rounded-full px-8 border-white text-white hover:bg-white/10"
              >
                Contact Sales
              </Button>
            </Link>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3"
          >
            <div className="text-center">
              <div className="text-4xl font-bold text-white">10K+</div>
              <div className="mt-2 text-sm text-white/80">Active Teams</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white">50K+</div>
              <div className="mt-2 text-sm text-white/80">Monthly Bookings</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white">99.9%</div>
              <div className="mt-2 text-sm text-white/80">Uptime</div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}