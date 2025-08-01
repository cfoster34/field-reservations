import { stripe, TAX_CONFIG } from './client'
import { createClient } from '@/lib/supabase/server'
import { CustomerService } from './customer-service'
import Stripe from 'stripe'
import { InvoiceStatus } from '@/types/payment'

export class InvoiceService {
  private supabase = createClient()
  private customerService = new CustomerService()

  /**
   * Create a draft invoice
   */
  async createInvoice({
    customerId,
    subscriptionId,
    description,
    lineItems = [],
    dueDate,
    collectionMethod = 'charge_automatically',
    automaticTax = TAX_CONFIG.enabled,
  }: {
    customerId: string
    subscriptionId?: string
    description?: string
    lineItems?: Array<{
      price?: string
      priceData?: {
        currency: string
        product: string
        unitAmount: number
      }
      quantity?: number
      description?: string
    }>
    dueDate?: Date
    collectionMethod?: 'charge_automatically' | 'send_invoice'
    automaticTax?: boolean
  }) {
    try {
      // Get customer record
      const customer = await this.customerService.getCustomer(customerId)
      if (!customer) {
        throw new Error('Customer not found')
      }

      // Prepare invoice parameters
      const invoiceParams: Stripe.InvoiceCreateParams = {
        customer: customer.stripeCustomerId,
        collection_method: collectionMethod,
        description,
        auto_advance: collectionMethod === 'charge_automatically',
        metadata: {
          customerId,
          subscriptionId: subscriptionId || '',
        },
      }

      if (subscriptionId) {
        invoiceParams.subscription = subscriptionId
      }

      if (dueDate && collectionMethod === 'send_invoice') {
        invoiceParams.due_date = Math.floor(dueDate.getTime() / 1000)
      }

      if (automaticTax) {
        invoiceParams.automatic_tax = {
          enabled: true,
        }
      }

      // Create invoice in Stripe
      const stripeInvoice = await stripe.invoices.create(invoiceParams)

      // Add line items if provided and not subscription-based
      if (lineItems.length > 0 && !subscriptionId) {
        for (const item of lineItems) {
          const invoiceItemParams: Stripe.InvoiceItemCreateParams = {
            customer: customer.stripeCustomerId,
            invoice: stripeInvoice.id,
            quantity: item.quantity || 1,
            description: item.description,
          }

          if (item.price) {
            invoiceItemParams.price = item.price
          } else if (item.priceData) {
            invoiceItemParams.price_data = {
              currency: item.priceData.currency,
              product: item.priceData.product,
              unit_amount: item.priceData.unitAmount,
            }
          }

          await stripe.invoiceItems.create(invoiceItemParams)
        }
      }

      // Save invoice to database
      const { data: invoice, error } = await this.supabase
        .from('invoices')
        .insert({
          subscription_id: subscriptionId || null,
          customer_id: customerId,
          stripe_invoice_id: stripeInvoice.id,
          number: stripeInvoice.number || `draft-${stripeInvoice.id}`,
          status: stripeInvoice.status as InvoiceStatus,
          currency: stripeInvoice.currency.toUpperCase(),
          amount_due: stripeInvoice.amount_due / 100,
          amount_paid: stripeInvoice.amount_paid / 100,
          amount_remaining: stripeInvoice.amount_remaining / 100,
          subtotal: stripeInvoice.subtotal / 100,
          total: stripeInvoice.total / 100,
          tax: stripeInvoice.tax || 0,
          description,
          due_date: dueDate ? dueDate.toISOString() : null,
          hosted_invoice_url: stripeInvoice.hosted_invoice_url,
          invoice_pdf: stripeInvoice.invoice_pdf,
        })
        .select()
        .single()

      if (error) {
        // Cleanup Stripe invoice if database insert fails
        await stripe.invoices.del(stripeInvoice.id)
        throw error
      }

      return {
        invoice,
        stripeInvoice,
      }
    } catch (error) {
      console.error('Error creating invoice:', error)
      throw error
    }
  }

  /**
   * Finalize and send an invoice
   */
  async finalizeInvoice(invoiceId: string, autoAdvance = true) {
    try {
      // Get invoice record
      const { data: invoice, error } = await this.supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single()

      if (error || !invoice) {
        throw new Error('Invoice not found')
      }

      // Finalize invoice in Stripe
      const finalizedInvoice = await stripe.invoices.finalizeInvoice(
        invoice.stripe_invoice_id,
        {
          auto_advance: autoAdvance,
        }
      )

      // Update invoice record
      const { data: updatedInvoice, error: updateError } = await this.supabase
        .from('invoices')
        .update({
          status: finalizedInvoice.status as InvoiceStatus,
          number: finalizedInvoice.number!,
          amount_due: finalizedInvoice.amount_due / 100,
          amount_paid: finalizedInvoice.amount_paid / 100,
          amount_remaining: finalizedInvoice.amount_remaining / 100,
          subtotal: finalizedInvoice.subtotal / 100,
          total: finalizedInvoice.total / 100,
          tax: (finalizedInvoice.tax || 0) / 100,
          hosted_invoice_url: finalizedInvoice.hosted_invoice_url,
          invoice_pdf: finalizedInvoice.invoice_pdf,
        })
        .eq('id', invoiceId)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      // Send invoice if collection method is manual
      if (finalizedInvoice.collection_method === 'send_invoice') {
        await this.sendInvoice(invoiceId)
      }

      return {
        invoice: updatedInvoice,
        stripeInvoice: finalizedInvoice,
      }
    } catch (error) {
      console.error('Error finalizing invoice:', error)
      throw error
    }
  }

  /**
   * Send an invoice to customer
   */
  async sendInvoice(invoiceId: string) {
    try {
      const { data: invoice, error } = await this.supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single()

      if (error || !invoice) {
        throw new Error('Invoice not found')
      }

      // Send invoice via Stripe
      const sentInvoice = await stripe.invoices.sendInvoice(invoice.stripe_invoice_id)

      // Get customer info for notification
      const customer = await this.customerService.getCustomer(invoice.customer_id)
      if (customer) {
        // Send notification
        await this.supabase
          .from('notifications')
          .insert({
            user_id: customer.user_id,
            type: 'email',
            title: 'Invoice Sent',
            content: `Invoice ${invoice.number} has been sent to your email address.`,
            data: {
              invoiceId: invoice.id,
              invoiceNumber: invoice.number,
              amountDue: invoice.amount_due,
              dueDate: invoice.due_date,
              hostedInvoiceUrl: invoice.hosted_invoice_url,
            },
          })
      }

      return sentInvoice
    } catch (error) {
      console.error('Error sending invoice:', error)
      throw error
    }
  }

  /**
   * Pay an invoice
   */
  async payInvoice(invoiceId: string, paymentMethodId?: string) {
    try {
      const { data: invoice, error } = await this.supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single()

      if (error || !invoice) {
        throw new Error('Invoice not found')
      }

      const payParams: Stripe.InvoicePayParams = {}
      
      if (paymentMethodId) {
        payParams.payment_method = paymentMethodId
      }

      // Pay invoice in Stripe
      const paidInvoice = await stripe.invoices.pay(invoice.stripe_invoice_id, payParams)

      // Update invoice record
      const { data: updatedInvoice, error: updateError } = await this.supabase
        .from('invoices')
        .update({
          status: paidInvoice.status as InvoiceStatus,
          amount_paid: paidInvoice.amount_paid / 100,
          amount_remaining: paidInvoice.amount_remaining / 100,
          paid_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      return {
        invoice: updatedInvoice,
        stripeInvoice: paidInvoice,
      }
    } catch (error) {
      console.error('Error paying invoice:', error)
      throw error
    }
  }

  /**
   * Void an invoice
   */
  async voidInvoice(invoiceId: string) {
    try {
      const { data: invoice, error } = await this.supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single()

      if (error || !invoice) {
        throw new Error('Invoice not found')
      }

      // Void invoice in Stripe
      const voidedInvoice = await stripe.invoices.voidInvoice(invoice.stripe_invoice_id)

      // Update invoice record
      const { data: updatedInvoice, error: updateError } = await this.supabase
        .from('invoices')
        .update({
          status: 'void',
        })
        .eq('id', invoiceId)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      return {
        invoice: updatedInvoice,
        stripeInvoice: voidedInvoice,
      }
    } catch (error) {
      console.error('Error voiding invoice:', error)
      throw error
    }
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId: string) {
    try {
      const { data: invoice, error } = await this.supabase
        .from('invoices')
        .select(`
          *,
          customers (
            *,
            user_profiles (full_name, email)
          ),
          subscriptions (*)
        `)
        .eq('id', invoiceId)
        .single()

      if (error) {
        throw error
      }

      return invoice
    } catch (error) {
      console.error('Error getting invoice:', error)
      throw error
    }
  }

  /**
   * Get invoices for a customer
   */
  async getCustomerInvoices({
    customerId,
    limit = 50,
    offset = 0,
    status,
  }: {
    customerId: string
    limit?: number
    offset?: number
    status?: InvoiceStatus
  }) {
    try {
      let query = this.supabase
        .from('invoices')
        .select(`
          *,
          customers (
            *,
            user_profiles (full_name, email)
          ),
          subscriptions (*)
        `)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (status) {
        query = query.eq('status', status)
      }

      const { data: invoices, error } = await query

      if (error) {
        throw error
      }

      return invoices
    } catch (error) {
      console.error('Error getting customer invoices:', error)
      throw error
    }
  }

  /**
   * Get invoices for a league
   */
  async getLeagueInvoices({
    leagueId,
    limit = 50,
    offset = 0,
    status,
  }: {
    leagueId: string
    limit?: number
    offset?: number
    status?: InvoiceStatus
  }) {
    try {
      let query = this.supabase
        .from('invoices')
        .select(`
          *,
          customers!inner (
            *,
            user_profiles (full_name, email)
          ),
          subscriptions (*)
        `)
        .eq('customers.league_id', leagueId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (status) {
        query = query.eq('status', status)
      }

      const { data: invoices, error } = await query

      if (error) {
        throw error
      }

      return invoices
    } catch (error) {
      console.error('Error getting league invoices:', error)
      throw error
    }
  }

  /**
   * Generate receipt for a payment
   */
  async generateReceipt(paymentId: string) {
    try {
      // Get payment details
      const payment = await this.supabase
        .from('payments')
        .select(`
          *,
          customers (
            *,
            user_profiles (full_name, email)
          ),
          reservations (
            *,
            fields (name, address),
            leagues (name, logo_url)
          )
        `)
        .eq('id', paymentId)
        .single()

      if (payment.error || !payment.data) {
        throw new Error('Payment not found')
      }

      const paymentData = payment.data

      // Get Stripe payment intent for receipt URL
      let receiptUrl = null
      if (paymentData.stripe_payment_intent_id) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentData.stripe_payment_intent_id)
          const charge = paymentIntent.charges?.data?.[0]
          receiptUrl = charge?.receipt_url
        } catch (error) {
          console.warn('Could not retrieve Stripe receipt URL:', error)
        }
      }

      // Generate receipt data
      const receipt = {
        id: `receipt-${paymentData.id}`,
        paymentId: paymentData.id,
        number: `RCP-${Date.now()}`,
        date: paymentData.paid_at || paymentData.created_at,
        customer: {
          name: paymentData.customers?.name || paymentData.customers?.user_profiles?.full_name,
          email: paymentData.customers?.email || paymentData.customers?.user_profiles?.email,
          address: paymentData.customers?.address,
        },
        business: {
          name: paymentData.reservations?.leagues?.name || 'Field Reservations',
          logo: paymentData.reservations?.leagues?.logo_url,
        },
        items: [
          {
            description: paymentData.description || 'Service Payment',
            quantity: 1,
            unitPrice: paymentData.amount,
            total: paymentData.amount,
          },
        ],
        subtotal: paymentData.amount,
        tax: paymentData.tax_amount || 0,
        processingFee: paymentData.processing_fee || 0,
        total: paymentData.amount + (paymentData.tax_amount || 0) + (paymentData.processing_fee || 0),
        currency: paymentData.currency,
        paymentMethod: 'Card',
        status: paymentData.status,
        stripeReceiptUrl: receiptUrl,
        metadata: paymentData.metadata,
      }

      return receipt
    } catch (error) {
      console.error('Error generating receipt:', error)
      throw error
    }
  }

  /**
   * Get invoice statistics for a league
   */
  async getInvoiceStats(leagueId: string, period = '30d') {
    try {
      const startDate = new Date()
      switch (period) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7)
          break
        case '30d':
          startDate.setDate(startDate.getDate() - 30)
          break
        case '90d':
          startDate.setDate(startDate.getDate() - 90)
          break
        case '1y':
          startDate.setFullYear(startDate.getFullYear() - 1)
          break
      }

      const { data: invoices, error } = await this.supabase
        .from('invoices')
        .select(`
          *,
          customers!inner (league_id)
        `)
        .eq('customers.league_id', leagueId)
        .gte('created_at', startDate.toISOString())

      if (error) {
        throw error
      }

      const stats = {
        totalInvoices: invoices.length,
        totalAmount: 0,
        paidAmount: 0,
        overdueAmount: 0,
        draftInvoices: 0,
        openInvoices: 0,
        paidInvoices: 0,
        voidInvoices: 0,
        averageInvoiceValue: 0,
        paymentRate: 0,
      }

      const now = new Date()

      for (const invoice of invoices) {
        stats.totalAmount += invoice.total || 0
        
        switch (invoice.status) {
          case 'draft':
            stats.draftInvoices++
            break
          case 'open':
            stats.openInvoices++
            // Check if overdue
            if (invoice.due_date && new Date(invoice.due_date) < now) {
              stats.overdueAmount += invoice.amount_remaining || 0
            }
            break
          case 'paid':
            stats.paidInvoices++
            stats.paidAmount += invoice.amount_paid || 0
            break
          case 'void':
            stats.voidInvoices++
            break
        }
      }

      stats.averageInvoiceValue = stats.totalInvoices > 0 
        ? stats.totalAmount / stats.totalInvoices 
        : 0

      stats.paymentRate = stats.totalInvoices > 0 
        ? (stats.paidInvoices / stats.totalInvoices) * 100 
        : 0

      return stats
    } catch (error) {
      console.error('Error getting invoice stats:', error)
      throw error
    }
  }

  /**
   * Update invoice status (internal use)
   */
  async updateInvoiceStatus({
    invoiceId,
    status,
    paidAt,
    metadata,
  }: {
    invoiceId: string
    status: InvoiceStatus
    paidAt?: string
    metadata?: Record<string, any>
  }) {
    try {
      const updateData: any = { status }
      
      if (paidAt) updateData.paid_at = paidAt
      if (metadata) updateData.metadata = metadata

      const { data: invoice, error } = await this.supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoiceId)
        .select()
        .single()

      if (error) {
        throw error
      }

      return invoice
    } catch (error) {
      console.error('Error updating invoice status:', error)
      throw error
    }
  }
}