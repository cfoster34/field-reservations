// Communication System Types

export type MessageType = 'chat' | 'announcement' | 'system' | 'direct' | 'channel' | 'thread' | 'file';
export type NotificationType = 'email' | 'sms' | 'push';
export type NotificationCategory = 'reservation' | 'message' | 'announcement' | 'system' | 'payment' | 'reminder';
export type ChannelType = 'public' | 'private' | 'team' | 'direct';
export type MessageStatus = 'sent' | 'delivered' | 'read';
export type AttachmentType = 'image' | 'document' | 'video' | 'audio' | 'other';
export type ChannelMemberRole = 'admin' | 'moderator' | 'member';

export interface Channel {
  id: string;
  league_id: string;
  name: string;
  description?: string;
  type: ChannelType;
  team_id?: string;
  created_by: string;
  avatar_url?: string;
  is_archived: boolean;
  archived_at?: string;
  archived_by?: string;
  settings: {
    allow_members_invite: boolean;
    allow_file_sharing: boolean;
    retention_days: number;
    notifications_enabled: boolean;
  };
  created_at: string;
  updated_at: string;
  
  // Relations
  members?: ChannelMember[];
  unread_count?: number;
  last_message?: Message;
}

export interface ChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: ChannelMemberRole;
  joined_at: string;
  last_read_at: string;
  notification_settings: {
    mute: boolean;
    push: boolean;
    email: boolean;
  };
  is_banned: boolean;
  banned_at?: string;
  banned_by?: string;
  
  // Relations
  user?: {
    id: string;
    full_name: string;
    avatar_url?: string;
    email: string;
  };
}

export interface Message {
  id: string;
  league_id: string;
  channel_id?: string;
  sender_id: string;
  recipient_id?: string;
  parent_id?: string;
  thread_id?: string;
  type: MessageType;
  subject?: string;
  content?: string;
  encrypted_content?: string;
  content_type: string;
  metadata: Record<string, any>;
  is_announcement: boolean;
  is_pinned: boolean;
  pinned_at?: string;
  pinned_by?: string;
  is_edited: boolean;
  edited_at?: string;
  is_deleted: boolean;
  deleted_at?: string;
  deleted_by?: string;
  created_at: string;
  updated_at: string;
  
  // Relations
  sender?: {
    id: string;
    full_name: string;
    avatar_url?: string;
    email: string;
  };
  recipient?: {
    id: string;
    full_name: string;
    avatar_url?: string;
    email: string;
  };
  channel?: Channel;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  mentions?: MessageMention[];
  status?: MessageStatusRecord[];
  replies?: Message[];
  thread_count?: number;
}

export interface MessageStatusRecord {
  id: string;
  message_id: string;
  user_id: string;
  status: MessageStatus;
  timestamp: string;
  
  // Relations
  user?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  filename: string;
  original_filename: string;
  file_url: string;
  file_size?: number;
  mime_type?: string;
  type: AttachmentType;
  thumbnail_url?: string;
  uploaded_at: string;
}

export interface TypingIndicator {
  id: string;
  channel_id?: string;
  user_id: string;
  recipient_id?: string;
  started_at: string;
  expires_at: string;
  
  // Relations
  user?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
}

export interface Notification {
  id: string;
  user_id: string;
  league_id?: string;
  category: NotificationCategory;
  type: NotificationType;
  title: string;
  content: string;
  data: Record<string, any>;
  is_sent: boolean;
  sent_at?: string;
  send_attempts: number;
  max_attempts: number;
  is_read: boolean;
  read_at?: string;
  scheduled_for: string;
  expires_at?: string;
  priority: number;
  created_at: string;
}

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string;
}

export interface EmailTemplate {
  id: string;
  league_id?: string;
  name: string;
  subject: string;
  html_content: string;
  text_content?: string;
  variables: string[];
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface SmsTemplate {
  id: string;
  league_id?: string;
  name: string;
  content: string;
  variables: string[];
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationSchedule {
  id: string;
  league_id: string;
  name: string;
  template_type: 'email' | 'sms' | 'push';
  template_id?: string;
  cron_expression: string;
  target_audience: Record<string, any>;
  variables: Record<string, any>;
  is_active: boolean;
  last_run_at?: string;
  next_run_at?: string;
  created_at: string;
  updated_at: string;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  
  // Relations
  user?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
}

export interface MessageMention {
  id: string;
  message_id: string;
  user_id: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
  
  // Relations
  user?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
  message?: Message;
}

export interface OfflineMessageQueue {
  id: string;
  user_id: string;
  message_data: Record<string, any>;
  sync_attempts: number;
  max_attempts: number;
  created_at: string;
  synced_at?: string;
}

export interface UserEncryptionKey {
  id: string;
  user_id: string;
  public_key: string;
  key_type: 'RSA' | 'ECDSA';
  created_at: string;
  expires_at?: string;
  is_active: boolean;
}

// API Request/Response Types
export interface CreateChannelRequest {
  name: string;
  description?: string;
  type: ChannelType;
  team_id?: string;
  settings?: Partial<Channel['settings']>;
}

export interface UpdateChannelRequest {
  name?: string;
  description?: string;
  settings?: Partial<Channel['settings']>;
}

export interface SendMessageRequest {
  channel_id?: string;
  recipient_id?: string;
  parent_id?: string;
  content?: string;
  type?: MessageType;
  is_announcement?: boolean;
  metadata?: Record<string, any>;
}

export interface CreateNotificationRequest {
  user_id: string;
  category: NotificationCategory;
  type: NotificationType;
  title: string;
  content: string;
  data?: Record<string, any>;
  scheduled_for?: string;
  priority?: number;
}

export interface MessageFilter {
  channel_id?: string;
  sender_id?: string;
  recipient_id?: string;
  type?: MessageType[];
  search?: string;
  is_announcement?: boolean;
  date_from?: string;
  date_to?: string;
  has_attachments?: boolean;
  limit?: number;
  offset?: number;
}

export interface NotificationFilter {
  category?: NotificationCategory[];
  type?: NotificationType[];
  is_read?: boolean;
  priority_min?: number;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

// Real-time event types
export interface RealtimeMessageEvent {
  type: 'message_new' | 'message_update' | 'message_delete';
  message: Message;
  channel_id?: string;
}

export interface RealtimeTypingEvent {
  type: 'typing_start' | 'typing_stop';
  user: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
  channel_id?: string;
  recipient_id?: string;
}

export interface RealtimeNotificationEvent {
  type: 'notification_new' | 'notification_read';
  notification: Notification;
}

export interface RealtimeChannelEvent {
  type: 'channel_update' | 'member_join' | 'member_leave' | 'member_update';
  channel: Channel;
  member?: ChannelMember;
}

// Utility types
export interface MessageThread {
  root_message: Message;
  replies: Message[];
  participants: Array<{
    id: string;
    full_name: string;
    avatar_url?: string;
  }>;
}

export interface UnreadCounts {
  total: number;
  channels: Record<string, number>;
  direct_messages: number;
  mentions: number;
  announcements: number;
}

export interface UserPresence {
  user_id: string;
  is_online: boolean;
  last_seen: string;
  status?: 'available' | 'busy' | 'away' | 'invisible';
}

export interface ChatSettings {
  enable_notifications: boolean;
  enable_email_notifications: boolean;
  enable_push_notifications: boolean;
  enable_sms_notifications: boolean;
  notification_frequency: 'immediate' | 'digest' | 'disabled';
  digest_frequency: 'hourly' | 'daily' | 'weekly';
  enable_typing_indicators: boolean;
  enable_read_receipts: boolean;
  enable_message_reactions: boolean;
  theme: 'light' | 'dark' | 'auto';
  font_size: 'small' | 'medium' | 'large';
}

// Error types
export class CommunicationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'CommunicationError';
  }
}

export class MessageDeliveryError extends CommunicationError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'MESSAGE_DELIVERY_ERROR', details);
    this.name = 'MessageDeliveryError';
  }
}

export class NotificationError extends CommunicationError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'NOTIFICATION_ERROR', details);
    this.name = 'NotificationError';
  }
}

export class ChannelPermissionError extends CommunicationError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'CHANNEL_PERMISSION_ERROR', details);
    this.name = 'ChannelPermissionError';
  }
}