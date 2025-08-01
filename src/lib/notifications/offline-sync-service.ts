// Offline Message Sync Service
import { useState, useEffect } from 'react';
import { supabase } from '../supabase/client';
import { Message, OfflineMessageQueue } from '../../types/communication';

interface QueuedMessage {
  id: string;
  data: any;
  timestamp: number;
  attempts: number;
  maxAttempts: number;
  type: 'message' | 'reaction' | 'read_status' | 'typing';
}

export class OfflineSyncService {
  private static instance: OfflineSyncService;
  private db: IDBDatabase | null = null;
  private syncQueue: QueuedMessage[] = [];
  private isOnline = navigator.onLine;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeDB();
    this.setupEventListeners();
    this.startSyncInterval();
  }

  static getInstance(): OfflineSyncService {
    if (!OfflineSyncService.instance) {
      OfflineSyncService.instance = new OfflineSyncService();
    }
    return OfflineSyncService.instance;
  }

  private async initializeDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('FieldReservationsOfflineDB', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.loadQueueFromStorage();
        resolve();
      };

      request.onupgradeneeded = () => {
        const db = request.result;

        // Offline messages store
        if (!db.objectStoreNames.contains('offline_messages')) {
          const store = db.createObjectStore('offline_messages', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('type', 'type');
          store.createIndex('attempts', 'attempts');
        }

        // Cached messages store
        if (!db.objectStoreNames.contains('cached_messages')) {
          const store = db.createObjectStore('cached_messages', { keyPath: 'id' });
          store.createIndex('channel_id', 'channel_id');
          store.createIndex('created_at', 'created_at');
        }

        // Sync metadata store
        if (!db.objectStoreNames.contains('sync_metadata')) {
          const store = db.createObjectStore('sync_metadata', { keyPath: 'key' });
        }
      };
    });
  }

  private setupEventListeners(): void {
    // Online/offline status
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processSyncQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Page visibility for background sync
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline) {
        this.processSyncQueue();
      }
    });

    // Service worker background sync
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        if ('sync' in registration) {
          // Register for background sync
          registration.sync.register('sync-messages');
        }
      });
    }
  }

  private startSyncInterval(): void {
    // Sync every 30 seconds when online
    this.syncInterval = setInterval(() => {
      if (this.isOnline && this.syncQueue.length > 0) {
        this.processSyncQueue();
      }
    }, 30000);
  }

  // Queue a message for offline sending
  async queueMessage(messageData: any, type: 'message' | 'reaction' | 'read_status' | 'typing' = 'message'): Promise<string> {
    const queuedMessage: QueuedMessage = {
      id: `offline_${Date.now()}_${Math.random()}`,
      data: messageData,
      timestamp: Date.now(),
      attempts: 0,
      maxAttempts: 5,
      type
    };

    this.syncQueue.push(queuedMessage);
    await this.saveQueueToStorage();

    // Try to send immediately if online
    if (this.isOnline) {
      this.processSyncQueue();
    }

    return queuedMessage.id;
  }

  // Save queue to IndexedDB
  private async saveQueueToStorage(): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(['offline_messages'], 'readwrite');
    const store = transaction.objectStore('offline_messages');

    // Clear existing queue
    await new Promise((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => resolve(undefined);
      clearRequest.onerror = () => reject(clearRequest.error);
    });

    // Save current queue
    for (const message of this.syncQueue) {
      await new Promise((resolve, reject) => {
        const addRequest = store.add(message);
        addRequest.onsuccess = () => resolve(undefined);
        addRequest.onerror = () => reject(addRequest.error);
      });
    }
  }

  // Load queue from IndexedDB
  private async loadQueueFromStorage(): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(['offline_messages'], 'readonly');
    const store = transaction.objectStore('offline_messages');

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        this.syncQueue = request.result || [];
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Process the sync queue
  private async processSyncQueue(): Promise<void> {
    if (!this.isOnline || this.syncQueue.length === 0) return;

    const processPromises = this.syncQueue
      .filter(item => item.attempts < item.maxAttempts)
      .map(item => this.processSyncItem(item));

    await Promise.allSettled(processPromises);
    
    // Remove successfully processed items
    this.syncQueue = this.syncQueue.filter(item => item.attempts < item.maxAttempts);
    await this.saveQueueToStorage();
  }

  // Process individual sync item
  private async processSyncItem(item: QueuedMessage): Promise<void> {
    try {
      item.attempts++;

      switch (item.type) {
        case 'message':
          await this.syncMessage(item.data);
          break;
        case 'reaction':
          await this.syncReaction(item.data);
          break;
        case 'read_status':
          await this.syncReadStatus(item.data);
          break;
        case 'typing':
          await this.syncTypingIndicator(item.data);
          break;
      }

      // Mark as processed by setting attempts to max
      item.attempts = item.maxAttempts;
    } catch (error) {
      console.error(`Failed to sync ${item.type}:`, error);
      
      // Exponential backoff for retries
      const backoffDelay = Math.min(1000 * Math.pow(2, item.attempts), 30000);
      setTimeout(() => {
        if (this.isOnline && item.attempts < item.maxAttempts) {
          this.processSyncItem(item);
        }
      }, backoffDelay);
    }
  }

  // Sync individual message
  private async syncMessage(messageData: any): Promise<void> {
    const { error } = await supabase
      .from('messages')
      .insert({
        ...messageData,
        created_at: new Date().toISOString()
      });

    if (error) throw error;
  }

  // Sync message reaction
  private async syncReaction(reactionData: any): Promise<void> {
    const { error } = await supabase
      .from('message_reactions')
      .insert(reactionData);

    if (error) throw error;
  }

  // Sync read status
  private async syncReadStatus(statusData: any): Promise<void> {
    const { error } = await supabase
      .from('message_status')
      .upsert(statusData, {
        onConflict: 'message_id,user_id'
      });

    if (error) throw error;
  }

  // Sync typing indicator
  private async syncTypingIndicator(typingData: any): Promise<void> {
    const { error } = await supabase
      .from('typing_indicators')
      .upsert(typingData, {
        onConflict: 'user_id,channel_id'
      });

    if (error) throw error;
  }

  // Cache messages for offline access
  async cacheMessages(channelId: string, messages: Message[]): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(['cached_messages'], 'readwrite');
    const store = transaction.objectStore('cached_messages');

    for (const message of messages) {
      await new Promise((resolve, reject) => {
        const request = store.put({
          ...message,
          channel_id: channelId,
          cached_at: Date.now()
        });
        request.onsuccess = () => resolve(undefined);
        request.onerror = () => reject(request.error);
      });
    }
  }

  // Get cached messages for offline viewing
  async getCachedMessages(channelId: string, limit = 50): Promise<Message[]> {
    if (!this.db) return [];

    const transaction = this.db.transaction(['cached_messages'], 'readonly');
    const store = transaction.objectStore('cached_messages');
    const index = store.index('channel_id');

    return new Promise((resolve, reject) => {
      const request = index.getAll(channelId);
      request.onsuccess = () => {
        const messages = request.result
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, limit);
        resolve(messages);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Update sync metadata
  async updateSyncMetadata(key: string, value: any): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(['sync_metadata'], 'readwrite');
    const store = transaction.objectStore('sync_metadata');

    return new Promise((resolve, reject) => {
      const request = store.put({ key, value, updated_at: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Get sync metadata
  async getSyncMetadata(key: string): Promise<any> {
    if (!this.db) return null;

    const transaction = this.db.transaction(['sync_metadata'], 'readonly');
    const store = transaction.objectStore('sync_metadata');

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result ? request.result.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Clean up old cached data
  async cleanupCache(maxAge = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    if (!this.db) return;

    const cutoff = Date.now() - maxAge;
    const transaction = this.db.transaction(['cached_messages'], 'readwrite');
    const store = transaction.objectStore('cached_messages');

    return new Promise((resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const message = cursor.value;
          if (message.cached_at < cutoff) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Get queue status
  getQueueStatus(): { total: number; pending: number; failed: number } {
    const pending = this.syncQueue.filter(item => item.attempts < item.maxAttempts).length;
    const failed = this.syncQueue.filter(item => item.attempts >= item.maxAttempts).length;
    
    return {
      total: this.syncQueue.length,
      pending,
      failed
    };
  }

  // Force sync attempt
  async forcSync(): Promise<void> {
    if (this.isOnline) {
      await this.processSyncQueue();
    }
  }

  // Clear failed items from queue
  async clearFailedItems(): Promise<void> {
    this.syncQueue = this.syncQueue.filter(item => item.attempts < item.maxAttempts);
    await this.saveQueueToStorage();
  }

  // Destroy service
  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    if (this.db) {
      this.db.close();
    }
  }
}

// React hook for offline sync functionality

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueStatus, setQueueStatus] = useState({ total: 0, pending: 0, failed: 0 });
  const syncService = OfflineSyncService.getInstance();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Update queue status periodically
    const interval = setInterval(() => {
      setQueueStatus(syncService.getQueueStatus());
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const queueMessage = async (messageData: any, type?: 'message' | 'reaction' | 'read_status' | 'typing') => {
    return await syncService.queueMessage(messageData, type);
  };

  const getCachedMessages = async (channelId: string, limit?: number) => {
    return await syncService.getCachedMessages(channelId, limit);
  };

  const forceSync = async () => {
    await syncService.forcSync();
  };

  const clearFailed = async () => {
    await syncService.clearFailedItems();
  };

  return {
    isOnline,
    queueStatus,
    queueMessage,
    getCachedMessages,
    forceSync,
    clearFailed
  };
}

export default OfflineSyncService;