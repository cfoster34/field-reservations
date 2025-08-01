import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

// Custom metrics
const errorRate = new Rate('errors')

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 }, // Ramp up to 10 users
    { duration: '5m', target: 50 }, // Stay at 50 users
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 0 }, // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.1'], // Error rate must be below 10%
    errors: ['rate<0.1'],
  },
}

// Test data
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const API_BASE = `${BASE_URL}/api`

// Test user credentials
const TEST_USERS = [
  { email: 'loadtest1@example.com', password: 'LoadTest123!' },
  { email: 'loadtest2@example.com', password: 'LoadTest123!' },
  { email: 'loadtest3@example.com', password: 'LoadTest123!' },
  { email: 'loadtest4@example.com', password: 'LoadTest123!' },
  { email: 'loadtest5@example.com', password: 'LoadTest123!' },
]

// Authentication function
function authenticate() {
  const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)]
  
  const loginResponse = http.post(`${API_BASE}/auth/login`, {
    email: user.email,
    password: user.password,
  }, {
    headers: { 'Content-Type': 'application/json' },
  })

  const success = check(loginResponse, {
    'login successful': (r) => r.status === 200,
    'login response time < 200ms': (r) => r.timings.duration < 200,
  })

  if (!success) {
    errorRate.add(1)
    return null
  }

  try {
    const authData = JSON.parse(loginResponse.body)
    return authData.access_token
  } catch (e) {
    errorRate.add(1)
    return null
  }
}

// Main test scenario
export default function () {
  const authToken = authenticate()
  
  if (!authToken) {
    sleep(1)
    return
  }

  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  }

  // Test 1: List fields (read operation)
  const fieldsResponse = http.get(`${API_BASE}/fields`, { headers })
  check(fieldsResponse, {
    'fields list successful': (r) => r.status === 200,
    'fields response time < 300ms': (r) => r.timings.duration < 300,
    'fields returns data': (r) => {
      try {
        const data = JSON.parse(r.body)
        return Array.isArray(data) && data.length > 0
      } catch (e) {
        return false
      }
    },
  }) || errorRate.add(1)

  sleep(1)

  // Test 2: Get user reservations
  const reservationsResponse = http.get(`${API_BASE}/reservations`, { headers })
  check(reservationsResponse, {
    'reservations list successful': (r) => r.status === 200,
    'reservations response time < 400ms': (r) => r.timings.duration < 400,
  }) || errorRate.add(1)

  sleep(1)

  // Test 3: Check field availability
  const availabilityResponse = http.get(
    `${API_BASE}/fields/field-1/availability?date=2024-03-15`, 
    { headers }
  )
  check(availabilityResponse, {
    'availability check successful': (r) => r.status === 200,
    'availability response time < 250ms': (r) => r.timings.duration < 250,
  }) || errorRate.add(1)

  sleep(2)

  // Test 4: Create reservation (write operation - more expensive)
  const reservationData = {
    fieldId: 'field-1',
    date: '2024-03-15',
    startTime: `${10 + Math.floor(Math.random() * 8)}:00`, // Random hour 10-17
    endTime: `${12 + Math.floor(Math.random() * 8)}:00`, // Random hour 12-19
    purpose: 'Load test booking',
    attendees: Math.floor(Math.random() * 20) + 1,
    notes: 'Automated load test',
  }

  const createResponse = http.post(
    `${API_BASE}/reservations`,
    JSON.stringify(reservationData),
    { headers }
  )
  
  const createSuccess = check(createResponse, {
    'reservation creation response': (r) => r.status === 201 || r.status === 409, // 409 for conflicts is OK
    'reservation creation time < 1000ms': (r) => r.timings.duration < 1000,
  })

  if (!createSuccess) {
    errorRate.add(1)
  }

  // If reservation was created successfully, test cancellation
  if (createResponse.status === 201) {
    try {
      const reservation = JSON.parse(createResponse.body)
      sleep(1)

      // Test 5: Cancel reservation
      const cancelResponse = http.post(
        `${API_BASE}/reservations/${reservation.reservation.id}/cancel`,
        {},
        { headers }
      )
      
      check(cancelResponse, {
        'cancellation successful': (r) => r.status === 200,
        'cancellation response time < 500ms': (r) => r.timings.duration < 500,
      }) || errorRate.add(1)
    } catch (e) {
      errorRate.add(1)
    }
  }

  sleep(2)
}

// Spike test scenario
export function spikeTest() {
  const authToken = authenticate()
  
  if (!authToken) {
    return
  }

  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  }

  // Rapid-fire requests to test system under sudden load
  for (let i = 0; i < 5; i++) {
    const response = http.get(`${API_BASE}/fields`, { headers })
    check(response, {
      'spike test request successful': (r) => r.status === 200,
    }) || errorRate.add(1)
  }
}

// Stress test for database connections
export function dbStressTest() {
  const authToken = authenticate()
  
  if (!authToken) {
    return
  }

  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  }

  // Multiple concurrent database operations
  const responses = http.batch([
    ['GET', `${API_BASE}/fields`, null, { headers }],
    ['GET', `${API_BASE}/reservations`, null, { headers }],
    ['GET', `${API_BASE}/users/profile`, null, { headers }],
    ['GET', `${API_BASE}/analytics/utilization`, null, { headers }],
  ])

  responses.forEach((response, index) => {
    check(response, {
      [`batch request ${index} successful`]: (r) => r.status === 200,
      [`batch request ${index} time < 600ms`]: (r) => r.timings.duration < 600,
    }) || errorRate.add(1)
  })
}

// Memory leak test scenario
export function memoryTest() {
  const authToken = authenticate()
  
  if (!authToken) {
    return
  }

  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  }

  // Create large payloads to test memory handling
  const largeReservationData = {
    fieldId: 'field-1',
    date: '2024-03-15',
    startTime: '10:00',
    endTime: '12:00',
    purpose: 'Memory test ' + 'x'.repeat(1000), // Large purpose string
    attendees: 20,
    notes: 'Large notes field ' + 'y'.repeat(5000), // Large notes
    metadata: {
      largeData: Array(1000).fill('test data').join(' '),
    },
  }

  const response = http.post(
    `${API_BASE}/reservations`,
    JSON.stringify(largeReservationData),
    { headers }
  )

  check(response, {
    'large payload handled': (r) => r.status === 201 || r.status === 409 || r.status === 400,
    'large payload response time < 2000ms': (r) => r.timings.duration < 2000,
  }) || errorRate.add(1)
}

// Configuration for different test types
export const spikeOptions = {
  executor: 'constant-arrival-rate',
  rate: 100, // 100 requests per second
  timeUnit: '1s',
  duration: '30s',
  preAllocatedVUs: 50,
  maxVUs: 200,
}

export const stressOptions = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '5m', target: 200 },
    { duration: '1m', target: 300 },
    { duration: '5m', target: 300 },
    { duration: '2m', target: 0 },
  ],
}

// Performance test for specific endpoints
export function endpointPerformanceTest() {
  const scenarios = {
    // Test authentication endpoint
    auth_test: {
      executor: 'constant-vus',
      vus: 10,
      duration: '1m',
      exec: 'authPerformanceTest',
    },
    
    // Test field listing endpoint
    fields_test: {
      executor: 'constant-vus',
      vus: 20,
      duration: '2m',
      exec: 'fieldsPerformanceTest',
    },
    
    // Test reservation creation endpoint
    booking_test: {
      executor: 'constant-vus',
      vus: 15,
      duration: '3m',
      exec: 'bookingPerformanceTest',
    },
  }

  return scenarios
}

// Individual performance test functions
export function authPerformanceTest() {
  const startTime = new Date().getTime()
  const token = authenticate()
  const endTime = new Date().getTime()
  
  check(null, {
    'auth performance < 100ms': () => (endTime - startTime) < 100,
  }) || errorRate.add(1)
}

export function fieldsPerformanceTest() {
  const token = authenticate()
  if (!token) return

  const startTime = new Date().getTime()
  const response = http.get(`${API_BASE}/fields`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  const endTime = new Date().getTime()

  check(response, {
    'fields endpoint performance < 200ms': () => (endTime - startTime) < 200,
    'fields endpoint successful': (r) => r.status === 200,
  }) || errorRate.add(1)
}

export function bookingPerformanceTest() {
  const token = authenticate()
  if (!token) return

  const reservationData = {
    fieldId: 'field-1',
    date: '2024-03-15',
    startTime: '14:00',
    endTime: '16:00',
    purpose: 'Performance test',
    attendees: 10,
  }

  const startTime = new Date().getTime()
  const response = http.post(
    `${API_BASE}/reservations`,
    JSON.stringify(reservationData),
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    }
  )
  const endTime = new Date().getTime()

  check(response, {
    'booking endpoint performance < 500ms': () => (endTime - startTime) < 500,
    'booking endpoint response': (r) => r.status === 201 || r.status === 409,
  }) || errorRate.add(1)
}