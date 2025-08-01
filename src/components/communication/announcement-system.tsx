'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { 
  Megaphone, 
  Plus, 
  Send, 
  Users, 
  Calendar, 
  Pin,
  Eye,
  EyeOff,
  Edit,
  Trash2,
  Clock,
  Target,
  AlertCircle
} from 'lucide-react';
import { Message, NotificationCategory } from '../../types/communication';
import { useAuth } from '../../contexts/auth-context';
import { supabase } from '../../lib/supabase/client';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

interface AnnouncementSystemProps {
  className?: string;
}

export function AnnouncementSystem({ className }: AnnouncementSystemProps) {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'urgent' | 'general' | 'scheduled'>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  useEffect(() => {
    if (user) {
      loadAnnouncements();
    }
  }, [user]);

  // Set up real-time subscriptions for announcements
  useEffect(() => {
    if (!user) return;

    const announcementChannel = supabase
      .channel('announcements')
      .on('postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'messages',
          filter: `is_announcement=eq.true,league_id=eq.${user.league_id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setAnnouncements(prev => [payload.new as Message, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setAnnouncements(prev => prev.map(a => 
              a.id === payload.new.id ? { ...a, ...payload.new } : a
            ));
          } else if (payload.eventType === 'DELETE') {
            setAnnouncements(prev => prev.filter(a => a.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      announcementChannel.unsubscribe();
    };
  }, [user]);

  const loadAnnouncements = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:user_profiles(id, full_name, avatar_url, email, role),
          attachments:message_attachments(*),
          reactions:message_reactions(
            id,
            emoji,
            user:user_profiles(id, full_name, avatar_url)
          )
        `)
        .eq('league_id', user?.league_id)
        .eq('is_announcement', true)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (error) {
      console.error('Error loading announcements:', error);
      toast.error('Failed to load announcements');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinAnnouncement = async (announcementId: string, isPinned: boolean) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({
          is_pinned: !isPinned,
          pinned_at: !isPinned ? new Date().toISOString() : null,
          pinned_by: !isPinned ? user?.id : null
        })
        .eq('id', announcementId);

      if (error) throw error;
      
      toast.success(`Announcement ${!isPinned ? 'pinned' : 'unpinned'} successfully`);
    } catch (error) {
      console.error('Error pinning announcement:', error);
      toast.error('Failed to update announcement');
    }
  };

  const handleDeleteAnnouncement = async (announcementId: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;

    try {
      const { error } = await supabase
        .from('messages')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id
        })
        .eq('id', announcementId);

      if (error) throw error;
      
      toast.success('Announcement deleted successfully');
    } catch (error) {
      console.error('Error deleting announcement:', error);
      toast.error('Failed to delete announcement');
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 5) return 'bg-red-100 text-red-800 border-red-200';
    if (priority >= 3) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-blue-100 text-blue-800 border-blue-200';
  };

  const getPriorityLabel = (priority: number) => {
    if (priority >= 5) return 'Urgent';
    if (priority >= 3) return 'Important';
    return 'General';
  };

  const filteredAnnouncements = announcements.filter(announcement => {
    const priority = (announcement.metadata as any)?.priority || 0;
    
    switch (activeTab) {
      case 'urgent':
        return priority >= 5;
      case 'general':
        return priority < 3;
      case 'scheduled':
        return (announcement.metadata as any)?.scheduled_for;
      default:
        return true;
    }
  });

  const canManageAnnouncements = user?.role === 'admin' || user?.role === 'coach';

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-64 ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading announcements...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 bg-orange-100 rounded-full flex items-center justify-center">
            <Megaphone className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Announcements</h2>
            <p className="text-sm text-gray-600">League-wide announcements and updates</p>
          </div>
        </div>
        
        {canManageAnnouncements && (
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Announcement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Announcement</DialogTitle>
              </DialogHeader>
              <CreateAnnouncementForm 
                onSuccess={() => {
                  setIsCreateDialogOpen(false);
                  loadAnnouncements();
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="urgent" className="text-red-600">Urgent</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          <ScrollArea className="h-96">
            <div className="space-y-4">
              {/* Pinned announcements */}
              {filteredAnnouncements.filter(a => a.is_pinned).length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-700 flex items-center">
                    <Pin className="h-4 w-4 mr-2" />
                    Pinned Announcements
                  </h3>
                  {filteredAnnouncements
                    .filter(announcement => announcement.is_pinned)
                    .map(announcement => (
                      <AnnouncementCard
                        key={announcement.id}
                        announcement={announcement}
                        canManage={canManageAnnouncements}
                        onPin={() => handlePinAnnouncement(announcement.id, announcement.is_pinned)}
                        onDelete={() => handleDeleteAnnouncement(announcement.id)}
                      />
                    ))}
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-4">Recent Announcements</h3>
                  </div>
                </div>
              )}

              {/* Regular announcements */}
              {filteredAnnouncements
                .filter(announcement => !announcement.is_pinned)
                .map(announcement => (
                  <AnnouncementCard
                    key={announcement.id}
                    announcement={announcement}
                    canManage={canManageAnnouncements}
                    onPin={() => handlePinAnnouncement(announcement.id, announcement.is_pinned)}
                    onDelete={() => handleDeleteAnnouncement(announcement.id)}
                  />
                ))}

              {filteredAnnouncements.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No announcements found</p>
                  <p className="text-sm mt-2">
                    {activeTab === 'all' 
                      ? "No announcements have been posted yet" 
                      : `No ${activeTab} announcements found`
                    }
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface AnnouncementCardProps {
  announcement: Message;
  canManage: boolean;
  onPin: () => void;
  onDelete: () => void;
}

function AnnouncementCard({ announcement, canManage, onPin, onDelete }: AnnouncementCardProps) {
  const priority = (announcement.metadata as any)?.priority || 0;
  const targetAudience = (announcement.metadata as any)?.target_audience;
  const scheduledFor = (announcement.metadata as any)?.scheduled_for;

  return (
    <Card className={`${announcement.is_pinned ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-orange-100 rounded-full flex items-center justify-center">
              <Megaphone className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold">{announcement.subject || 'Announcement'}</h3>
                {announcement.is_pinned && (
                  <Pin className="h-4 w-4 text-blue-600" />
                )}
                <Badge className={getPriorityColor(priority)}>
                  {getPriorityLabel(priority)}
                </Badge>
              </div>
              <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                <span>By {announcement.sender?.full_name}</span>
                <span>{formatDistanceToNow(new Date(announcement.created_at))} ago</span>
                {scheduledFor && (
                  <div className="flex items-center space-x-1">
                    <Clock className="h-3 w-3" />
                    <span>Scheduled</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {canManage && (
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onPin}
                className={announcement.is_pinned ? 'text-blue-600' : ''}
              >
                <Pin className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-3">
          <p className="text-gray-700 whitespace-pre-wrap">{announcement.content}</p>
          
          {/* Target audience */}
          {targetAudience && (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Target className="h-4 w-4" />
              <span>Target: {targetAudience}</span>
            </div>
          )}
          
          {/* Attachments */}
          {announcement.attachments && announcement.attachments.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Attachments:</h4>
              {announcement.attachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center space-x-2 text-sm">
                  <div className="h-8 w-8 bg-gray-100 rounded flex items-center justify-center">
                    📎
                  </div>
                  <a 
                    href={attachment.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {attachment.original_filename}
                  </a>
                  <span className="text-gray-500">
                    ({Math.round((attachment.file_size || 0) / 1024)} KB)
                  </span>
                </div>
              ))}
            </div>
          )}
          
          {/* Reactions */}
          {announcement.reactions && announcement.reactions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {announcement.reactions.map((reaction) => (
                <Badge key={reaction.id} variant="secondary" className="text-sm">
                  {reaction.emoji} {reaction.user?.full_name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface CreateAnnouncementFormProps {
  onSuccess: () => void;
}

function CreateAnnouncementForm({ onSuccess }: CreateAnnouncementFormProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    subject: '',
    content: '',
    priority: 1,
    target_audience: 'all',
    schedule_for: '',
    notify_email: true,
    notify_sms: false,
    notify_push: true
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

      // Create the announcement message
      const { data: message, error: messageError } = await supabase
        .from('messages')
        .insert({
          league_id: user.league_id,
          sender_id: user.id,
          subject: formData.subject,
          content: formData.content,
          type: 'announcement',
          is_announcement: true,
          metadata: {
            priority: formData.priority,
            target_audience: formData.target_audience,
            scheduled_for: formData.schedule_for || null,
            notification_preferences: {
              email: formData.notify_email,
              sms: formData.notify_sms,
              push: formData.notify_push
            }
          }
        })
        .select()
        .single();

      if (messageError) throw messageError;

      // Create notifications for users
      const { data: users, error: usersError } = await supabase
        .from('user_profiles')
        .select('id, notification_preferences')
        .eq('league_id', user.league_id);

      if (usersError) throw usersError;

      // Filter users based on target audience
      const targetUsers = users.filter(u => {
        if (formData.target_audience === 'all') return true;
        if (formData.target_audience === 'coaches') return u.id !== user.id; // You'd check role here
        // Add more filtering logic as needed
        return true;
      });

      // Create notifications
      const notifications = [];
      for (const targetUser of targetUsers) {
        const userPrefs = targetUser.notification_preferences as any;
        
        if (formData.notify_push && userPrefs?.push) {
          notifications.push({
            user_id: targetUser.id,
            category: 'announcement' as NotificationCategory,
            type: 'push' as const,
            title: formData.subject,
            content: formData.content.substring(0, 100) + (formData.content.length > 100 ? '...' : ''),
            data: { message_id: message.id },
            priority: formData.priority
          });
        }

        if (formData.notify_email && userPrefs?.email) {
          notifications.push({
            user_id: targetUser.id,
            category: 'announcement' as NotificationCategory,
            type: 'email' as const,
            title: formData.subject,
            content: formData.content,
            data: { message_id: message.id },
            priority: formData.priority
          });
        }

        if (formData.notify_sms && userPrefs?.sms && formData.priority >= 5) {
          notifications.push({
            user_id: targetUser.id,
            category: 'announcement' as NotificationCategory,
            type: 'sms' as const,
            title: formData.subject,
            content: formData.content.substring(0, 160),
            data: { message_id: message.id },
            priority: formData.priority
          });
        }
      }

      if (notifications.length > 0) {
        const { error: notificationError } = await supabase
          .from('notifications')
          .insert(notifications);

        if (notificationError) throw notificationError;
      }

      toast.success('Announcement posted successfully');
      onSuccess();
    } catch (error) {
      console.error('Error creating announcement:', error);
      toast.error('Failed to create announcement');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">Subject</label>
        <Input
          value={formData.subject}
          onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
          placeholder="Enter announcement subject"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Content</label>
        <textarea
          value={formData.content}
          onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
          placeholder="Enter announcement content"
          rows={6}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Priority</label>
          <select
            value={formData.priority}
            onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={1}>Low</option>
            <option value={3}>Normal</option>
            <option value={5}>High</option>
            <option value={7}>Urgent</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Target Audience</label>
          <select
            value={formData.target_audience}
            onChange={(e) => setFormData(prev => ({ ...prev, target_audience: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Members</option>
            <option value="coaches">Coaches Only</option>
            <option value="admins">Admins Only</option>
            {teams.map(team => (
              <option key={team.id} value={`team:${team.id}`}>Team: {team.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Schedule For (Optional)</label>
        <Input
          type="datetime-local"
          value={formData.schedule_for}
          onChange={(e) => setFormData(prev => ({ ...prev, schedule_for: e.target.value }))}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Notification Methods</label>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.notify_push}
              onChange={(e) => setFormData(prev => ({ ...prev, notify_push: e.target.checked }))}
              className="mr-2"
            />
            Push Notifications
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.notify_email}
              onChange={(e) => setFormData(prev => ({ ...prev, notify_email: e.target.checked }))}
              className="mr-2"
            />
            Email Notifications
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.notify_sms}
              onChange={(e) => setFormData(prev => ({ ...prev, notify_sms: e.target.checked }))}
              className="mr-2"
            />
            SMS Notifications (High priority only)
          </label>
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        <Button type="button" variant="outline" onClick={onSuccess}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Posting...' : 'Post Announcement'}
        </Button>
      </div>
    </form>
  );
}