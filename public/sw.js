// Service Worker for Field Reservations PWA
const CACHE_NAME = 'field-reservations-v1';
const urlsToCache = [
  '/',
  '/offline',
  '/manifest.json',
];

// Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Cache and return requests
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        return fetch(event.request).then(
          (response) => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                // Don't cache API calls or non-GET requests
                if (event.request.method === 'GET' && !event.request.url.includes('/api/')) {
                  cache.put(event.request, responseToCache);
                }
              });

            return response;
          }
        );
      })
      .catch(() => {
        // If both cache and network fail, show offline page
        if (event.request.destination === 'document') {
          return caches.match('/offline');
        }
      })
  );
});

// Update Service Worker
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Background sync for offline reservations
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-reservations') {
    event.waitUntil(syncReservations());
  }
});

async function syncReservations() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedRequests = await cache.keys();
    
    const reservationRequests = cachedRequests.filter(
      request => request.url.includes('/api/reservations') && request.method === 'POST'
    );

    for (const request of reservationRequests) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.delete(request);
        }
      } catch (error) {
        console.error('Failed to sync reservation:', error);
      }
    }
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

// Push notifications
self.addEventListener('push', (event) => {
  let notificationData = {
    title: 'Field Reservations',
    body: 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: 'default',
    data: {}
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      notificationData = {
        ...notificationData,
        ...payload
      };
    } catch (error) {
      notificationData.body = event.data.text();
    }
  }

  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    tag: notificationData.tag,
    data: notificationData.data,
    vibrate: getVibrationPattern(notificationData.category),
    actions: getNotificationActions(notificationData.category),
    requireInteraction: notificationData.category === 'urgent' || notificationData.priority >= 5,
    silent: notificationData.priority <= 1
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

function getVibrationPattern(category) {
  switch (category) {
    case 'message':
      return [100, 50, 100];
    case 'announcement':
      return [200, 100, 200, 100, 200];
    case 'reservation':
      return [300, 100, 300];
    case 'urgent':
      return [100, 50, 100, 50, 100, 50, 100];
    default:
      return [100, 50, 100];
  }
}

function getNotificationActions(category) {
  const baseActions = [
    {
      action: 'view',
      title: 'View',
      icon: '/icons/view.png'
    },
    {
      action: 'dismiss',
      title: 'Dismiss',
      icon: '/icons/dismiss.png'
    }
  ];

  switch (category) {
    case 'message':
      return [
        {
          action: 'reply',
          title: 'Reply',
          icon: '/icons/reply.png'
        },
        ...baseActions
      ];
    case 'reservation':
      return [
        {
          action: 'view-reservation',
          title: 'View Reservation',
          icon: '/icons/calendar.png'
        },
        ...baseActions
      ];
    case 'announcement':
      return [
        {
          action: 'view-announcements',
          title: 'View Announcements',
          icon: '/icons/announcements.png'
        },
        ...baseActions
      ];
    default:
      return baseActions;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data;
  let url = '/';

  switch (event.action) {
    case 'reply':
      url = `/chat${data.channelId ? `?channel=${data.channelId}` : `?user=${data.senderId}`}`;
      break;
    case 'view-reservation':
      url = `/reservations${data.reservationId ? `/${data.reservationId}` : ''}`;
      break;
    case 'view-announcements':
      url = '/announcements';
      break;
    case 'view':
      if (data.messageId) {
        url = `/chat${data.channelId ? `?channel=${data.channelId}` : `?user=${data.senderId}`}`;
      } else if (data.reservationId) {
        url = `/reservations/${data.reservationId}`;
      } else if (data.announcementId) {
        url = '/announcements';
      }
      break;
    case 'dismiss':
      // Just close the notification, no action needed
      return;
    default:
      // Default action when clicking notification body
      if (data.messageId) {
        url = `/chat${data.channelId ? `?channel=${data.channelId}` : `?user=${data.senderId}`}`;
      } else if (data.reservationId) {
        url = `/reservations/${data.reservationId}`;
      } else if (data.announcementId) {
        url = '/announcements';
      }
      break;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Open new window/tab
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Background sync for offline messages
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-reservations') {
    event.waitUntil(syncReservations());
  } else if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  try {
    // Get messages from IndexedDB that need to be synced
    const db = await openDB();
    const tx = db.transaction(['offline_messages'], 'readonly');
    const store = tx.objectStore('offline_messages');
    const messages = await store.getAll();

    for (const message of messages) {
      try {
        const response = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message.data),
        });

        if (response.ok) {
          // Remove from offline storage
          const deleteTx = db.transaction(['offline_messages'], 'readwrite');
          const deleteStore = deleteTx.objectStore('offline_messages');
          await deleteStore.delete(message.id);
        }
      } catch (error) {
        console.error('Failed to sync message:', error);
      }
    }
  } catch (error) {
    console.error('Message sync failed:', error);
  }
}

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('FieldReservationsDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = () => {
      const db = request.result;
      
      if (!db.objectStoreNames.contains('offline_messages')) {
        const store = db.createObjectStore('offline_messages', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
      }
      
      if (!db.objectStoreNames.contains('cached_data')) {
        const store = db.createObjectStore('cached_data', { keyPath: 'key' });
        store.createIndex('timestamp', 'timestamp');
      }
    };
  });
}