'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { 
  MessageCircle, 
  Hash, 
  Megaphone, 
  Bell,
  Users,
  Settings,
  Send,
  Plus,
  Search
} from 'lucide-react';
import { ChannelList } from './channel-list';
import { ChatInterface } from './chat-interface';
import { DirectMessages } from './direct-messages';
import { AnnouncementSystem } from './announcement-system';
import { NotificationCenter } from './notification-center';
import { useAuth } from '../../contexts/auth-context';
import { supabase } from '../../lib/supabase/client';
import { UnreadCounts } from '../../types/communication';

interface CommunicationHubProps {
  className?: string;
}

export function CommunicationHub({ className }: CommunicationHubProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('channels');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({
    total: 0,
    channels: {},
    direct_messages: 0,
    mentions: 0,
    announcements: 0
  });

  useEffect(() => {
    if (user) {
      loadUnreadCounts();
      setupRealtimeSubscriptions();
    }
  }, [user]);

  const loadUnreadCounts = async () => {
    try {
      // This would be implemented as a comprehensive RPC function
      // For now, we'll use a simplified version
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('category')
        .eq('user_id', user?.id)
        .eq('is_read', false);

      if (error) throw error;

      const counts = {
        total: notifications?.length || 0,
        channels: {},
        direct_messages: notifications?.filter(n => n.category === 'message').length || 0,
        mentions: 0,
        announcements: notifications?.filter(n => n.category === 'announcement').length || 0
      };

      setUnreadCounts(counts);
    } catch (error) {
      console.error('Error loading unread counts:', error);
    }
  };

  const setupRealtimeSubscriptions = () => {
    if (!user) return;

    const subscription = supabase
      .channel('communication-hub')
      .on('postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'messages',
          filter: `recipient_id=eq.${user.id}`
        },
        () => {
          loadUnreadCounts();
        }
      )
      .on('postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          loadUnreadCounts();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  const handleChannelSelect = (channelId: string) => {
    setSelectedChannelId(channelId);
    setActiveTab('chat');
  };

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Communication Hub</h1>
              <p className="text-sm text-gray-600">
                Stay connected with your league
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <NotificationCenter />
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1" />
              Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Sidebar Navigation */}
        <div className="w-80 border-r bg-gray-50 flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3 m-4">
              <TabsTrigger value="channels" className="relative">
                <Hash className="h-4 w-4 mr-1" />
                Channels
                {Object.keys(unreadCounts.channels).length > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs p-0"
                  >
                    {Object.values(unreadCounts.channels).reduce((a, b) => a + b, 0)}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="direct" className="relative">
                <MessageCircle className="h-4 w-4 mr-1" />
                Direct
                {unreadCounts.direct_messages > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs p-0"
                  >
                    {unreadCounts.direct_messages}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="announcements" className="relative">
                <Megaphone className="h-4 w-4 mr-1" />
                News
                {unreadCounts.announcements > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs p-0"
                  >
                    {unreadCounts.announcements}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="channels" className="flex-1 mt-0">
              <ChannelList
                selectedChannelId={selectedChannelId}
                onChannelSelect={handleChannelSelect}
                className="h-full"
              />
            </TabsContent>

            <TabsContent value="direct" className="flex-1 mt-0">
              <DirectMessagesList 
                onConversationSelect={(userId) => {
                  setSelectedChannelId(userId);
                  setActiveTab('chat');
                }}
              />
            </TabsContent>

            <TabsContent value="announcements" className="flex-1 mt-0 p-4">
              <AnnouncementsList />
            </TabsContent>
          </Tabs>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1">
          {activeTab === 'chat' && selectedChannelId ? (
            <ChatInterface 
              channelId={selectedChannelId.startsWith('user-') ? undefined : selectedChannelId}
              recipientId={selectedChannelId.startsWith('user-') ? selectedChannelId.replace('user-', '') : undefined}
              className="h-full"
            />
          ) : activeTab === 'announcements' ? (
            <div className="h-full p-6">
              <AnnouncementSystem className="h-full" />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-50">
              <div className="text-center max-w-md">
                <div className="h-16 w-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Welcome to Communication Hub
                </h3>
                <p className="text-gray-500 mb-6">
                  Select a channel or start a direct message to begin chatting with your team.
                </p>
                <div className="space-y-2">
                  <Button 
                    onClick={() => setActiveTab('channels')}
                    className="w-full"
                  >
                    <Hash className="h-4 w-4 mr-2" />
                    Browse Channels
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setActiveTab('direct')}
                    className="w-full"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Start Direct Message
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Simplified components for the sidebar
function DirectMessagesList({ onConversationSelect }: { onConversationSelect: (userId: string) => void }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setIsLoading(true);
      
      // Simplified conversation loading
      const { data: users, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, avatar_url, role')
        .eq('league_id', user?.league_id)
        .neq('id', user?.id)
        .limit(10);

      if (error) throw error;
      setConversations(users || []);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-gray-900">Recent Conversations</h3>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      
      {conversations.map((user) => (
        <Card 
          key={user.id}
          className="cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => onConversationSelect(`user-${user.id}`)}
        >
          <CardContent className="p-3">
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 bg-gray-300 rounded-full flex items-center justify-center">
                {user.full_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.full_name}</p>
                <p className="text-xs text-gray-500">{user.role}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AnnouncementsList() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:user_profiles(full_name)
        `)
        .eq('league_id', user?.league_id)
        .eq('is_announcement', true)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (error) {
      console.error('Error loading announcements:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-200 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-gray-900">Recent Announcements</h3>
        <Badge variant="secondary">{announcements.length}</Badge>
      </div>
      
      {announcements.map((announcement) => (
        <Card key={announcement.id} className="hover:bg-gray-50 transition-colors">
          <CardContent className="p-3">
            <div className="flex items-start space-x-2">
              <Megaphone className="h-4 w-4 text-orange-600 mt-1 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {announcement.subject || 'Announcement'}
                </p>
                <p className="text-xs text-gray-500 line-clamp-2">
                  {announcement.content}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  By {announcement.sender?.full_name}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      
      {announcements.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No recent announcements</p>
        </div>
      )}
    </div>
  );
}