'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Avatar } from '../ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { Plus, Hash, Users, Lock, MessageCircle, Search, Settings } from 'lucide-react';
import { Channel, ChannelType, UnreadCounts } from '../../types/communication';
import { useAuth } from '../../contexts/auth-context';
import { supabase } from '../../lib/supabase/client';
import toast from 'react-hot-toast';

interface ChannelListProps {
  selectedChannelId?: string;
  onChannelSelect: (channelId: string) => void;
  className?: string;
}

export function ChannelList({ selectedChannelId, onChannelSelect, className }: ChannelListProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({
    total: 0,
    channels: {},
    direct_messages: 0,
    mentions: 0,
    announcements: 0
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'public' | 'private' | 'team' | 'direct'>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load channels
  useEffect(() => {
    if (user) {
      loadChannels();
      loadUnreadCounts();
    }
  }, [user]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user) return;

    const channelSubscription = supabase
      .channel('channels')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'channels' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setChannels(prev => [...prev, payload.new as Channel]);
          } else if (payload.eventType === 'UPDATE') {
            setChannels(prev => prev.map(c => 
              c.id === payload.new.id ? { ...c, ...payload.new } : c
            ));
          } else if (payload.eventType === 'DELETE') {
            setChannels(prev => prev.filter(c => c.id !== payload.old.id));
          }
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'channel_members' },
        (payload) => {
          // Reload channels when membership changes
          loadChannels();
        }
      )
      .subscribe();

    return () => {
      channelSubscription.unsubscribe();
    };
  }, [user]);

  const loadChannels = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('channels')
        .select(`
          *,
          members:channel_members!inner(
            id,
            role,
            joined_at,
            last_read_at,
            notification_settings,
            user:user_profiles(id, full_name, avatar_url, email)
          ),
          last_message:messages(
            id,
            content,
            created_at,
            sender:user_profiles(full_name)
          )
        `)
        .eq('channel_members.user_id', user?.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      setChannels(data || []);
    } catch (error) {
      console.error('Error loading channels:', error);
      toast.error('Failed to load channels');
    } finally {
      setIsLoading(false);
    }
  };

  const loadUnreadCounts = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_unread_message_count', { p_user_id: user?.id });

      if (error) throw error;

      // You would implement a more detailed unread count function
      // This is a simplified version
      setUnreadCounts(prev => ({
        ...prev,
        total: data || 0
      }));
    } catch (error) {
      console.error('Error loading unread counts:', error);
    }
  };

  const getChannelIcon = (channel: Channel) => {
    switch (channel.type) {
      case 'public':
        return <Hash className="h-4 w-4" />;
      case 'private':
        return <Lock className="h-4 w-4" />;
      case 'team':
        return <Users className="h-4 w-4" />;
      case 'direct':
        return <MessageCircle className="h-4 w-4" />;
      default:
        return <Hash className="h-4 w-4" />;
    }
  };

  const getChannelTypeColor = (type: ChannelType) => {
    switch (type) {
      case 'public':
        return 'bg-green-100 text-green-800';
      case 'private':
        return 'bg-red-100 text-red-800';
      case 'team':
        return 'bg-blue-100 text-blue-800';
      case 'direct':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredChannels = channels.filter(channel => {
    const matchesSearch = channel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         channel.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (activeTab === 'all') return matchesSearch;
    return matchesSearch && channel.type === activeTab;
  });

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
      <div className={`flex flex-col space-y-4 ${className}`}>
        <div className="animate-pulse space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Channels</h2>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Channel</DialogTitle>
              </DialogHeader>
              <CreateChannelForm 
                onSuccess={() => {
                  setIsCreateDialogOpen(false);
                  loadChannels();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Channel Type Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-5 mx-4 mt-2">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="public">Public</TabsTrigger>
          <TabsTrigger value="private">Private</TabsTrigger>
          <TabsTrigger value="team">Teams</TabsTrigger>
          <TabsTrigger value="direct">DMs</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="flex-1 mt-0">
          <ScrollArea className="h-full px-4">
            <div className="space-y-2 py-2">
              {filteredChannels.map((channel) => (
                <Card
                  key={channel.id}
                  className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                    selectedChannelId === channel.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                  }`}
                  onClick={() => onChannelSelect(channel.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center space-x-3">
                      {/* Channel Icon */}
                      <div className="flex-shrink-0">
                        {channel.avatar_url ? (
                          <Avatar src={channel.avatar_url} alt={channel.name} className="h-10 w-10" />
                        ) : (
                          <div className="h-10 w-10 bg-gray-200 rounded-full flex items-center justify-center">
                            {getChannelIcon(channel)}
                          </div>
                        )}
                      </div>

                      {/* Channel Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <h3 className="text-sm font-medium truncate">{channel.name}</h3>
                            <Badge 
                              variant="secondary" 
                              className={`text-xs ${getChannelTypeColor(channel.type)}`}
                            >
                              {channel.type}
                            </Badge>
                          </div>
                          {unreadCounts.channels[channel.id] > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {unreadCounts.channels[channel.id]}
                            </Badge>
                          )}
                        </div>
                        
                        {channel.last_message && (
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-gray-500 truncate">
                              {channel.last_message.sender?.full_name}: {channel.last_message.content}
                            </p>
                            <span className="text-xs text-gray-400">
                              {formatLastMessageTime(channel.last_message.created_at)}
                            </span>
                          </div>
                        )}
                        
                        {channel.description && (
                          <p className="text-xs text-gray-400 truncate mt-1">
                            {channel.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {filteredChannels.length === 0 && !isLoading && (
                <div className="text-center py-8 text-gray-500">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No channels found</p>
                  {searchQuery && (
                    <p className="text-sm mt-2">Try adjusting your search query</p>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface CreateChannelFormProps {
  onSuccess: () => void;
}

function CreateChannelForm({ onSuccess }: CreateChannelFormProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'public' as ChannelType,
    team_id: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name')
        .eq('league_id', user?.league_id);

      if (error) throw error;
      setTeams(data || []);
    } catch (error) {
      console.error('Error loading teams:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setIsSubmitting(true);

      const { error } = await supabase
        .from('channels')
        .insert({
          name: formData.name,
          description: formData.description || null,
          type: formData.type,
          team_id: formData.team_id || null,
          created_by: user.id,
          league_id: user.league_id
        });

      if (error) throw error;

      toast.success('Channel created successfully');
      onSuccess();
    } catch (error) {
      console.error('Error creating channel:', error);
      toast.error('Failed to create channel');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Channel Name</label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Enter channel name"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <Input
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Enter channel description"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Channel Type</label>
        <select
          value={formData.type}
          onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as ChannelType }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="public">Public</option>
          <option value="private">Private</option>
          <option value="team">Team</option>
        </select>
      </div>

      {formData.type === 'team' && (
        <div>
          <label className="block text-sm font-medium mb-1">Team</label>
          <select
            value={formData.team_id}
            onChange={(e) => setFormData(prev => ({ ...prev, team_id: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Select a team</option>
            {teams.map(team => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={() => onSuccess()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Channel'}
        </Button>
      </div>
    </form>
  );
}