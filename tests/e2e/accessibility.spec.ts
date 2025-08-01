import { test, expect } from '@playwright/test'
import { injectAxe, checkA11y, getViolations } from 'axe-playwright'

test.describe('Accessibility Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Inject axe-core into every page
    await injectAxe(page)
  })

  test('Homepage should be accessible @accessibility', async ({ page }) => {
    await page.goto('/')
    
    // Check for accessibility violations
    await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    })
  })

  test('Login page should be accessible @accessibility', async ({ page }) => {
    await page.goto('/login')
    
    // Check accessibility
    await checkA11y(page, null, {
      tags: ['wcag2a', 'wcag2aa'],
      rules: {
        'color-contrast': { enabled: true },
        'keyboard-navigation': { enabled: true },
      },
    })

    // Test keyboard navigation
    await page.keyboard.press('Tab')
    await expect(page.locator('[data-testid="email-input"]')).toBeFocused()
    
    await page.keyboard.press('Tab')
    await expect(page.locator('[data-testid="password-input"]')).toBeFocused()
    
    await page.keyboard.press('Tab')
    await expect(page.locator('[data-testid="login-button"]')).toBeFocused()
  })

  test('Signup form should be accessible @accessibility', async ({ page }) => {
    await page.goto('/signup')
    
    // Check form accessibility
    await checkA11y(page, '[data-testid="signup-form"]', {
      rules: {
        'label': { enabled: true },
        'form-field-multiple-labels': { enabled: true },
        'required-attr': { enabled: true },
      },
    })

    // Verify form labels are properly associated
    const nameInput = page.locator('[data-testid="name-input"]')
    const nameLabel = page.locator('label[for="name"]')
    
    await expect(nameLabel).toBeVisible()
    await expect(nameInput).toHaveAttribute('id', 'name')
    await expect(nameInput).toHaveAttribute('required')

    // Test error message accessibility
    await page.click('[data-testid="signup-button"]') // Submit empty form
    
    const errorMessage = page.locator('[role="alert"]').first()
    await expect(errorMessage).toBeVisible()
    await expect(errorMessage).toHaveAttribute('aria-live', 'polite')
  })

  test('Field booking page should be accessible @accessibility', async ({ page }) => {
    // Login first
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'testuser@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')

    // Navigate to booking
    await page.goto('/booking')
    
    // Check overall page accessibility
    await checkA11y(page, null, {
      tags: ['wcag2a', 'wcag2aa', 'wcag21aa'],
    })

    // Test field selection accessibility
    const fieldSelection = page.locator('[data-testid="field-selection"]')
    await checkA11y(page, fieldSelection, {
      rules: {
        'radiogroup': { enabled: true },
        'radio-group-role': { enabled: true },
      },
    })

    // Verify radio group structure
    const radioGroup = page.locator('[role="radiogroup"]')
    await expect(radioGroup).toBeVisible()
    
    const radioButtons = page.locator('[role="radio"]')
    const radioCount = await radioButtons.count()
    expect(radioCount).toBeGreaterThan(0)

    // Test keyboard navigation of radio group
    await radioButtons.first().focus()
    await page.keyboard.press('ArrowDown')
    
    if (radioCount > 1) {
      await expect(radioButtons.nth(1)).toBeFocused()
    }
  })

  test('Date picker should be accessible @accessibility', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'testuser@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')

    await page.goto('/booking')
    
    // Select a field first
    await page.click('[data-testid="field-card"]:first-child')
    
    // Check date picker accessibility
    const datePicker = page.locator('[data-testid="date-picker"]')
    await checkA11y(page, datePicker, {
      rules: {
        'label': { enabled: true },
        'keyboard': { enabled: true },
      },
    })

    // Test keyboard interaction
    await datePicker.focus()
    await page.keyboard.press('Enter') // Should open calendar
    
    // Calendar should be accessible
    const calendar = page.locator('[role="dialog"][aria-label*="calendar"]')
    if (await calendar.isVisible()) {
      await checkA11y(page, calendar, {
        rules: {
          'dialog-title': { enabled: true },
          'focus-trap': { enabled: true },
        },
      })
    }
  })

  test('Navigation should be accessible @accessibility', async ({ page }) => {
    await page.goto('/')
    
    // Check main navigation
    const mainNav = page.locator('[role="navigation"]').first()
    await checkA11y(page, mainNav, {
      rules: {
        'landmark-one-main': { enabled: true },
        'skip-link': { enabled: true },
      },
    })

    // Test skip links
    await page.keyboard.press('Tab')
    const skipLink = page.locator('a[href="#main-content"]')
    if (await skipLink.isVisible()) {
      await expect(skipLink).toBeFocused()
      await page.keyboard.press('Enter')
      
      const mainContent = page.locator('#main-content')
      await expect(mainContent).toBeFocused()
    }

    // Test mobile navigation accessibility
    await page.setViewportSize({ width: 375, height: 667 })
    
    const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]')
    if (await mobileMenuButton.isVisible()) {
      await expect(mobileMenuButton).toHaveAttribute('aria-expanded', 'false')
      await mobileMenuButton.click()
      await expect(mobileMenuButton).toHaveAttribute('aria-expanded', 'true')
      
      // Mobile menu should be accessible
      const mobileMenu = page.locator('[data-testid="mobile-menu"]')
      await checkA11y(page, mobileMenu, {
        rules: {
          'focus-order-semantics': { enabled: true },
          'keyboard-navigation': { enabled: true },
        },
      })
    }
  })

  test('Form validation should be accessible @accessibility', async ({ page }) => {
    await page.goto('/login')
    
    // Submit empty form to trigger validation
    await page.click('[data-testid="login-button"]')
    
    // Check that error messages are accessible
    const errorMessages = page.locator('[role="alert"]')
    const errorCount = await errorMessages.count()
    
    if (errorCount > 0) {
      for (let i = 0; i < errorCount; i++) {
        const error = errorMessages.nth(i)
        await expect(error).toBeVisible()
        
        // Error should have proper attributes
        await expect(error).toHaveAttribute('aria-live')
        
        // Associated input should reference the error
        const errorId = await error.getAttribute('id')
        if (errorId) {
          const associatedInput = page.locator(`[aria-describedby*="${errorId}"]`)
          await expect(associatedInput).toBeVisible()
        }
      }
    }
  })

  test('Data tables should be accessible @accessibility', async ({ page }) => {
    // Login and navigate to bookings page
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'testuser@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')

    await page.goto('/bookings')
    
    const dataTable = page.locator('[role="table"]').first()
    if (await dataTable.isVisible()) {
      await checkA11y(page, dataTable, {
        rules: {
          'table-caption': { enabled: true },
          'th-has-data-cells': { enabled: true },
          'table-headers': { enabled: true },
        },
      })

      // Check table structure
      const tableHeaders = page.locator('th')
      const headerCount = await tableHeaders.count()
      
      if (headerCount > 0) {
        for (let i = 0; i < headerCount; i++) {
          const header = tableHeaders.nth(i)
          await expect(header).toHaveAttribute('scope')
        }
      }
    }
  })

  test('Modal dialogs should be accessible @accessibility', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'testuser@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')

    await page.goto('/bookings')
    
    // Open a modal (e.g., booking details)
    const firstBooking = page.locator('[data-testid="booking-item"]').first()
    if (await firstBooking.isVisible()) {
      await firstBooking.click()
      
      const modal = page.locator('[role="dialog"]')
      if (await modal.isVisible()) {
        await checkA11y(page, modal, {
          rules: {
            'dialog-title': { enabled: true },
            'focus-trap': { enabled: true },
            'modal-dialog': { enabled: true },
          },
        })

        // Check modal attributes
        await expect(modal).toHaveAttribute('aria-modal', 'true')
        await expect(modal).toHaveAttribute('aria-labelledby')
        
        // Test focus management
        const modalTitle = page.locator('[data-testid="modal-title"]')
        await expect(modalTitle).toBeFocused()
        
        // Test escape key
        await page.keyboard.press('Escape')
        await expect(modal).not.toBeVisible()
      }
    }
  })

  test('Color contrast should meet WCAG standards @accessibility', async ({ page }) => {
    await page.goto('/')
    
    // Check color contrast specifically
    const violations = await getViolations(page, null, {
      rules: {
        'color-contrast': { enabled: true },
      },
    })

    // Report contrast violations
    const contrastViolations = violations.filter(v => v.id === 'color-contrast')
    
    if (contrastViolations.length > 0) {
      console.log('Color contrast violations found:')
      contrastViolations.forEach(violation => {
        console.log(`- ${violation.description}`)
        violation.nodes.forEach(node => {
          console.log(`  Element: ${node.html}`)
          console.log(`  Impact: ${node.impact}`)
        })
      })
    }

    expect(contrastViolations.length).toBe(0)
  })

  test('Images should have alt text @accessibility', async ({ page }) => {
    await page.goto('/')
    
    const images = page.locator('img')
    const imageCount = await images.count()
    
    for (let i = 0; i < imageCount; i++) {
      const image = images.nth(i)
      const alt = await image.getAttribute('alt')
      const ariaLabel = await image.getAttribute('aria-label')
      const ariaLabelledby = await image.getAttribute('aria-labelledby')
      const role = await image.getAttribute('role')
      
      // Image should have alt text, aria-label, aria-labelledby, or be decorative
      const hasAccessibleName = alt !== null || ariaLabel !== null || ariaLabelledby !== null
      const isDecorative = role === 'presentation' || alt === ''
      
      expect(hasAccessibleName || isDecorative).toBe(true)
    }
  })

  test('Headings should be properly structured @accessibility', async ({ page }) => {
    await page.goto('/')
    
    // Check heading hierarchy
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all()
    
    let previousLevel = 0
    for (const heading of headings) {
      const tagName = await heading.evaluate(el => el.tagName.toLowerCase())
      const currentLevel = parseInt(tagName.charAt(1))
      
      if (previousLevel === 0) {
        // First heading should be h1
        expect(currentLevel).toBe(1)
      } else {
        // Subsequent headings should not skip levels
        expect(currentLevel - previousLevel).toBeLessThanOrEqual(1)
      }
      
      previousLevel = currentLevel
    }
  })

  test('Focus indicators should be visible @accessibility', async ({ page }) => {
    await page.goto('/login')
    
    // Test focus indicators on interactive elements
    const interactiveElements = await page.locator('a, button, input, select, textarea').all()
    
    for (const element of interactiveElements) {
      await element.focus()
      
      // Check if element has visible focus indicator
      const outline = await element.evaluate(el => {
        const styles = window.getComputedStyle(el)
        return styles.outline !== 'none' || 
               styles.outlineWidth !== '0px' || 
               styles.boxShadow !== 'none'
      })
      
      expect(outline).toBe(true)
    }
  })

  test('Screen reader compatibility @accessibility', async ({ page }) => {
    await page.goto('/booking')
    
    // Check for screen reader specific attributes
    await checkA11y(page, null, {
      rules: {
        'aria-allowed-attr': { enabled: true },
        'aria-required-attr': { enabled: true },
        'aria-roles': { enabled: true },
        'aria-valid-attr-value': { enabled: true },
      },
    })

    // Test live regions
    const liveRegions = page.locator('[aria-live]')
    const liveRegionCount = await liveRegions.count()
    
    for (let i = 0; i < liveRegionCount; i++) {
      const region = liveRegions.nth(i)
      const ariaLive = await region.getAttribute('aria-live')
      
      expect(['polite', 'assertive', 'off']).toContain(ariaLive)
    }
  })

  test('Progressive enhancement should work without JavaScript @accessibility', async ({ page, context }) => {
    // Disable JavaScript
    await context.setExtraHTTPHeaders({
      'Content-Security-Policy': "script-src 'none'"
    })
    
    await page.goto('/login')
    
    // Basic functionality should still work
    const emailInput = page.locator('[data-testid="email-input"]')
    const passwordInput = page.locator('[data-testid="password-input"]')
    const submitButton = page.locator('[data-testid="login-button"]')
    
    await expect(emailInput).toBeVisible()
    await expect(passwordInput).toBeVisible()
    await expect(submitButton).toBeVisible()
    
    // Form should be submittable
    await emailInput.fill('test@example.com')
    await passwordInput.fill('password')
    
    // Even without JS, form should have proper attributes
    await expect(emailInput).toHaveAttribute('type', 'email')
    await expect(passwordInput).toHaveAttribute('type', 'password')
    await expect(submitButton).toHaveAttribute('type', 'submit')
  })
})