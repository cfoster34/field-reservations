module.exports = {
  // Coverage collection configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.{js,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,ts,tsx}',
    '!src/**/*.test.{js,ts,tsx}',
    '!src/**/*.spec.{js,ts,tsx}',
    '!src/**/index.{js,ts,tsx}',
    '!src/app/**/layout.tsx',
    '!src/app/**/loading.tsx',
    '!src/app/**/error.tsx',
    '!src/app/**/not-found.tsx',
    '!src/app/**/page.tsx', // Exclude Next.js page files from coverage
    '!src/styles/**',
    '!src/types/**',
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    // Specific thresholds for different directories
    './src/lib/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './src/utils/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/components/': {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
  
  // Coverage reporters
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json',
    'json-summary',
    'cobertura',
    'clover',
  ],
  
  // Coverage directory
  coverageDirectory: './coverage',
  
  // Coverage provider
  coverageProvider: 'v8', // Use V8 coverage (faster than babel)
  
  // Files to ignore for coverage
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/coverage/',
    '/dist/',
    '/build/',
    '/__tests__/',
    '/tests/',
    '/.storybook/',
    '/storybook-static/',
    'setupTests.js',
    'jest.config.js',
    'jest.setup.js',
    'next.config.js',
    'tailwind.config.js',
    'postcss.config.js',
  ],
  
  // Custom coverage reporters configuration
  coverageReporterConfig: {
    html: {
      subdir: 'html',
      skipCovered: false,
      skipEmpty: false,
    },
    lcov: {
      projectRoot: process.cwd(),
    },
    text: {
      maxCols: 100,
    },
    cobertura: {
      file: 'cobertura-coverage.xml',
    },
  },
  
  // Fail tests if coverage is below threshold
  coverageThresholdEnforcement: {
    failOnError: true,
    skipCovered: false,
  },
  
  // Additional configuration for specific test types
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/__tests__/unit/**/*.test.{js,ts,tsx}'],
      collectCoverageFrom: [
        'src/utils/**/*.{js,ts,tsx}',
        'src/lib/**/*.{js,ts,tsx}',
        '!src/lib/**/*.test.{js,ts,tsx}',
      ],
      coverageDirectory: './coverage/unit',
      coverageReporters: ['lcov', 'json', 'text-summary'],
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/__tests__/integration/**/*.test.{js,ts,tsx}'],
      collectCoverageFrom: [
        'src/app/api/**/*.{js,ts}',
        'src/lib/**/*.{js,ts,tsx}',
        '!src/lib/**/*.test.{js,ts,tsx}',
      ],
      coverageDirectory: './coverage/integration',
      coverageReporters: ['lcov', 'json', 'text-summary'],
    },
    {
      displayName: 'components',
      testMatch: ['<rootDir>/__tests__/components/**/*.test.{js,ts,tsx}'],
      collectCoverageFrom: [
        'src/components/**/*.{js,ts,tsx}',
        '!src/components/**/*.test.{js,ts,tsx}',
        '!src/components/**/*.stories.{js,ts,tsx}',
      ],
      coverageDirectory: './coverage/components',
      coverageReporters: ['lcov', 'json', 'text-summary'],
    },
    {
      displayName: 'security',
      testMatch: ['<rootDir>/__tests__/security/**/*.test.{js,ts,tsx}'],
      collectCoverageFrom: [
        'src/lib/api/middleware.ts',
        'src/lib/supabase/**/*.{js,ts,tsx}',
        'src/lib/stripe/**/*.{js,ts,tsx}',
      ],
      coverageDirectory: './coverage/security',
      coverageReporters: ['lcov', 'json', 'text-summary'],
    },
  ],
  
  // Custom coverage collection setup
  setupFilesAfterEnv: ['<rootDir>/coverage.setup.js'],
  
  // Transform files for coverage
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['@swc/jest', {
      jsc: {
        parser: {
          syntax: 'typescript',
          tsx: true,
          decorators: false,
          dynamicImport: true,
        },
        transform: {
          react: {
            runtime: 'automatic',
          },
        },
      },
    }],
  },
  
  // Module name mapping for coverage
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/__mocks__/fileMock.js',
  },
  
  // Test environment for coverage
  testEnvironment: 'jsdom',
  
  // Custom test results processor for coverage
  testResultsProcessor: 'jest-sonar-reporter',
  
  // Performance optimization for coverage
  maxWorkers: '50%',
  cache: true,
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
  
  // Verbose output for coverage debugging
  verbose: process.env.NODE_ENV === 'test',
  
  // Bail on first test failure in CI
  bail: process.env.CI ? 1 : 0,
}