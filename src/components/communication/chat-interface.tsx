'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Avatar } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { 
  Send, 
  Paperclip, 
  Smile, 
  MoreVertical, 
  Reply, 
  Pin, 
  Edit, 
  Trash2,
  Check,
  CheckCheck,
  Users,
  Settings,
  Hash,
  MessageCircle
} from 'lucide-react';
import { Message, Channel, MessageReaction, TypingIndicator } from '../../types/communication';
import { useAuth } from '../../contexts/auth-context';
import { supabase } from '../../lib/supabase/client';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

interface ChatInterfaceProps {
  channelId?: string;
  recipientId?: string;
  className?: string;
}

export function ChatInterface({ channelId, recipientId, className }: ChatInterfaceProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingIndicator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Load channel data and messages
  useEffect(() => {
    if (channelId) {
      loadChannel();
      loadMessages();
    } else if (recipientId) {
      loadDirectMessages();
    }
  }, [channelId, recipientId]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user || (!channelId && !recipientId)) return;

    const messageChannel = supabase
      .channel(`messages-${channelId || recipientId}`)
      .on('postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'messages',
          filter: channelId ? `channel_id=eq.${channelId}` : `recipient_id=eq.${user.id}`
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setMessages(prev => [...prev, newMessage]);
          scrollToBottom();
        }
      )
      .on('postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'messages',
          filter: channelId ? `channel_id=eq.${channelId}` : `recipient_id=eq.${user.id}`
        },
        (payload) => {
          setMessages(prev => prev.map(msg => 
            msg.id === payload.new.id ? { ...msg, ...payload.new } : msg
          ));
        }
      )
      .on('postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'typing_indicators',
          filter: channelId ? `channel_id=eq.${channelId}` : `recipient_id=eq.${user.id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setTypingUsers(prev => {
              const filtered = prev.filter(t => t.user_id !== payload.new.user_id);
              if (payload.new.user_id !== user.id) {
                return [...filtered, payload.new as TypingIndicator];
              }
              return filtered;
            });
          } else if (payload.eventType === 'DELETE') {
            setTypingUsers(prev => prev.filter(t => t.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      messageChannel.unsubscribe();
    };
  }, [user, channelId, recipientId]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChannel = async () => {
    try {
      const { data, error } = await supabase
        .from('channels')
        .select(`
          *,
          members:channel_members(
            id,
            role,
            user:user_profiles(id, full_name, avatar_url, email)
          )
        `)
        .eq('id', channelId)
        .single();

      if (error) throw error;
      setChannel(data);
    } catch (error) {
      console.error('Error loading channel:', error);
      toast.error('Failed to load channel');
    }
  };

  const loadMessages = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:user_profiles(id, full_name, avatar_url, email),
          attachments:message_attachments(*),
          reactions:message_reactions(
            id,
            emoji,
            user:user_profiles(id, full_name, avatar_url)
          ),
          status:message_status(status, timestamp)
        `)
        .eq('channel_id', channelId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDirectMessages = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:user_profiles(id, full_name, avatar_url, email),
          recipient:user_profiles(id, full_name, avatar_url, email),
          attachments:message_attachments(*),
          reactions:message_reactions(
            id,
            emoji,
            user:user_profiles(id, full_name, avatar_url)
          )
        `)
        .or(`and(sender_id.eq.${user?.id},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${user?.id})`)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading direct messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || isSending) return;

    try {
      setIsSending(true);
      
      const messageData = {
        content: newMessage.trim(),
        sender_id: user.id,
        league_id: user.league_id,
        channel_id: channelId || null,
        recipient_id: recipientId || null,
        parent_id: replyingTo?.id || null,
        type: replyingTo ? 'thread' : channelId ? 'channel' : 'direct'
      };

      const { error } = await supabase
        .from('messages')
        .insert(messageData);

      if (error) throw error;

      setNewMessage('');
      setReplyingTo(null);
      stopTyping();
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
      startTyping();
    }

    // Reset typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 3000);
  };

  const startTyping = async () => {
    try {
      await supabase
        .from('typing_indicators')
        .insert({
          user_id: user?.id,
          channel_id: channelId || null,
          recipient_id: recipientId || null,
          expires_at: new Date(Date.now() + 30000).toISOString()
        });
    } catch (error) {
      console.error('Error starting typing indicator:', error);
    }
  };

  const stopTyping = async () => {
    setIsTyping(false);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    try {
      await supabase
        .from('typing_indicators')
        .delete()
        .eq('user_id', user?.id)
        .eq('channel_id', channelId || null)
        .eq('recipient_id', recipientId || null);
    } catch (error) {
      console.error('Error stopping typing indicator:', error);
    }
  };

  const handleMessageEdit = async (messageId: string, newContent: string) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({
          content: newContent,
          is_edited: true,
          edited_at: new Date().toISOString()
        })
        .eq('id', messageId);

      if (error) throw error;

      setEditingMessage(null);
      setEditContent('');
      toast.success('Message updated');
    } catch (error) {
      console.error('Error editing message:', error);
      toast.error('Failed to edit message');
    }
  };

  const handleMessageDelete = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id
        })
        .eq('id', messageId);

      if (error) throw error;
      toast.success('Message deleted');
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    }
  };

  const addReaction = async (messageId: string, emoji: string) => {
    try {
      const { error } = await supabase
        .from('message_reactions')
        .insert({
          message_id: messageId,
          user_id: user?.id,
          emoji
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error adding reaction:', error);
      toast.error('Failed to add reaction');
    }
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    }
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getMessageStatus = (message: Message) => {
    if (message.sender_id !== user?.id) return null;
    
    const status = message.status?.[0]?.status;
    switch (status) {
      case 'sent':
        return <Check className="h-3 w-3 text-gray-400" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-gray-400" />;
      case 'read':
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      default:
        return <Check className="h-3 w-3 text-gray-300" />;
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {channel ? (
              <>
                <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Hash className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold">{channel.name}</h3>
                  <p className="text-sm text-gray-500">
                    {channel.members?.length} members
                  </p>
                </div>
              </>
            ) : (
              <>
                <Avatar className="h-10 w-10" />
                <div>
                  <h3 className="font-semibold">Direct Message</h3>
                  <p className="text-sm text-gray-500">Online</p>
                </div>
              </>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm">
              <Users className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message, index) => {
            const showAvatar = index === 0 || 
              messages[index - 1].sender_id !== message.sender_id ||
              new Date(message.created_at).getTime() - new Date(messages[index - 1].created_at).getTime() > 300000; // 5 minutes

            return (
              <div
                key={message.id}
                className={`flex items-start space-x-3 group ${
                  message.sender_id === user?.id ? 'flex-row-reverse space-x-reverse' : ''
                }`}
              >
                {showAvatar ? (
                  <Avatar 
                    src={message.sender?.avatar_url} 
                    alt={message.sender?.full_name}
                    className="h-8 w-8"
                  />
                ) : (
                  <div className="h-8 w-8" />
                )}
                
                <div className={`flex-1 max-w-xs lg:max-w-md ${
                  message.sender_id === user?.id ? 'items-end' : 'items-start'
                } flex flex-col`}>
                  {showAvatar && (
                    <div className={`flex items-center space-x-2 mb-1 ${
                      message.sender_id === user?.id ? 'flex-row-reverse space-x-reverse' : ''
                    }`}>
                      <span className="text-sm font-medium">
                        {message.sender?.full_name}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatMessageTime(message.created_at)}
                      </span>
                    </div>
                  )}
                  
                  <Card className={`${
                    message.sender_id === user?.id 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100'
                  }`}>
                    <CardContent className="p-3">
                      {replyingTo?.id === message.parent_id && (
                        <div className="mb-2 p-2 bg-black/10 rounded text-sm">
                          <p className="text-xs opacity-75">Replying to {replyingTo.sender?.full_name}</p>
                          <p className="truncate">{replyingTo.content}</p>
                        </div>
                      )}
                      
                      {editingMessage === message.id ? (
                        <div className="space-y-2">
                          <Input
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                handleMessageEdit(message.id, editContent);
                              } else if (e.key === 'Escape') {
                                setEditingMessage(null);
                                setEditContent('');
                              }
                            }}
                            className="text-sm"
                          />
                          <div className="flex justify-end space-x-2">
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => {
                                setEditingMessage(null);
                                setEditContent('');
                              }}
                            >
                              Cancel
                            </Button>
                            <Button 
                              size="sm"
                              onClick={() => handleMessageEdit(message.id, editContent)}
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          {message.is_edited && (
                            <span className="text-xs opacity-75 ml-2">(edited)</span>
                          )}
                        </>
                      )}
                      
                      {/* Message attachments */}
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {message.attachments.map((attachment) => (
                            <div key={attachment.id} className="flex items-center space-x-2">
                              <Paperclip className="h-4 w-4" />
                              <a 
                                href={attachment.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm underline hover:no-underline"
                              >
                                {attachment.original_filename}
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Message reactions */}
                      {message.reactions && message.reactions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {message.reactions.map((reaction) => (
                            <Badge 
                              key={reaction.id}
                              variant="secondary"
                              className="text-xs cursor-pointer hover:bg-gray-200"
                              onClick={() => addReaction(message.id, reaction.emoji)}
                            >
                              {reaction.emoji} {reaction.user?.full_name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  
                  {/* Message actions */}
                  <div className={`opacity-0 group-hover:opacity-100 transition-opacity mt-1 flex items-center space-x-1 ${
                    message.sender_id === user?.id ? 'flex-row-reverse' : ''
                  }`}>
                    <div className="flex items-center space-x-1">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => setReplyingTo(message)}
                      >
                        <Reply className="h-3 w-3" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => addReaction(message.id, '👍')}
                      >
                        <Smile className="h-3 w-3" />
                      </Button>
                      {message.sender_id === user?.id && (
                        <>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => {
                              setEditingMessage(message.id);
                              setEditContent(message.content || '');
                            }}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleMessageDelete(message.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      {getMessageStatus(message)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          
          {/* Typing indicators */}
          {typingUsers.length > 0 && (
            <div className="flex items-center space-x-3">
              <Avatar className="h-8 w-8" />
              <div className="bg-gray-100 rounded-lg p-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Reply indicator */}
      {replyingTo && (
        <div className="px-4 py-2 bg-gray-50 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Reply className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">
                Replying to {replyingTo.sender?.full_name}
              </span>
              <span className="text-sm text-gray-500 truncate max-w-xs">
                {replyingTo.content}
              </span>
            </div>
            <Button 
              size="sm" 
              variant="ghost"
              onClick={() => setReplyingTo(null)}
            >
              ×
            </Button>
          </div>
        </div>
      )}

      {/* Message input */}
      <div className="p-4 border-t bg-white">
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm">
            <Paperclip className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <Input
              ref={inputRef}
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                handleTyping();
              }}
              onKeyPress={handleKeyPress}
              placeholder={`Message ${channel ? `#${channel.name}` : 'direct'}`}
              disabled={isSending}
            />
          </div>
          <Button variant="ghost" size="sm">
            <Smile className="h-4 w-4" />
          </Button>
          <Button 
            onClick={sendMessage}
            disabled={!newMessage.trim() || isSending}
            size="sm"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}