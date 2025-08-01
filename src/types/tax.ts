export interface TaxCalculationCreateParams {
  currency: string
  line_items: Array<{
    amount: number
    reference?: string
    tax_behavior?: 'inclusive' | 'exclusive'
    tax_code?: string
  }>
  customer_details: {
    address?: {
      line1?: string
      line2?: string
      city?: string
      state?: string
      postal_code?: string
      country: string
    }
    address_source?: 'billing' | 'shipping'
    ip_address?: string
    tax_ids?: Array<{
      type: string
      value: string
    }>
  }
  shipping_cost?: {
    amount: number
    tax_behavior?: 'inclusive' | 'exclusive'
    tax_code?: string
  }
  tax_date?: number
}

export interface TaxCalculation {
  id: string
  object: 'tax.calculation'
  amount_total: number
  currency: string
  customer_details: {
    address?: {
      line1?: string
      line2?: string
      city?: string
      state?: string
      postal_code?: string
      country: string
    }
    address_source?: 'billing' | 'shipping'
    ip_address?: string
    tax_ids?: Array<{
      type: string
      value: string
    }>
  }
  line_items: Array<{
    id: string
    amount: number
    amount_tax: number
    livemode: boolean
    product?: string
    quantity: number
    reference?: string
    tax_behavior: 'inclusive' | 'exclusive'
    tax_breakdown?: Array<{
      amount: number
      jurisdiction: {
        country: string
        display_name: string
        level: 'country' | 'state' | 'county' | 'city'
        state?: string
      }
      sourcing: 'destination' | 'origin'
      tax_rate_details: {
        country?: string
        display_name: string
        percentage_decimal: string
        state?: string
        tax_type: 'gst' | 'hst' | 'pst' | 'qst' | 'rst' | 'sales_tax' | 'vat'
      }
      taxability_reason: 'not_collecting' | 'not_subject_to_tax' | 'not_supported' | 'portion_product_exempt' | 'portion_reduced_rated' | 'portion_standard_rated' | 'product_exempt' | 'product_exempt_holiday' | 'proportionally_rated' | 'reduced_rated' | 'reverse_charge' | 'standard_rated' | 'taxable_basis_reduced' | 'zero_rated'
    }>
    tax_code: string
  }>
  livemode: boolean
  shipping_cost?: {
    amount: number
    amount_tax: number
    shipping_rate?: string
    tax_behavior: 'inclusive' | 'exclusive'
    tax_breakdown?: Array<{
      amount: number
      jurisdiction: {
        country: string
        display_name: string
        level: 'country' | 'state' | 'county' | 'city'
        state?: string
      }
      sourcing: 'destination' | 'origin'
      tax_rate_details: {
        country?: string
        display_name: string
        percentage_decimal: string
        state?: string
        tax_type: 'gst' | 'hst' | 'pst' | 'qst' | 'rst' | 'sales_tax' | 'vat'
      }
      taxability_reason: 'not_collecting' | 'not_subject_to_tax' | 'not_supported' | 'portion_product_exempt' | 'portion_reduced_rated' | 'portion_standard_rated' | 'product_exempt' | 'product_exempt_holiday' | 'proportionally_rated' | 'reduced_rated' | 'reverse_charge' | 'standard_rated' | 'taxable_basis_reduced' | 'zero_rated'
    }>
    tax_code: string
  }
  tax_amount_exclusive: number
  tax_amount_inclusive: number
  tax_date: number
}

export interface TaxRate {
  id: string
  object: 'tax_rate'
  active: boolean
  country?: string
  created: number
  description?: string
  display_name: string
  inclusive: boolean
  jurisdiction?: string
  livemode: boolean
  metadata: Record<string, string>
  percentage: number
  state?: string
  tax_type?: 'gst' | 'hst' | 'pst' | 'qst' | 'rst' | 'sales_tax' | 'vat'
}

export interface TaxSettings {
  enableAutomaticTax: boolean
  defaultTaxBehavior: 'inclusive' | 'exclusive'
  taxIdCollection: {
    enabled: boolean
    required: 'never' | 'if_supported'
  }
  taxRates: TaxRate[]
}