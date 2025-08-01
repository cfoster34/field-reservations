// Coverage collection setup and configuration

// Global test setup for coverage collection
beforeAll(() => {
  // Set up global mocks for consistent coverage
  global.fetch = jest.fn()
  global.console = {
    ...console,
    // Suppress console.log in tests unless explicitly testing logging
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
})

afterAll(() => {
  // Clean up after coverage collection
  jest.clearAllMocks()
  jest.restoreAllMocks()
})

// Set up Istanbul/NYC ignore patterns for runtime
beforeEach(() => {
  // Mark test utilities as not requiring coverage
  if (global.__coverage__) {
    // Exclude test utilities from coverage
    const testUtilFiles = [
      'setupTests.js',
      'jest.setup.js',
      'test-utils.js',
      '__tests__/fixtures/',
      '__tests__/mocks/',
      '__tests__/utils/',
    ]
    
    testUtilFiles.forEach(pattern => {
      Object.keys(global.__coverage__).forEach(filename => {
        if (filename.includes(pattern)) {
          delete global.__coverage__[filename]
        }
      })
    })
  }
})

// Custom coverage matchers
expect.extend({
  toHaveCoverage(received, expected) {
    const pass = received.coverage >= expected
    return {
      message: () =>
        `expected ${received.name} to have at least ${expected}% coverage, but got ${received.coverage}%`,
      pass,
    }
  },
  
  toBeCoveredByTests(received) {
    const isCovered = received.lines.covered > 0 || received.functions.covered > 0
    return {
      message: () =>
        `expected ${received.name} to be covered by tests, but no lines or functions were executed`,
      pass: isCovered,
    }
  },
})

// Coverage reporting helpers
global.getCoverageReport = () => {
  if (global.__coverage__) {
    const coverage = global.__coverage__
    const report = {
      totalFiles: Object.keys(coverage).length,
      coveredFiles: 0,
      totalLines: 0,
      coveredLines: 0,
      totalFunctions: 0,
      coveredFunctions: 0,
      totalBranches: 0,
      coveredBranches: 0,
    }
    
    Object.values(coverage).forEach(fileCoverage => {
      if (fileCoverage.s && Object.values(fileCoverage.s).some(hits => hits > 0)) {
        report.coveredFiles++
      }
      
      // Count statements
      report.totalLines += Object.keys(fileCoverage.s || {}).length
      report.coveredLines += Object.values(fileCoverage.s || {}).filter(hits => hits > 0).length
      
      // Count functions
      report.totalFunctions += Object.keys(fileCoverage.f || {}).length
      report.coveredFunctions += Object.values(fileCoverage.f || {}).filter(hits => hits > 0).length
      
      // Count branches
      report.totalBranches += Object.keys(fileCoverage.b || {}).length
      report.coveredBranches += Object.values(fileCoverage.b || {})
        .filter(branch => Array.isArray(branch) && branch.some(hits => hits > 0)).length
    })
    
    return {
      ...report,
      linesCoverage: report.totalLines > 0 ? (report.coveredLines / report.totalLines) * 100 : 0,
      functionsCoverage: report.totalFunctions > 0 ? (report.coveredFunctions / report.totalFunctions) * 100 : 0,
      branchesCoverage: report.totalBranches > 0 ? (report.coveredBranches / report.totalBranches) * 100 : 0,
    }
  }
  return null
}

// Coverage debugging helpers
global.debugCoverage = (filename) => {
  if (global.__coverage__ && global.__coverage__[filename]) {
    const fileCoverage = global.__coverage__[filename]
    console.log(`Coverage for ${filename}:`)
    console.log('Statements:', fileCoverage.s)
    console.log('Functions:', fileCoverage.f)
    console.log('Branches:', fileCoverage.b)
  } else {
    console.log(`No coverage data found for ${filename}`)
  }
}

// Custom coverage collection for dynamic imports
const originalImport = global.import || (() => Promise.resolve({}))
global.import = async (specifier) => {
  const result = await originalImport(specifier)
  
  // Mark dynamically imported modules for coverage
  if (global.__coverage__ && result && typeof result === 'object') {
    const filename = specifier.replace(/^\.\//, '').replace(/^@\//, 'src/')
    if (!global.__coverage__[filename]) {
      // Initialize coverage data for dynamically imported modules
      global.__coverage__[filename] = {
        path: filename,
        s: {},
        f: {},
        b: {},
        statementMap: {},
        functionMap: {},
        branchMap: {},
      }
    }
  }
  
  return result
}

// Hook into module loading for coverage
const Module = require('module')
const originalRequire = Module.prototype.require

Module.prototype.require = function(id) {
  const result = originalRequire.apply(this, arguments)
  
  // Track module loading for coverage
  if (global.__coverage__ && id.startsWith('./src/') || id.startsWith('@/')) {
    const filename = id.replace(/^@\//, 'src/').replace(/^\.\//, '')
    if (!global.__coverage__[filename] && !id.includes('test') && !id.includes('spec')) {
      // Initialize coverage for required modules
      global.__coverage__[filename] = {
        path: filename,
        s: {},
        f: {},
        b: {},
        statementMap: {},
        functionMap: {},
        branchMap: {},
      }
    }
  }
  
  return result
}

// Coverage threshold enforcement
global.enforceCoverageThresholds = (thresholds) => {
  const report = global.getCoverageReport()
  if (!report) return true
  
  const failures = []
  
  if (thresholds.lines && report.linesCoverage < thresholds.lines) {
    failures.push(`Lines coverage ${report.linesCoverage.toFixed(2)}% is below threshold ${thresholds.lines}%`)
  }
  
  if (thresholds.functions && report.functionsCoverage < thresholds.functions) {
    failures.push(`Functions coverage ${report.functionsCoverage.toFixed(2)}% is below threshold ${thresholds.functions}%`)
  }
  
  if (thresholds.branches && report.branchesCoverage < thresholds.branches) {
    failures.push(`Branches coverage ${report.branchesCoverage.toFixed(2)}% is below threshold ${thresholds.branches}%`)
  }
  
  if (failures.length > 0) {
    console.error('Coverage thresholds not met:')
    failures.forEach(failure => console.error(`  - ${failure}`))
    return false
  }
  
  return true
}

// Performance monitoring for coverage collection
let coverageStartTime
global.startCoverageTimer = () => {
  coverageStartTime = process.hrtime.bigint()
}

global.endCoverageTimer = () => {
  if (coverageStartTime) {
    const endTime = process.hrtime.bigint()
    const duration = Number(endTime - coverageStartTime) / 1000000 // Convert to milliseconds
    console.log(`Coverage collection took ${duration.toFixed(2)}ms`)
  }
}

// Clean up coverage data for better performance
global.cleanupCoverage = () => {
  if (global.__coverage__) {
    // Remove coverage data for files that weren't actually tested
    Object.keys(global.__coverage__).forEach(filename => {
      const fileCoverage = global.__coverage__[filename]
      const hasHits = Object.values(fileCoverage.s || {}).some(hits => hits > 0) ||
                     Object.values(fileCoverage.f || {}).some(hits => hits > 0) ||
                     Object.values(fileCoverage.b || {}).some(branch => 
                       Array.isArray(branch) && branch.some(hits => hits > 0))
      
      if (!hasHits) {
        delete global.__coverage__[filename]
      }
    })
  }
}

// Export coverage utilities for use in tests
module.exports = {
  getCoverageReport: global.getCoverageReport,
  debugCoverage: global.debugCoverage,
  enforceCoverageThresholds: global.enforceCoverageThresholds,
  startCoverageTimer: global.startCoverageTimer,
  endCoverageTimer: global.endCoverageTimer,
  cleanupCoverage: global.cleanupCoverage,
}