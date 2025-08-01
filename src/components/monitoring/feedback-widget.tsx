'use client';

import { useState, useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  MessageSquare, 
  X, 
  Send, 
  AlertCircle,
  Bug,
  HelpCircle,
  ThumbsDown,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

interface FeedbackType {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const feedbackTypes: FeedbackType[] = [
  { id: 'bug', label: 'Report a Bug', icon: <Bug className="h-4 w-4" />, color: 'text-red-600' },
  { id: 'issue', label: 'Report an Issue', icon: <AlertCircle className="h-4 w-4" />, color: 'text-orange-600' },
  { id: 'help', label: 'Get Help', icon: <HelpCircle className="h-4 w-4" />, color: 'text-blue-600' },
  { id: 'feedback', label: 'General Feedback', icon: <ThumbsDown className="h-4 w-4" />, color: 'text-purple-600' },
];

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [attachedError, setAttachedError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Listen for errors to attach to feedback
    const handleError = (event: ErrorEvent) => {
      if (isOpen && !attachedError) {
        setAttachedError(event.message);
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [isOpen, attachedError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedType || !message) {
      toast({
        title: 'Missing Information',
        description: 'Please select a feedback type and enter a message.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Create Sentry user feedback
      const user = Sentry.getCurrentHub().getScope()?.getUser();
      const eventId = Sentry.captureMessage(`User Feedback: ${selectedType}`, {
        level: 'info',
        tags: {
          feedback_type: selectedType,
        },
        contexts: {
          feedback: {
            email: email || user?.email || 'anonymous',
            message,
            type: selectedType,
            attachedError,
            url: window.location.href,
            timestamp: new Date().toISOString(),
          },
        },
      });

      // Send to API
      const response = await fetch('/api/monitoring/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedType,
          email: email || user?.email,
          message,
          attachedError,
          eventId,
          url: window.location.href,
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        }),
      });

      if (!response.ok) throw new Error('Failed to submit feedback');

      toast({
        title: 'Feedback Sent!',
        description: 'Thank you for your feedback. We\'ll review it shortly.',
      });

      // Reset form
      setSelectedType('');
      setEmail('');
      setMessage('');
      setAttachedError(null);
      setIsOpen(false);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit feedback. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <motion.button
        className="fixed bottom-6 right-6 bg-primary text-primary-foreground rounded-full p-4 shadow-lg hover:shadow-xl transition-shadow z-50"
        onClick={() => setIsOpen(true)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Open feedback form"
      >
        <MessageSquare className="h-6 w-6" />
      </motion.button>

      {/* Feedback Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setIsOpen(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-3rem)]"
            >
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Send Feedback</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Feedback Type Selection */}
                  <div className="space-y-2">
                    <Label>What's on your mind?</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {feedbackTypes.map((type) => (
                        <Button
                          key={type.id}
                          type="button"
                          variant={selectedType === type.id ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedType(type.id)}
                          className="justify-start"
                        >
                          <span className={type.color}>{type.icon}</span>
                          <span className="ml-2">{type.label}</span>
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Email (optional) */}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email (optional)</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  {/* Message */}
                  <div className="space-y-2">
                    <Label htmlFor="message">Message *</Label>
                    <Textarea
                      id="message"
                      placeholder="Tell us what happened..."
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                    />
                  </div>

                  {/* Attached Error */}
                  {attachedError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <div className="flex items-start space-x-2">
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-red-800">
                            Error Detected
                          </p>
                          <p className="text-xs text-red-600 mt-1 font-mono">
                            {attachedError}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAttachedError(null)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting || !selectedType || !message}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Feedback
                      </>
                    )}
                  </Button>
                </form>

                <p className="text-xs text-gray-500 mt-4 text-center">
                  Your feedback helps us improve. We'll review it within 24 hours.
                </p>
              </Card>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}