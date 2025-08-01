import { test, expect, Page } from '@playwright/test'
import { faker } from '@faker-js/faker'

// Test data
const testUser = {
  email: faker.internet.email(),
  password: 'TestPassword123!',
  name: faker.person.fullName(),
  phone: faker.phone.number(),
}

const testReservation = {
  fieldName: 'Soccer Field A',
  date: '2024-03-15',
  startTime: '10:00',
  endTime: '12:00',
  purpose: 'Team Practice',
  attendees: 15,
  notes: 'Regular weekly practice session',
}

// Page object model helpers
class AuthPage {
  constructor(private page: Page) {}

  async navigateToSignup() {
    await this.page.goto('/signup')
  }

  async navigateToLogin() {
    await this.page.goto('/login')
  }

  async fillSignupForm(user: typeof testUser) {
    await this.page.fill('[data-testid="name-input"]', user.name)
    await this.page.fill('[data-testid="email-input"]', user.email)
    await this.page.fill('[data-testid="password-input"]', user.password)
    await this.page.fill('[data-testid="confirm-password-input"]', user.password)
    await this.page.fill('[data-testid="phone-input"]', user.phone)
  }

  async submitSignup() {
    await this.page.click('[data-testid="signup-button"]')
  }

  async fillLoginForm(email: string, password: string) {
    await this.page.fill('[data-testid="email-input"]', email)
    await this.page.fill('[data-testid="password-input"]', password)
  }

  async submitLogin() {
    await this.page.click('[data-testid="login-button"]')
  }

  async waitForDashboard() {
    await this.page.waitForURL('/dashboard')
  }
}

class BookingPage {
  constructor(private page: Page) {}

  async navigateToBooking() {
    await this.page.goto('/booking')
  }

  async selectField(fieldName: string) {
    await this.page.click(`[data-testid="field-card-${fieldName}"]`)
  }

  async selectDate(date: string) {
    await this.page.fill('[data-testid="date-picker"]', date)
  }

  async selectTimeSlot(startTime: string, endTime: string) {
    await this.page.selectOption('[data-testid="start-time-select"]', startTime)
    await this.page.selectOption('[data-testid="end-time-select"]', endTime)
  }

  async fillBookingDetails(reservation: typeof testReservation) {
    await this.page.fill('[data-testid="purpose-input"]', reservation.purpose)
    await this.page.fill('[data-testid="attendees-input"]', reservation.attendees.toString())
    await this.page.fill('[data-testid="notes-textarea"]', reservation.notes)
  }

  async proceedToPayment() {
    await this.page.click('[data-testid="proceed-payment-button"]')
  }

  async waitForConfirmation() {
    await this.page.waitForURL('/booking/success')
  }
}

class PaymentPage {
  constructor(private page: Page) {}

  async fillPaymentDetails() {
    // Wait for Stripe iframe to load
    await this.page.waitForSelector('[data-testid="stripe-payment-element"]')
    
    // Use Stripe test card details
    const stripeFrame = this.page.frameLocator('[data-testid="stripe-payment-element"] iframe')
    await stripeFrame.fill('[name="cardnumber"]', '4242424242424242')
    await stripeFrame.fill('[name="exp-date"]', '12/34')
    await stripeFrame.fill('[name="cvc"]', '123')
    await stripeFrame.fill('[name="postal"]', '12345')
  }

  async submitPayment() {
    await this.page.click('[data-testid="submit-payment-button"]')
  }

  async waitForPaymentConfirmation() {
    await this.page.waitForSelector('[data-testid="payment-success"]')
  }
}

test.describe('Complete Booking Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Reset database state or use test-specific data isolation
    await page.goto('/test/reset-db') // Hypothetical endpoint for test data
  })

  test('should complete full user registration and booking flow', async ({ page }) => {
    const authPage = new AuthPage(page)
    const bookingPage = new BookingPage(page)
    const paymentPage = new PaymentPage(page)

    // Step 1: User Registration
    await authPage.navigateToSignup()
    await authPage.fillSignupForm(testUser)
    await authPage.submitSignup()

    // Verify email verification notice
    await expect(page.locator('[data-testid="email-verification-notice"]')).toBeVisible()

    // For testing, we'll simulate email verification
    await page.goto(`/verify-email?token=test-token&email=${testUser.email}`)
    await expect(page.locator('[data-testid="verification-success"]')).toBeVisible()

    // Step 2: Login
    await authPage.navigateToLogin()
    await authPage.fillLoginForm(testUser.email, testUser.password)
    await authPage.submitLogin()
    await authPage.waitForDashboard()

    // Verify user is on dashboard
    await expect(page.locator('[data-testid="dashboard-welcome"]')).toContainText(testUser.name)

    // Step 3: Navigate to booking
    await bookingPage.navigateToBooking()

    // Step 4: Select field
    await bookingPage.selectField(testReservation.fieldName)
    await expect(page.locator('[data-testid="selected-field"]')).toContainText(testReservation.fieldName)

    // Step 5: Select date and time
    await bookingPage.selectDate(testReservation.date)
    await bookingPage.selectTimeSlot(testReservation.startTime, testReservation.endTime)

    // Verify availability check
    await expect(page.locator('[data-testid="availability-status"]')).toContainText('Available')

    // Step 6: Fill booking details
    await bookingPage.fillBookingDetails(testReservation)

    // Step 7: Review booking summary
    await expect(page.locator('[data-testid="booking-summary-field"]')).toContainText(testReservation.fieldName)
    await expect(page.locator('[data-testid="booking-summary-date"]')).toContainText(testReservation.date)
    await expect(page.locator('[data-testid="booking-summary-time"]')).toContainText(`${testReservation.startTime} - ${testReservation.endTime}`)

    // Step 8: Proceed to payment
    await bookingPage.proceedToPayment()

    // Step 9: Complete payment
    await paymentPage.fillPaymentDetails()
    await paymentPage.submitPayment()
    await paymentPage.waitForPaymentConfirmation()

    // Step 10: Verify booking confirmation
    await bookingPage.waitForConfirmation()
    await expect(page.locator('[data-testid="booking-confirmation"]')).toBeVisible()
    await expect(page.locator('[data-testid="confirmation-details"]')).toContainText(testReservation.fieldName)

    // Step 11: Verify booking appears in user's bookings
    await page.goto('/bookings')
    await expect(page.locator(`[data-testid="booking-${testReservation.fieldName}"]`)).toBeVisible()
  })

  test('should handle booking conflicts gracefully', async ({ page }) => {
    const authPage = new AuthPage(page)
    const bookingPage = new BookingPage(page)

    // Login with existing user
    await authPage.navigateToLogin()
    await authPage.fillLoginForm('testuser@example.com', 'password123')
    await authPage.submitLogin()
    await authPage.waitForDashboard()

    // Try to book an already reserved slot
    await bookingPage.navigateToBooking()
    await bookingPage.selectField('Soccer Field A')
    await bookingPage.selectDate('2024-03-15')
    await bookingPage.selectTimeSlot('14:00', '16:00') // Assume this slot is taken

    // Should show conflict error
    await expect(page.locator('[data-testid="conflict-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="conflict-error"]')).toContainText('Time slot is already reserved')

    // Suggest alternative times
    await expect(page.locator('[data-testid="alternative-times"]')).toBeVisible()
  })

  test('should allow booking cancellation', async ({ page }) => {
    const authPage = new AuthPage(page)

    // Login and navigate to bookings
    await authPage.navigateToLogin()
    await authPage.fillLoginForm('testuser@example.com', 'password123')
    await authPage.submitLogin()
    await authPage.waitForDashboard()

    await page.goto('/bookings')

    // Find an existing booking
    const booking = page.locator('[data-testid="booking-item"]').first()
    await booking.click()

    // Open booking details
    await page.click('[data-testid="view-details-button"]')

    // Cancel booking
    await page.click('[data-testid="cancel-booking-button"]')

    // Confirm cancellation
    await page.click('[data-testid="confirm-cancellation-button"]')

    // Verify cancellation success
    await expect(page.locator('[data-testid="cancellation-success"]')).toBeVisible()
    await expect(booking.locator('[data-testid="booking-status"]')).toContainText('Cancelled')
  })

  test('should handle payment failures', async ({ page }) => {
    const authPage = new AuthPage(page)
    const bookingPage = new BookingPage(page)
    const paymentPage = new PaymentPage(page)

    // Complete booking flow up to payment
    await authPage.navigateToLogin()
    await authPage.fillLoginForm('testuser@example.com', 'password123')
    await authPage.submitLogin()

    await bookingPage.navigateToBooking()
    await bookingPage.selectField('Soccer Field A')
    await bookingPage.selectDate('2024-03-15')
    await bookingPage.selectTimeSlot('18:00', '20:00')
    await bookingPage.fillBookingDetails(testReservation)
    await bookingPage.proceedToPayment()

    // Use a failing test card
    const stripeFrame = page.frameLocator('[data-testid="stripe-payment-element"] iframe')
    await stripeFrame.fill('[name="cardnumber"]', '4000000000000002') // Declined card
    await stripeFrame.fill('[name="exp-date"]', '12/34')
    await stripeFrame.fill('[name="cvc"]', '123')

    await paymentPage.submitPayment()

    // Verify payment failure is handled
    await expect(page.locator('[data-testid="payment-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="payment-error"]')).toContainText('Your card was declined')

    // Verify booking is not confirmed
    await page.goto('/bookings')
    await expect(page.locator('[data-testid="pending-payment-booking"]')).toBeVisible()
  })

  test('should support recurring bookings', async ({ page }) => {
    const authPage = new AuthPage(page)
    const bookingPage = new BookingPage(page)

    await authPage.navigateToLogin()
    await authPage.fillLoginForm('testuser@example.com', 'password123')
    await authPage.submitLogin()

    await bookingPage.navigateToBooking()
    await bookingPage.selectField('Soccer Field A')
    await bookingPage.selectDate('2024-03-15')
    await bookingPage.selectTimeSlot('10:00', '12:00')

    // Enable recurring booking
    await page.check('[data-testid="recurring-booking-checkbox"]')
    await page.selectOption('[data-testid="recurrence-pattern"]', 'weekly')
    await page.fill('[data-testid="recurrence-end-date"]', '2024-06-15')

    await bookingPage.fillBookingDetails(testReservation)
    await bookingPage.proceedToPayment()

    // Should show multiple bookings in summary
    const bookingItems = page.locator('[data-testid="recurring-booking-item"]')
    await expect(bookingItems).toHaveCount(13) // Weekly for ~3 months

    // Complete payment for all bookings
    await page.click('[data-testid="submit-payment-button"]')
    await page.waitForURL('/booking/success')

    // Verify all recurring bookings appear in bookings list
    await page.goto('/bookings')
    const recurringBookings = page.locator('[data-testid="recurring-series"]')
    await expect(recurringBookings).toBeVisible()
  })
})

test.describe('Mobile Booking Flow', () => {
  test.use({ viewport: { width: 375, height: 667 } }) // iPhone SE

  test('should work on mobile devices', async ({ page }) => {
    const authPage = new AuthPage(page)
    const bookingPage = new BookingPage(page)

    await authPage.navigateToLogin()
    await authPage.fillLoginForm('testuser@example.com', 'password123')
    await authPage.submitLogin()

    // Mobile navigation
    await page.click('[data-testid="mobile-menu-button"]')
    await page.click('[data-testid="mobile-booking-link"]')

    // Mobile field selection should be responsive
    await expect(page.locator('[data-testid="field-list"]')).toBeVisible()
    
    // Fields should stack vertically on mobile
    const fieldCards = page.locator('[data-testid="field-card"]')
    const firstCard = fieldCards.first()
    const secondCard = fieldCards.nth(1)
    
    const firstCardBox = await firstCard.boundingBox()
    const secondCardBox = await secondCard.boundingBox()
    
    // Second card should be below first card (stacked)
    expect(secondCardBox!.y).toBeGreaterThan(firstCardBox!.y + firstCardBox!.height)

    // Complete booking on mobile
    await bookingPage.selectField('Soccer Field A')
    await bookingPage.selectDate('2024-03-15')
    await bookingPage.selectTimeSlot('10:00', '12:00')
    await bookingPage.fillBookingDetails(testReservation)

    // Mobile payment flow
    await bookingPage.proceedToPayment()
    await expect(page.locator('[data-testid="mobile-payment-form"]')).toBeVisible()
  })
})

test.describe('Accessibility', () => {
  test('should be accessible throughout booking flow', async ({ page }) => {
    // Test keyboard navigation
    await page.goto('/booking')
    
    // Tab through field selection
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    
    // Should be able to select field with space bar
    await page.keyboard.press('Space')
    
    // Date picker should be keyboard accessible
    await page.keyboard.press('Tab')
    await page.keyboard.type('2024-03-15')
    
    // Time selectors should be accessible
    await page.keyboard.press('Tab')
    await page.keyboard.press('ArrowDown') // Select time option
    
    // Form should be completable with keyboard only
    await page.keyboard.press('Tab')
    await page.keyboard.type('Team Practice')
    
    await page.keyboard.press('Tab')
    await page.keyboard.type('15')
  })

  test('should have proper ARIA labels', async ({ page }) => {
    await page.goto('/booking')
    
    // Check for proper ARIA labels
    await expect(page.locator('[aria-label="Select field"]')).toBeVisible()
    await expect(page.locator('[aria-label="Select date"]')).toBeVisible()
    await expect(page.locator('[aria-label="Select start time"]')).toBeVisible()
    await expect(page.locator('[aria-label="Select end time"]')).toBeVisible()
    
    // Form should have proper fieldset and legend
    await expect(page.locator('fieldset legend')).toContainText('Booking Details')
  })

  test('should announce errors to screen readers', async ({ page }) => {
    await page.goto('/booking')
    
    // Try to submit incomplete form
    await page.click('[data-testid="proceed-payment-button"]')
    
    // Error messages should have proper ARIA attributes
    await expect(page.locator('[role="alert"]')).toBeVisible()
    await expect(page.locator('[aria-describedby="field-error"]')).toBeVisible()
  })
})

test.describe('Performance', () => {
  test('should load booking page quickly', async ({ page }) => {
    const startTime = Date.now()
    
    await page.goto('/booking')
    await page.waitForSelector('[data-testid="field-list"]')
    
    const loadTime = Date.now() - startTime
    expect(loadTime).toBeLessThan(3000) // Should load within 3 seconds
  })

  test('should handle slow network conditions', async ({ page, context }) => {
    // Simulate slow 3G
    await context.route('**/*', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000)) // Add 1s delay
      await route.continue()
    })
    
    await page.goto('/booking')
    
    // Should show loading states
    await expect(page.locator('[data-testid="loading-fields"]')).toBeVisible()
    
    // Eventually load content
    await expect(page.locator('[data-testid="field-list"]')).toBeVisible({ timeout: 10000 })
  })
})