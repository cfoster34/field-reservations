// Push Notification Service
import { useState, useEffect } from 'react';
import { supabase } from '../supabase/client';
import { NotificationCategory, NotificationType } from '../../types/communication';

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  category?: NotificationCategory;
  priority?: number;
  data?: Record<string, any>;
}

export class PushNotificationService {
  private static instance: PushNotificationService;
  private vapidPublicKey: string;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;

  constructor() {
    // You should store this in environment variables
    this.vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
  }

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  async initialize(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push messaging is not supported');
      return false;
    }

    try {
      // Register service worker
      this.serviceWorkerRegistration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered successfully');
      return true;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return false;
    }
  }

  async requestPermission(): Promise<NotificationPermission> {
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      await this.subscribeToPushNotifications();
    }
    
    return permission;
  }

  async subscribeToPushNotifications(): Promise<boolean> {
    if (!this.serviceWorkerRegistration) {
      throw new Error('Service Worker not registered');
    }

    try {
      const subscription = await this.serviceWorkerRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
      });

      // Save subscription to database
      await this.saveSubscription(subscription);
      return true;
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      return false;
    }
  }

  async unsubscribeFromPushNotifications(): Promise<boolean> {
    if (!this.serviceWorkerRegistration) {
      return false;
    }

    try {
      const subscription = await this.serviceWorkerRegistration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        await this.removeSubscription(subscription.endpoint);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error);
      return false;
    }
  }

  async getSubscriptionStatus(): Promise<{
    isSubscribed: boolean;
    permission: NotificationPermission;
    subscription?: PushSubscription;
  }> {
    const permission = Notification.permission;
    
    if (!this.serviceWorkerRegistration || permission !== 'granted') {
      return { isSubscribed: false, permission };
    }

    try {
      const subscription = await this.serviceWorkerRegistration.pushManager.getSubscription();
      return {
        isSubscribed: !!subscription,
        permission,
        subscription: subscription || undefined
      };
    } catch (error) {
      console.error('Failed to get subscription status:', error);
      return { isSubscribed: false, permission };
    }
  }

  private async saveSubscription(subscription: PushSubscription): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const subscriptionData = {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: this.arrayBufferToBase64(subscription.getKey('p256dh')),
      auth: this.arrayBufferToBase64(subscription.getKey('auth')),
      user_agent: navigator.userAgent,
      is_active: true
    };

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(subscriptionData, {
        onConflict: 'user_id,endpoint'
      });

    if (error) {
      throw error;
    }
  }

  private async removeSubscription(endpoint: string): Promise<void> {
    const { error } = await supabase
      .from('push_subscriptions')
      .update({ is_active: false })
      .eq('endpoint', endpoint);

    if (error) {
      throw error;
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer | null): string {
    if (!buffer) return '';
    
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return window.btoa(binary);
  }

  // Test notification
  async sendTestNotification(): Promise<void> {
    if (Notification.permission !== 'granted') {
      throw new Error('Notification permission not granted');
    }

    const notification = new Notification('Test Notification', {
      body: 'This is a test notification from Field Reservations',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: 'test',
      data: { test: true }
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Auto close after 5 seconds
    setTimeout(() => {
      notification.close();
    }, 5000);
  }
}

// Server-side push notification sending (for API routes)
export class ServerPushNotificationService {
  private vapidPrivateKey: string;
  private vapidPublicKey: string;
  private vapidEmail: string;

  constructor() {
    this.vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
    this.vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
    this.vapidEmail = process.env.VAPID_EMAIL || '';
  }

  async sendNotificationToUser(
    userId: string,
    payload: PushNotificationPayload
  ): Promise<boolean> {
    try {
      // Get user's push subscriptions
      const { data: subscriptions, error } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) throw error;

      if (!subscriptions || subscriptions.length === 0) {
        console.log('No active push subscriptions found for user:', userId);
        return false;
      }

      // Send notification to all user's devices
      const results = await Promise.allSettled(
        subscriptions.map(subscription => 
          this.sendToSubscription(subscription, payload)
        )
      );

      // Check if at least one notification was sent successfully
      const successCount = results.filter(result => result.status === 'fulfilled').length;
      return successCount > 0;
    } catch (error) {
      console.error('Failed to send push notification:', error);
      return false;
    }
  }

  async sendNotificationToUsers(
    userIds: string[],
    payload: PushNotificationPayload
  ): Promise<{ success: number; failed: number }> {
    const results = await Promise.allSettled(
      userIds.map(userId => this.sendNotificationToUser(userId, payload))
    );

    const success = results.filter(result => 
      result.status === 'fulfilled' && result.value === true
    ).length;
    
    const failed = results.length - success;

    return { success, failed };
  }

  private async sendToSubscription(
    subscription: any,
    payload: PushNotificationPayload
  ): Promise<void> {
    // In a real implementation, you would use a library like 'web-push'
    // to send the actual push notification to the browser
    // This is a simplified version for demonstration
    
    const webpush = require('web-push');
    
    webpush.setVapidDetails(
      `mailto:${this.vapidEmail}`,
      this.vapidPublicKey,
      this.vapidPrivateKey
    );

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth
      }
    };

    try {
      await webpush.sendNotification(
        pushSubscription,
        JSON.stringify(payload),
        {
          urgency: payload.priority >= 5 ? 'high' : 'normal',
          TTL: 24 * 60 * 60 // 24 hours
        }
      );

      // Update last used timestamp
      await supabase
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', subscription.id);

    } catch (error: any) {
      console.error('Failed to send push notification:', error);
      
      // Handle expired subscriptions
      if (error.statusCode === 410 || error.statusCode === 404) {
        await supabase
          .from('push_subscriptions')
          .update({ is_active: false })
          .eq('id', subscription.id);
      }
      
      throw error;
    }
  }
}

// Utility function to create notification payload
export function createNotificationPayload(
  title: string,
  body: string,
  options: Partial<PushNotificationPayload> = {}
): PushNotificationPayload {
  return {
    title,
    body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: options.tag || 'default',
    category: options.category || 'system',
    priority: options.priority || 3,
    data: options.data || {},
    ...options
  };
}

// Hook for React components

export function usePushNotifications() {
  const pushService = PushNotificationService.getInstance();

  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    const status = await pushService.getSubscriptionStatus();
    setPermission(status.permission);
    setIsSubscribed(status.isSubscribed);
  };

  const requestPermission = async () => {
    const newPermission = await pushService.requestPermission();
    setPermission(newPermission);
    
    if (newPermission === 'granted') {
      await checkStatus();
    }
  };

  const subscribe = async () => {
    const success = await pushService.subscribeToPushNotifications();
    if (success) {
      setIsSubscribed(true);
    }
    return success;
  };

  const unsubscribe = async () => {
    const success = await pushService.unsubscribeFromPushNotifications();
    if (success) {
      setIsSubscribed(false);
    }
    return success;
  };

  const sendTestNotification = () => {
    return pushService.sendTestNotification();
  };

  return {
    permission,
    isSubscribed,
    requestPermission,
    subscribe,
    unsubscribe,
    sendTestNotification,
    checkStatus
  };
}

export default PushNotificationService;