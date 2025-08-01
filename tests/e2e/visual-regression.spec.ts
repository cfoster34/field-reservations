import { test, expect } from '@playwright/test'

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Disable animations for consistent screenshots
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `
    })
  })

  test('Homepage visual regression @visual', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Take full page screenshot
    await expect(page).toHaveScreenshot('homepage-full.png', {
      fullPage: true,
      threshold: 0.2,
      maxDiffPixels: 100,
    })
    
    // Take hero section screenshot
    const heroSection = page.locator('[data-testid="hero-section"]')
    await expect(heroSection).toHaveScreenshot('homepage-hero.png')
    
    // Take features section screenshot
    const featuresSection = page.locator('[data-testid="features-section"]')
    await expect(featuresSection).toHaveScreenshot('homepage-features.png')
  })

  test('Login page visual regression @visual', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    
    // Normal state
    await expect(page).toHaveScreenshot('login-page.png', {
      fullPage: true,
    })
    
    // Focus state
    await page.focus('[data-testid="email-input"]')
    await expect(page.locator('[data-testid="login-form"]')).toHaveScreenshot('login-form-focus.png')
    
    // Error state
    await page.click('[data-testid="login-button"]')
    await page.waitForSelector('[role="alert"]')
    await expect(page.locator('[data-testid="login-form"]')).toHaveScreenshot('login-form-error.png')
  })

  test('Field selection visual regression @visual', async ({ page }) => {
    // Login first
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'testuser@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')
    
    await page.goto('/booking')
    await page.waitForLoadState('networkidle')
    
    // Field selection page
    await expect(page).toHaveScreenshot('booking-field-selection.png', {
      fullPage: true,
    })
    
    // Individual field card
    const firstFieldCard = page.locator('[data-testid="field-card"]').first()
    await expect(firstFieldCard).toHaveScreenshot('field-card.png')
    
    // Selected field state
    await firstFieldCard.click()
    await expect(firstFieldCard).toHaveScreenshot('field-card-selected.png')
    
    // Search functionality
    await page.fill('[data-testid="search-input"]', 'Soccer')
    await page.waitForTimeout(500) // Wait for search results
    await expect(page.locator('[data-testid="field-list"]')).toHaveScreenshot('field-search-results.png')
  })

  test('Booking form visual regression @visual', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'testuser@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')
    
    await page.goto('/booking')
    await page.click('[data-testid="field-card"]')
    
    // Booking form initial state
    const bookingForm = page.locator('[data-testid="booking-form"]')
    await expect(bookingForm).toHaveScreenshot('booking-form-initial.png')
    
    // Fill form partially
    await page.fill('[data-testid="date-picker"]', '2024-03-15')
    await page.selectOption('[data-testid="start-time"]', '10:00')
    await page.selectOption('[data-testid="end-time"]', '12:00')
    
    await expect(bookingForm).toHaveScreenshot('booking-form-partial.png')
    
    // Fill complete form
    await page.fill('[data-testid="purpose-input"]', 'Team Practice')
    await page.fill('[data-testid="attendees-input"]', '15')
    await page.fill('[data-testid="notes-textarea"]', 'Weekly team practice session')
    
    await expect(bookingForm).toHaveScreenshot('booking-form-complete.png')
    
    // Validation error state
    await page.fill('[data-testid="attendees-input"]', '100') // Exceeds capacity
    await page.click('[data-testid="proceed-button"]')
    await page.waitForSelector('[role="alert"]')
    
    await expect(bookingForm).toHaveScreenshot('booking-form-validation-error.png')
  })

  test('Dashboard visual regression @visual', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'testuser@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')
    await page.waitForLoadState('networkidle')
    
    // Full dashboard
    await expect(page).toHaveScreenshot('dashboard-full.png', {
      fullPage: true,
    })
    
    // Individual dashboard components
    const statsCards = page.locator('[data-testid="stats-cards"]')
    await expect(statsCards).toHaveScreenshot('dashboard-stats.png')
    
    const upcomingReservations = page.locator('[data-testid="upcoming-reservations"]')
    await expect(upcomingReservations).toHaveScreenshot('dashboard-upcoming.png')
    
    const recentActivity = page.locator('[data-testid="recent-activity"]')
    await expect(recentActivity).toHaveScreenshot('dashboard-activity.png')
  })

  test('Navigation visual regression @visual', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Desktop navigation
    const desktopNav = page.locator('[data-testid="desktop-navigation"]')
    await expect(desktopNav).toHaveScreenshot('navigation-desktop.png')
    
    // Mobile navigation
    await page.setViewportSize({ width: 375, height: 667 })
    await page.reload()
    await page.waitForLoadState('networkidle')
    
    const mobileNavButton = page.locator('[data-testid="mobile-menu-button"]')
    await expect(mobileNavButton).toHaveScreenshot('navigation-mobile-button.png')
    
    // Mobile menu opened
    await mobileNavButton.click()
    const mobileMenu = page.locator('[data-testid="mobile-menu"]')
    await expect(mobileMenu).toHaveScreenshot('navigation-mobile-menu.png')
  })

  test('Responsive design visual regression @visual', async ({ page }) => {
    await page.goto('/booking')
    
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop-xl' },
      { width: 1366, height: 768, name: 'desktop-lg' },
      { width: 1024, height: 768, name: 'tablet-landscape' },
      { width: 768, height: 1024, name: 'tablet-portrait' },
      { width: 414, height: 896, name: 'mobile-lg' },
      { width: 375, height: 667, name: 'mobile-md' },
      { width: 320, height: 568, name: 'mobile-sm' },
    ]
    
    for (const viewport of viewports) {
      await page.setViewportSize({ 
        width: viewport.width, 
        height: viewport.height 
      })
      await page.waitForLoadState('networkidle')
      
      await expect(page).toHaveScreenshot(`booking-${viewport.name}.png`, {
        fullPage: true,
      })
    }
  })

  test('Dark mode visual regression @visual', async ({ page }) => {
    await page.goto('/')
    
    // Enable dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark')
    })
    
    await page.waitForTimeout(500) // Wait for theme transition
    
    // Take screenshots in dark mode
    await expect(page).toHaveScreenshot('homepage-dark.png', {
      fullPage: true,
    })
    
    // Login page in dark mode
    await page.goto('/login')
    await expect(page).toHaveScreenshot('login-dark.png', {
      fullPage: true,
    })
    
    // Dashboard in dark mode
    await page.fill('[data-testid="email-input"]', 'testuser@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')
    
    await expect(page).toHaveScreenshot('dashboard-dark.png', {
      fullPage: true,
    })
  })

  test('Form states visual regression @visual', async ({ page }) => {
    await page.goto('/signup')
    
    const signupForm = page.locator('[data-testid="signup-form"]')
    
    // Initial state
    await expect(signupForm).toHaveScreenshot('signup-form-initial.png')
    
    // Focus states
    await page.focus('[data-testid="name-input"]')
    await expect(signupForm).toHaveScreenshot('signup-form-name-focus.png')
    
    await page.focus('[data-testid="email-input"]')
    await expect(signupForm).toHaveScreenshot('signup-form-email-focus.png')
    
    // Filled state
    await page.fill('[data-testid="name-input"]', 'John Doe')
    await page.fill('[data-testid="email-input"]', 'john@example.com')
    await page.fill('[data-testid="password-input"]', 'Password123!')
    await page.fill('[data-testid="confirm-password-input"]', 'Password123!')
    
    await expect(signupForm).toHaveScreenshot('signup-form-filled.png')
    
    // Success state
    // Note: This would require mocking the API response
    await page.click('[data-testid="signup-button"]')
    await page.waitForSelector('[data-testid="signup-success"]', { timeout: 5000 })
    
    await expect(page.locator('[data-testid="signup-success"]')).toHaveScreenshot('signup-success.png')
  })

  test('Loading states visual regression @visual', async ({ page }) => {
    // Intercept API calls to simulate loading states
    await page.route('**/api/fields', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000))
      await route.continue()
    })
    
    await page.goto('/booking')
    
    // Capture loading state
    const loadingSpinner = page.locator('[data-testid="loading-fields"]')
    await expect(loadingSpinner).toHaveScreenshot('loading-fields.png')
    
    // Wait for loading to complete and capture loaded state
    await page.waitForSelector('[data-testid="field-list"]')
    await expect(page.locator('[data-testid="field-list"]')).toHaveScreenshot('fields-loaded.png')
  })

  test('Modal and overlay visual regression @visual', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'testuser@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')
    
    await page.goto('/bookings')
    
    // Open booking details modal
    const firstBooking = page.locator('[data-testid="booking-item"]').first()
    await firstBooking.click()
    
    const modal = page.locator('[data-testid="booking-modal"]')
    await expect(modal).toHaveScreenshot('booking-modal.png')
    
    // Confirmation dialog
    await page.click('[data-testid="cancel-booking-button"]')
    const confirmDialog = page.locator('[data-testid="confirm-dialog"]')
    await expect(confirmDialog).toHaveScreenshot('confirm-dialog.png')
  })

  test('Data visualization visual regression @visual', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'admin@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')
    
    await page.goto('/analytics')
    await page.waitForLoadState('networkidle')
    
    // Revenue chart
    const revenueChart = page.locator('[data-testid="revenue-chart"]')
    await expect(revenueChart).toHaveScreenshot('revenue-chart.png')
    
    // Utilization heatmap
    const utilizationChart = page.locator('[data-testid="utilization-heatmap"]')
    await expect(utilizationChart).toHaveScreenshot('utilization-heatmap.png')
    
    // Booking trends
    const trendsChart = page.locator('[data-testid="booking-trends"]')
    await expect(trendsChart).toHaveScreenshot('booking-trends.png')
  })

  test('Print styles visual regression @visual', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'testuser@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')
    
    await page.goto('/bookings')
    
    // Emulate print media
    await page.emulateMedia({ media: 'print' })
    
    // Take screenshot of print view
    await expect(page).toHaveScreenshot('bookings-print.png', {
      fullPage: true,
    })
    
    // Individual booking print view
    await page.click('[data-testid="booking-item"]')
    await page.click('[data-testid="print-booking-button"]')
    
    await expect(page).toHaveScreenshot('booking-receipt-print.png', {
      fullPage: true,
    })
  })

  test('Error states visual regression @visual', async ({ page }) => {
    // 404 page
    await page.goto('/non-existent-page')
    await expect(page).toHaveScreenshot('404-page.png', {
      fullPage: true,
    })
    
    // Network error simulation
    await page.route('**/api/**', route => route.abort())
    await page.goto('/booking')
    
    const errorMessage = page.locator('[data-testid="network-error"]')
    await expect(errorMessage).toHaveScreenshot('network-error.png')
    
    // Form validation errors
    await page.goto('/booking', { waitUntil: 'domcontentloaded' })
    await page.unroute('**/api/**') // Remove network error simulation
    
    await page.click('[data-testid="proceed-button"]') // Submit without required fields
    
    const validationErrors = page.locator('[data-testid="validation-errors"]')
    await expect(validationErrors).toHaveScreenshot('validation-errors.png')
  })

  test('Animation states visual regression @visual', async ({ page }) => {
    // Remove animation disabling for this test
    await page.goto('/booking')
    
    // Capture different animation states
    const fieldCard = page.locator('[data-testid="field-card"]').first()
    
    // Hover state
    await fieldCard.hover()
    await page.waitForTimeout(200) // Wait for hover animation
    await expect(fieldCard).toHaveScreenshot('field-card-hover.png')
    
    // Click animation
    await fieldCard.click()
    await page.waitForTimeout(100) // Capture mid-animation
    await expect(fieldCard).toHaveScreenshot('field-card-click.png')
    
    // Selected animation complete
    await page.waitForTimeout(300)
    await expect(fieldCard).toHaveScreenshot('field-card-selected-animation.png')
  })
})