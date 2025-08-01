import {
  emailSchema,
  phoneSchema,
  passwordSchema,
  loginSchema,
  registerSchema,
  reservationSchema,
  fieldSchema,
} from '@/utils/validation'

describe('Validation Schemas', () => {
  describe('emailSchema', () => {
    it('should validate correct email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'test+tag@gmail.com',
        'a@b.co',
      ]

      validEmails.forEach((email) => {
        expect(emailSchema.safeParse(email).success).toBe(true)
      })
    })

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'test@',
        'test..test@domain.com',
        '',
      ]

      invalidEmails.forEach((email) => {
        expect(emailSchema.safeParse(email).success).toBe(false)
      })
    })
  })

  describe('phoneSchema', () => {
    it('should validate correct phone numbers', () => {
      const validPhones = [
        '123-456-7890',
        '(123) 456-7890',
        '123.456.7890',
        '1234567890',
        '+1234567890',
        '123 456 7890',
      ]

      validPhones.forEach((phone) => {
        expect(phoneSchema.safeParse(phone).success).toBe(true)
      })
    })

    it('should reject invalid phone numbers', () => {
      const invalidPhones = [
        '123',
        'abc-def-ghij',
        '123-45-6789', // too short
        '',
      ]

      invalidPhones.forEach((phone) => {
        expect(phoneSchema.safeParse(phone).success).toBe(false)
      })
    })
  })

  describe('passwordSchema', () => {
    it('should validate strong passwords', () => {
      const validPasswords = [
        'Password123',
        'StrongPass1',
        'MySecure123',
        'Test1234Pass',
      ]

      validPasswords.forEach((password) => {
        expect(passwordSchema.safeParse(password).success).toBe(true)
      })
    })

    it('should reject weak passwords', () => {
      const invalidPasswords = [
        'weak', // too short
        'password', // no uppercase or numbers
        'PASSWORD123', // no lowercase
        'Password', // no numbers
        '12345678', // no letters
        '', // empty
      ]

      invalidPasswords.forEach((password) => {
        const result = passwordSchema.safeParse(password)
        expect(result.success).toBe(false)
      })
    })

    it('should provide specific error messages', () => {
      const shortPassword = passwordSchema.safeParse('123')
      expect(shortPassword.success).toBe(false)
      if (!shortPassword.success) {
        expect(shortPassword.error.issues[0].message).toBe(
          'Password must be at least 8 characters'
        )
      }
    })
  })

  describe('loginSchema', () => {
    it('should validate correct login data', () => {
      const validLogin = {
        email: 'test@example.com',
        password: 'password123',
      }

      expect(loginSchema.safeParse(validLogin).success).toBe(true)
    })

    it('should reject invalid login data', () => {
      const invalidLogins = [
        { email: 'invalid-email', password: 'password123' },
        { email: 'test@example.com', password: '' },
        { email: '', password: 'password123' },
      ]

      invalidLogins.forEach((login) => {
        expect(loginSchema.safeParse(login).success).toBe(false)
      })
    })
  })

  describe('registerSchema', () => {
    it('should validate correct registration data', () => {
      const validRegistration = {
        email: 'test@example.com',
        password: 'Password123',
        confirmPassword: 'Password123',
        name: 'John Doe',
        phoneNumber: '123-456-7890',
      }

      expect(registerSchema.safeParse(validRegistration).success).toBe(true)
    })

    it('should reject mismatched passwords', () => {
      const mismatchedPasswords = {
        email: 'test@example.com',
        password: 'Password123',
        confirmPassword: 'DifferentPass123',
        name: 'John Doe',
      }

      const result = registerSchema.safeParse(mismatchedPasswords)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Passwords don't match")
      }
    })

    it('should validate without optional phone number', () => {
      const validRegistration = {
        email: 'test@example.com',
        password: 'Password123',
        confirmPassword: 'Password123',
        name: 'John Doe',
      }

      expect(registerSchema.safeParse(validRegistration).success).toBe(true)
    })
  })

  describe('reservationSchema', () => {
    it('should validate correct reservation data', () => {
      const validReservation = {
        fieldId: 'field-123',
        date: '2024-01-15',
        startTime: '10:00',
        endTime: '12:00',
        purpose: 'Team practice',
        attendees: 15,
        notes: 'Please prepare equipment',
      }

      expect(reservationSchema.safeParse(validReservation).success).toBe(true)
    })

    it('should reject invalid reservation data', () => {
      const invalidReservations = [
        {
          fieldId: '',
          date: '2024-01-15',
          startTime: '10:00',
          endTime: '12:00',
          purpose: 'Team practice',
          attendees: 15,
        },
        {
          fieldId: 'field-123',
          date: '2024-01-15',
          startTime: '10:00',
          endTime: '12:00',
          purpose: 'Te', // too short
          attendees: 15,
        },
        {
          fieldId: 'field-123',
          date: '2024-01-15',
          startTime: '10:00',
          endTime: '12:00',
          purpose: 'Team practice',
          attendees: 0, // minimum 1
        },
      ]

      invalidReservations.forEach((reservation) => {
        expect(reservationSchema.safeParse(reservation).success).toBe(false)
      })
    })
  })

  describe('fieldSchema', () => {
    it('should validate correct field data', () => {
      const validField = {
        name: 'Soccer Field A',
        description: 'Professional soccer field with natural grass',
        location: {
          address: '123 Sports Ave',
          city: 'Springfield',
          state: 'IL',
          zipCode: '62701',
          coordinates: {
            lat: 39.7817,
            lng: -89.6501,
          },
        },
        type: 'grass' as const,
        sport: ['soccer'] as const,
        capacity: 22,
        pricing: {
          basePrice: 75,
          deposit: 25,
        },
      }

      expect(fieldSchema.safeParse(validField).success).toBe(true)
    })

    it('should reject invalid zip codes', () => {
      const invalidField = {
        name: 'Soccer Field A',
        location: {
          address: '123 Sports Ave',
          city: 'Springfield',
          state: 'IL',
          zipCode: '123', // invalid zip
          coordinates: {
            lat: 39.7817,
            lng: -89.6501,
          },
        },
        type: 'grass' as const,
        sport: ['soccer'] as const,
        capacity: 22,
        pricing: {
          basePrice: 75,
        },
      }

      expect(fieldSchema.safeParse(invalidField).success).toBe(false)
    })

    it('should reject negative pricing', () => {
      const invalidField = {
        name: 'Soccer Field A',
        location: {
          address: '123 Sports Ave',
          city: 'Springfield',
          state: 'IL',
          zipCode: '62701',
          coordinates: {
            lat: 39.7817,
            lng: -89.6501,
          },
        },
        type: 'grass' as const,
        sport: ['soccer'] as const,
        capacity: 22,
        pricing: {
          basePrice: -75, // negative price
        },
      }

      expect(fieldSchema.safeParse(invalidField).success).toBe(false)
    })
  })
})