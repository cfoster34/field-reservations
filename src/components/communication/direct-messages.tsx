'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Avatar } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { 
  MessageCircle, 
  Search, 
  Plus, 
  Users, 
  Online,
  Clock,
  Check,
  CheckCheck
} from 'lucide-react';
import { Message, UserPresence } from '../../types/communication';
import { useAuth } from '../../contexts/auth-context';
import { supabase } from '../../lib/supabase/client';
import { ChatInterface } from './chat-interface';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

interface DirectMessagesProps {
  className?: string;
}

interface Conversation {
  id: string;
  participant: {
    id: string;
    full_name: string;
    avatar_url?: string;
    email: string;
    role: string;
  };
  last_message?: Message;
  unread_count: number;
  updated_at: string;
}

export function DirectMessages({ className }: DirectMessagesProps) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isNewMessageDialogOpen, setIsNewMessageDialogOpen] = useState(false);
  const [userPresence, setUserPresence] = useState<Record<string, UserPresence>>({});

  useEffect(() => {
    if (user) {
      loadConversations();
      subscribeToPresence();
    }
  }, [user]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user) return;

    const messageChannel = supabase
      .channel('direct-messages')
      .on('postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'messages',
          filter: `recipient_id=eq.${user.id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            loadConversations(); // Reload to update conversation list
          }
        }
      )
      .on('postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'messages',
          filter: `sender_id=eq.${user.id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            loadConversations(); // Reload to update conversation list
          }
        }
      )
      .subscribe();

    return () => {
      messageChannel.unsubscribe();
    };
  }, [user]);

  const loadConversations = async () => {
    try {
      setIsLoading(true);
      
      // Get all direct messages involving the current user
      const { data: messages, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:user_profiles!messages_sender_id_fkey(id, full_name, avatar_url, email, role),
          recipient:user_profiles!messages_recipient_id_fkey(id, full_name, avatar_url, email, role)
        `)
        .or(`sender_id.eq.${user?.id},recipient_id.eq.${user?.id}`)
        .is('channel_id', null)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group messages by conversation (other participant)
      const conversationMap = new Map<string, Conversation>();
      
      messages?.forEach(message => {
        const isCurrentUserSender = message.sender_id === user?.id;
        const otherParticipant = isCurrentUserSender ? message.recipient : message.sender;
        
        if (!otherParticipant) return;
        
        const conversationKey = otherParticipant.id;
        
        if (!conversationMap.has(conversationKey)) {
          conversationMap.set(conversationKey, {
            id: conversationKey,
            participant: otherParticipant,
            last_message: message,
            unread_count: 0,
            updated_at: message.created_at
          });
        } else {
          const existing = conversationMap.get(conversationKey)!;
          if (new Date(message.created_at) > new Date(existing.updated_at)) {
            existing.last_message = message;
            existing.updated_at = message.created_at;
          }
        }
        
        // Count unread messages (messages not sent by current user and not read)
        if (!isCurrentUserSender && !message.is_read) {
          const existing = conversationMap.get(conversationKey)!;
          existing.unread_count++;
        }
      });
      
      const conversationList = Array.from(conversationMap.values())
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      
      setConversations(conversationList);
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast.error('Failed to load conversations');
    } finally {
      setIsLoading(false);
    }
  };

  const subscribeToPresence = async () => {
    // In a real implementation, this would subscribe to user presence updates
    // For now, we'll simulate online status
    const { data: users, error } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .eq('league_id', user?.league_id)
      .neq('id', user?.id);

    if (error) return;

    const presenceData: Record<string, UserPresence> = {};
    users?.forEach(u => {
      presenceData[u.id] = {
        user_id: u.id,
        is_online: Math.random() > 0.5, // Simulate random online status
        last_seen: new Date().toISOString(),
        status: 'available'
      };
    });

    setUserPresence(presenceData);
  };

  const filteredConversations = useMemo(() => {
    return conversations.filter(conversation =>
      conversation.participant.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conversation.participant.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [conversations, searchQuery]);

  const selectedParticipant = useMemo(() => {
    return conversations.find(c => c.id === selectedConversation)?.participant;
  }, [conversations, selectedConversation]);

  const formatLastMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-96 ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading conversations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-full ${className}`}>
      {/* Conversations List */}
      <div className="w-1/3 border-r bg-white flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Direct Messages</h2>
            <Dialog open={isNewMessageDialogOpen} onOpenChange={setIsNewMessageDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  New
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Start New Conversation</DialogTitle>
                </DialogHeader>
                <NewConversationForm 
                  onSuccess={(userId) => {
                    setSelectedConversation(userId);
                    setIsNewMessageDialogOpen(false);
                    loadConversations();
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Conversations */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filteredConversations.map((conversation) => (
              <Card
                key={conversation.id}
                className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                  selectedConversation === conversation.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                }`}
                onClick={() => setSelectedConversation(conversation.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center space-x-3">
                    {/* Avatar with online indicator */}
                    <div className="relative">
                      <Avatar 
                        src={conversation.participant.avatar_url} 
                        alt={conversation.participant.full_name}
                        className="h-12 w-12"
                      />
                      {userPresence[conversation.participant.id]?.is_online && (
                        <div className="absolute -bottom-1 -right-1 h-4 w-4 bg-green-500 border-2 border-white rounded-full"></div>
                      )}
                    </div>

                    {/* Conversation Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <h3 className="text-sm font-medium truncate">
                            {conversation.participant.full_name}
                          </h3>
                          <Badge variant="secondary" className="text-xs">
                            {conversation.participant.role}
                          </Badge>
                        </div>
                        <div className="flex items-center space-x-1">
                          {conversation.unread_count > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {conversation.unread_count}
                            </Badge>
                          )}
                          {conversation.last_message && (
                            <span className="text-xs text-gray-400">
                              {formatLastMessageTime(conversation.last_message.created_at)}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {conversation.last_message && (
                        <div className="flex items-center mt-1">
                          <div className="flex items-center space-x-1 flex-1 min-w-0">
                            {conversation.last_message.sender_id === user?.id && (
                              <div className="flex-shrink-0">
                                <Check className="h-3 w-3 text-gray-400" />
                              </div>
                            )}
                            <p className="text-xs text-gray-500 truncate">
                              {conversation.last_message.content}
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {/* Online status */}
                      {userPresence[conversation.participant.id]?.is_online ? (
                        <div className="flex items-center space-x-1 mt-1">
                          <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                          <span className="text-xs text-green-600">Online</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1 mt-1">
                          <Clock className="h-3 w-3 text-gray-400" />
                          <span className="text-xs text-gray-400">
                            Last seen {formatDistanceToNow(new Date(userPresence[conversation.participant.id]?.last_seen || new Date()))} ago
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredConversations.length === 0 && !isLoading && (
              <div className="text-center py-8 text-gray-500">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No conversations found</p>
                {searchQuery ? (
                  <p className="text-sm mt-2">Try adjusting your search query</p>
                ) : (
                  <p className="text-sm mt-2">Start a conversation to get started</p>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Interface */}
      <div className="flex-1">
        {selectedConversation ? (
          <ChatInterface 
            recipientId={selectedConversation}
            className="h-full"
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-50">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Select a conversation
              </h3>
              <p className="text-gray-500">
                Choose a conversation from the list to start messaging
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface NewConversationFormProps {
  onSuccess: (userId: string) => void;
}

function NewConversationForm({ onSuccess }: NewConversationFormProps) {
  const { user } = useAuth();
  const [users, setUsers] = useState<Array<{
    id: string;
    full_name: string;
    avatar_url?: string;
    email: string;
    role: string;
  }>>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, avatar_url, email, role')
        .eq('league_id', user?.league_id)
        .neq('id', user?.id)
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleUserSelect = (userId: string) => {
    setSelectedUser(userId);
    onSuccess(userId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* User List */}
      <ScrollArea className="h-64">
        <div className="space-y-2">
          {filteredUsers.map((u) => (
            <Card
              key={u.id}
              className="cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => handleUserSelect(u.id)}
            >
              <CardContent className="p-3">
                <div className="flex items-center space-x-3">
                  <Avatar 
                    src={u.avatar_url} 
                    alt={u.full_name}
                    className="h-10 w-10"
                  />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-medium">{u.full_name}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {u.role}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredUsers.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No users found</p>
              {searchQuery && (
                <p className="text-sm mt-2">Try adjusting your search query</p>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}