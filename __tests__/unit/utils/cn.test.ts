import { cn } from '@/utils/cn'

describe('cn utility', () => {
  it('should merge class names correctly', () => {
    const result = cn('px-4', 'py-2', 'bg-blue-500')
    expect(result).toBe('px-4 py-2 bg-blue-500')
  })

  it('should handle conditional class names', () => {
    const result = cn('base-class', true && 'conditional-class', false && 'hidden-class')
    expect(result).toBe('base-class conditional-class')
  })

  it('should merge conflicting Tailwind classes correctly', () => {
    const result = cn('px-2', 'px-4') // px-4 should override px-2
    expect(result).toBe('px-4')
  })

  it('should handle arrays of class names', () => {
    const result = cn(['class1', 'class2'], 'class3')
    expect(result).toBe('class1 class2 class3')
  })

  it('should handle objects with conditional classes', () => {
    const result = cn({
      'active': true,
      'disabled': false,
      'loading': true,
    })
    expect(result).toBe('active loading')
  })

  it('should handle mixed types of inputs', () => {
    const result = cn(
      'base-class',
      ['array-class1', 'array-class2'],
      {
        'object-class': true,
        'hidden-class': false,
      },
      'final-class'
    )
    expect(result).toBe('base-class array-class1 array-class2 object-class final-class')
  })

  it('should handle undefined and null inputs', () => {
    const result = cn('valid-class', undefined, null, 'another-class')
    expect(result).toBe('valid-class another-class')
  })

  it('should handle empty strings', () => {
    const result = cn('', 'valid-class', '')
    expect(result).toBe('valid-class')
  })

  it('should prioritize later classes in Tailwind conflicts', () => {
    const result = cn('bg-red-500', 'bg-blue-500', 'bg-green-500')
    expect(result).toBe('bg-green-500')
  })

  it('should handle complex Tailwind merge scenarios', () => {
    const result = cn(
      'px-4 py-2 bg-red-500',
      'px-6 text-white',
      'hover:bg-red-600'
    )
    expect(result).toBe('py-2 bg-red-500 px-6 text-white hover:bg-red-600')
  })
})