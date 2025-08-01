import { stripe, TAX_CONFIG } from './client'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { Customer, CustomerAddress, TaxId, PaymentMethodType } from '@/types/payment'

export class CustomerService {
  private supabase = createClient()

  /**
   * Get or create a Stripe customer
   */
  async getOrCreateCustomer({
    userId,
    leagueId,
    email,
    name,
    phone,
    address,
  }: {
    userId: string
    leagueId: string
    email?: string
    name?: string
    phone?: string
    address?: CustomerAddress
  }): Promise<Customer> {
    try {
      // Check if customer already exists
      const { data: existingCustomer } = await this.supabase
        .from('customers')
        .select('*')
        .eq('user_id', userId)
        .eq('league_id', leagueId)
        .single()

      if (existingCustomer) {
        return existingCustomer
      }

      // Get user profile if email not provided
      if (!email) {
        const { data: userProfile } = await this.supabase
          .from('user_profiles')
          .select('email, full_name, phone')
          .eq('id', userId)
          .single()

        if (userProfile) {
          email = userProfile.email
          name = name || userProfile.full_name
          phone = phone || userProfile.phone
        }
      }

      if (!email) {
        throw new Error('Email is required to create customer')
      }

      // Create customer in Stripe
      const stripeCustomer = await stripe.customers.create({
        email,
        name,
        phone,
        address: address ? {
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          postal_code: address.postalCode,
          country: address.country,
        } : undefined,
        metadata: {
          userId,
          leagueId,
        },
        tax_exempt: 'none',
        ...(TAX_CONFIG.taxIdCollection.enabled && {
          tax_id_data: TAX_CONFIG.taxIdCollection.required === 'if_supported' ? [] : undefined,
        }),
      })

      // Save customer to database
      const { data: customer, error } = await this.supabase
        .from('customers')
        .insert({
          user_id: userId,
          league_id: leagueId,
          stripe_customer_id: stripeCustomer.id,
          email,
          name,
          phone,
          address,
        })
        .select()
        .single()

      if (error) {
        // Cleanup Stripe customer if database insert fails
        await stripe.customers.del(stripeCustomer.id)
        throw error
      }

      return customer
    } catch (error) {
      console.error('Error creating customer:', error)
      throw error
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomer(customerId: string): Promise<Customer | null> {
    try {
      const { data: customer, error } = await this.supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      return customer || null
    } catch (error) {
      console.error('Error getting customer:', error)
      throw error
    }
  }

  /**
   * Get customer by user and league
   */
  async getCustomerByUserAndLeague(userId: string, leagueId: string): Promise<Customer | null> {
    try {
      const { data: customer, error } = await this.supabase
        .from('customers')
        .select('*')
        .eq('user_id', userId)
        .eq('league_id', leagueId)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      return customer || null
    } catch (error) {
      console.error('Error getting customer by user and league:', error)
      throw error
    }
  }

  /**
   * Update customer information
   */
  async updateCustomer({
    customerId,
    name,
    email,
    phone,
    address,
    taxIds,
  }: {
    customerId: string
    name?: string
    email?: string
    phone?: string
    address?: CustomerAddress
    taxIds?: TaxId[]
  }): Promise<Customer> {
    try {
      const customer = await this.getCustomer(customerId)
      if (!customer) {
        throw new Error('Customer not found')
      }

      // Update customer in Stripe
      const updateData: Stripe.CustomerUpdateParams = {}
      
      if (name !== undefined) updateData.name = name
      if (email !== undefined) updateData.email = email
      if (phone !== undefined) updateData.phone = phone
      
      if (address) {
        updateData.address = {
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          postal_code: address.postalCode,
          country: address.country,
        }
      }

      if (Object.keys(updateData).length > 0) {
        await stripe.customers.update(customer.stripeCustomerId, updateData)
      }

      // Update tax IDs if provided
      if (taxIds && taxIds.length > 0) {
        // Remove existing tax IDs
        const existingTaxIds = await stripe.customers.listTaxIds(customer.stripeCustomerId)
        for (const taxId of existingTaxIds.data) {
          await stripe.customers.deleteTaxId(customer.stripeCustomerId, taxId.id)
        }

        // Add new tax IDs
        for (const taxId of taxIds) {
          await stripe.customers.createTaxId(customer.stripeCustomerId, {
            type: taxId.type as Stripe.CustomerCreateTaxIdParams.Type,
            value: taxId.value,
          })
        }
      }

      // Update customer in database
      const { data: updatedCustomer, error } = await this.supabase
        .from('customers')
        .update({
          ...(name !== undefined && { name }),
          ...(email !== undefined && { email }),
          ...(phone !== undefined && { phone }),
          ...(address && { address }),
          ...(taxIds && { tax_ids: taxIds }),
        })
        .eq('id', customerId)
        .select()
        .single()

      if (error) {
        throw error
      }

      return updatedCustomer
    } catch (error) {
      console.error('Error updating customer:', error)
      throw error
    }
  }

  /**
   * Delete customer
   */
  async deleteCustomer(customerId: string): Promise<void> {
    try {
      const customer = await this.getCustomer(customerId)
      if (!customer) {
        return
      }

      // Delete customer from Stripe
      await stripe.customers.del(customer.stripeCustomerId)

      // Delete customer from database
      const { error } = await this.supabase
        .from('customers')
        .delete()
        .eq('id', customerId)

      if (error) {
        throw error
      }
    } catch (error) {
      console.error('Error deleting customer:', error)
      throw error
    }
  }

  /**
   * Add payment method to customer
   */
  async addPaymentMethod({
    customerId,
    paymentMethodId,
    setAsDefault = false,
  }: {
    customerId: string
    paymentMethodId: string
    setAsDefault?: boolean
  }) {
    try {
      const customer = await this.getCustomer(customerId)
      if (!customer) {
        throw new Error('Customer not found')
      }

      // Attach payment method to customer in Stripe
      const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customer.stripeCustomerId,
      })

      // Set as default if requested
      if (setAsDefault) {
        await stripe.customers.update(customer.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        })

        // Update existing default payment methods
        await this.supabase
          .from('payment_methods')
          .update({ is_default: false })
          .eq('customer_id', customerId)

        // Update customer's default payment method
        await this.supabase
          .from('customers')
          .update({ default_payment_method_id: paymentMethodId })
          .eq('id', customerId)
      }

      // Save payment method to database
      const { data: savedPaymentMethod, error } = await this.supabase
        .from('payment_methods')
        .insert({
          stripe_payment_method_id: paymentMethodId,
          customer_id: customerId,
          type: paymentMethod.type as PaymentMethodType,
          card_data: paymentMethod.card ? {
            brand: paymentMethod.card.brand,
            last4: paymentMethod.card.last4,
            exp_month: paymentMethod.card.exp_month,
            exp_year: paymentMethod.card.exp_year,
            fingerprint: paymentMethod.card.fingerprint,
          } : null,
          bank_account_data: paymentMethod.type === 'us_bank_account' && paymentMethod.us_bank_account ? {
            bank_name: paymentMethod.us_bank_account.bank_name,
            last4: paymentMethod.us_bank_account.last4,
            account_type: paymentMethod.us_bank_account.account_type,
          } : null,
          is_default: setAsDefault,
        })
        .select()
        .single()

      if (error) {
        throw error
      }

      return savedPaymentMethod
    } catch (error) {
      console.error('Error adding payment method:', error)
      throw error
    }
  }

  /**
   * Remove payment method from customer
   */
  async removePaymentMethod({
    customerId,
    paymentMethodId,
  }: {
    customerId: string
    paymentMethodId: string
  }) {
    try {
      // Remove payment method from database first
      const { data: paymentMethod, error: selectError } = await this.supabase
        .from('payment_methods')
        .select('*')
        .eq('customer_id', customerId)
        .eq('stripe_payment_method_id', paymentMethodId)
        .single()

      if (selectError && selectError.code !== 'PGRST116') {
        throw selectError
      }

      if (paymentMethod) {
        // If this was the default payment method, clear it
        if (paymentMethod.is_default) {
          const customer = await this.getCustomer(customerId)
          if (customer) {
            await stripe.customers.update(customer.stripeCustomerId, {
              invoice_settings: {
                default_payment_method: null,
              },
            })

            await this.supabase
              .from('customers')
              .update({ default_payment_method_id: null })
              .eq('id', customerId)
          }
        }

        // Delete from database
        const { error: deleteError } = await this.supabase
          .from('payment_methods')
          .delete()
          .eq('id', paymentMethod.id)

        if (deleteError) {
          throw deleteError
        }
      }

      // Detach payment method from Stripe
      await stripe.paymentMethods.detach(paymentMethodId)

      return true
    } catch (error) {
      console.error('Error removing payment method:', error)
      throw error
    }
  }

  /**
   * Get customer's payment methods
   */
  async getPaymentMethods(customerId: string) {
    try {
      const { data: paymentMethods, error } = await this.supabase
        .from('payment_methods')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      return paymentMethods
    } catch (error) {
      console.error('Error getting payment methods:', error)
      throw error
    }
  }

  /**
   * Set default payment method
   */
  async setDefaultPaymentMethod({
    customerId,
    paymentMethodId,
  }: {
    customerId: string
    paymentMethodId: string
  }) {
    try {
      const customer = await this.getCustomer(customerId)
      if (!customer) {
        throw new Error('Customer not found')
      }

      // Update in Stripe
      await stripe.customers.update(customer.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      })

      // Update all payment methods to not be default
      await this.supabase
        .from('payment_methods')
        .update({ is_default: false })
        .eq('customer_id', customerId)

      // Set the new default
      const { data: updatedPaymentMethod, error } = await this.supabase
        .from('payment_methods')
        .update({ is_default: true })
        .eq('customer_id', customerId)
        .eq('stripe_payment_method_id', paymentMethodId)
        .select()
        .single()

      if (error) {
        throw error
      }

      // Update customer record
      await this.supabase
        .from('customers')
        .update({ default_payment_method_id: paymentMethodId })
        .eq('id', customerId)

      return updatedPaymentMethod
    } catch (error) {
      console.error('Error setting default payment method:', error)
      throw error
    }
  }

  /**
   * Get customer's billing details
   */
  async getBillingDetails(customerId: string) {
    try {
      const customer = await this.getCustomer(customerId)
      if (!customer) {
        throw new Error('Customer not found')
      }

      // Get Stripe customer for latest info
      const stripeCustomer = await stripe.customers.retrieve(customer.stripeCustomerId)

      // Get payment methods
      const paymentMethods = await this.getPaymentMethods(customerId)

      // Get tax IDs
      const stripeTaxIds = await stripe.customers.listTaxIds(customer.stripeCustomerId)

      return {
        customer,
        stripeCustomer,
        paymentMethods,
        taxIds: stripeTaxIds.data.map(taxId => ({
          type: taxId.type,
          value: taxId.value,
          verified: taxId.verification?.status === 'verified',
        })),
      }
    } catch (error) {
      console.error('Error getting billing details:', error)
      throw error
    }
  }

  /**
   * Create setup intent for saving payment method
   */
  async createSetupIntent({
    customerId,
    paymentMethodTypes = ['card'],
    usage = 'off_session',
  }: {
    customerId: string
    paymentMethodTypes?: string[]
    usage?: 'on_session' | 'off_session'
  }) {
    try {
      const customer = await this.getCustomer(customerId)
      if (!customer) {
        throw new Error('Customer not found')
      }

      const setupIntent = await stripe.setupIntents.create({
        customer: customer.stripeCustomerId,
        payment_method_types: paymentMethodTypes as Stripe.SetupIntentCreateParams.PaymentMethodType[],
        usage,
        automatic_payment_methods: {
          enabled: true,
        },
      })

      return setupIntent
    } catch (error) {
      console.error('Error creating setup intent:', error)
      throw error
    }
  }
}