import {
  formatDate,
  formatTime,
  formatDateTime,
  formatRelativeTime,
  formatCurrency,
  formatPhoneNumber,
  truncate,
} from '@/utils/format'

// Mock date-fns to have consistent test results
jest.mock('date-fns', () => ({
  format: jest.fn(),
  formatDistance: jest.fn(),
  formatRelative: jest.fn(),
  parseISO: jest.fn(),
}))

const mockFormat = require('date-fns').format
const mockFormatDistance = require('date-fns').formatDistance
const mockParseISO = require('date-fns').parseISO

describe('Format Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('formatDate', () => {
    it('should format Date objects correctly', () => {
      const testDate = new Date('2024-01-15T10:30:00Z')
      mockFormat.mockReturnValue('Jan 15, 2024')

      const result = formatDate(testDate)
      
      expect(mockFormat).toHaveBeenCalledWith(testDate, 'MMM d, yyyy')
      expect(result).toBe('Jan 15, 2024')
    })

    it('should format ISO strings correctly', () => {
      const testDate = '2024-01-15T10:30:00Z'
      const parsedDate = new Date('2024-01-15T10:30:00Z')
      
      mockParseISO.mockReturnValue(parsedDate)
      mockFormat.mockReturnValue('Jan 15, 2024')

      const result = formatDate(testDate)
      
      expect(mockParseISO).toHaveBeenCalledWith(testDate)
      expect(mockFormat).toHaveBeenCalledWith(parsedDate, 'MMM d, yyyy')
      expect(result).toBe('Jan 15, 2024')
    })

    it('should use custom format string', () => {
      const testDate = new Date('2024-01-15T10:30:00Z')
      const customFormat = 'yyyy-MM-dd'
      mockFormat.mockReturnValue('2024-01-15')

      const result = formatDate(testDate, customFormat)
      
      expect(mockFormat).toHaveBeenCalledWith(testDate, customFormat)
      expect(result).toBe('2024-01-15')
    })
  })

  describe('formatTime', () => {
    it('should format time with default format', () => {
      const testDate = new Date('2024-01-15T14:30:00Z')
      mockFormat.mockReturnValue('2:30 PM')

      const result = formatTime(testDate)
      
      expect(mockFormat).toHaveBeenCalledWith(testDate, 'h:mm a')
      expect(result).toBe('2:30 PM')
    })

    it('should format time with custom format', () => {
      const testDate = new Date('2024-01-15T14:30:00Z')
      const customFormat = 'HH:mm'
      mockFormat.mockReturnValue('14:30')

      const result = formatTime(testDate, customFormat)
      
      expect(mockFormat).toHaveBeenCalledWith(testDate, customFormat)
      expect(result).toBe('14:30')
    })
  })

  describe('formatDateTime', () => {
    it('should format date and time together', () => {
      const testDate = new Date('2024-01-15T14:30:00Z')
      mockFormat.mockReturnValue('Jan 15, 2024 2:30 PM')

      const result = formatDateTime(testDate)
      
      expect(mockFormat).toHaveBeenCalledWith(testDate, 'MMM d, yyyy h:mm a')
      expect(result).toBe('Jan 15, 2024 2:30 PM')
    })
  })

  describe('formatRelativeTime', () => {
    it('should format relative time', () => {
      const testDate = new Date('2024-01-15T14:30:00Z')
      mockFormatDistance.mockReturnValue('2 hours ago')

      const result = formatRelativeTime(testDate)
      
      expect(mockFormatDistance).toHaveBeenCalledWith(testDate, expect.any(Date), { addSuffix: true })
      expect(result).toBe('2 hours ago')
    })

    it('should parse ISO strings for relative time', () => {
      const testDate = '2024-01-15T14:30:00Z'
      const parsedDate = new Date('2024-01-15T14:30:00Z')
      
      mockParseISO.mockReturnValue(parsedDate)
      mockFormatDistance.mockReturnValue('2 hours ago')

      const result = formatRelativeTime(testDate)
      
      expect(mockParseISO).toHaveBeenCalledWith(testDate)
      expect(mockFormatDistance).toHaveBeenCalledWith(parsedDate, expect.any(Date), { addSuffix: true })
      expect(result).toBe('2 hours ago')
    })
  })

  describe('formatCurrency', () => {
    it('should format currency in USD by default', () => {
      const result = formatCurrency(1234.56)
      expect(result).toBe('$1,234.56')
    })

    it('should format currency in specified currency', () => {
      const result = formatCurrency(1234.56, 'EUR')
      expect(result).toBe('€1,234.56')
    })

    it('should handle zero amount', () => {
      const result = formatCurrency(0)
      expect(result).toBe('$0.00')
    })

    it('should handle negative amounts', () => {
      const result = formatCurrency(-50.25)
      expect(result).toBe('-$50.25')
    })
  })

  describe('formatPhoneNumber', () => {
    it('should format 10-digit phone numbers', () => {
      const result = formatPhoneNumber('1234567890')
      expect(result).toBe('(123) 456-7890')
    })

    it('should format phone numbers with existing formatting', () => {
      const result = formatPhoneNumber('123-456-7890')
      expect(result).toBe('(123) 456-7890')
    })

    it('should format phone numbers with spaces', () => {
      const result = formatPhoneNumber('123 456 7890')
      expect(result).toBe('(123) 456-7890')
    })

    it('should return original string for invalid formats', () => {
      const invalidNumbers = [
        '123',
        '12345',
        'abc-def-ghij',
        '123-456-78901', // too long
      ]

      invalidNumbers.forEach((number) => {
        const result = formatPhoneNumber(number)
        expect(result).toBe(number)
      })
    })
  })

  describe('truncate', () => {
    it('should truncate long strings with default length', () => {
      const longString = 'This is a very long string that should be truncated'
      const result = truncate(longString)
      expect(result).toBe('This is a very long string that should be trunca...')
      expect(result.length).toBe(53) // 50 + '...'
    })

    it('should truncate with custom length', () => {
      const longString = 'This is a long string'
      const result = truncate(longString, 10)
      expect(result).toBe('This is a ...')
      expect(result.length).toBe(13) // 10 + '...'
    })

    it('should return original string if shorter than limit', () => {
      const shortString = 'Short'
      const result = truncate(shortString)
      expect(result).toBe('Short')
    })

    it('should return original string if exactly at limit', () => {
      const exactString = 'A'.repeat(50)
      const result = truncate(exactString)
      expect(result).toBe(exactString)
    })

    it('should handle empty strings', () => {
      const result = truncate('')
      expect(result).toBe('')
    })
  })
})