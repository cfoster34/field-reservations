import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/monitoring/logger';

export async function POST(request: NextRequest) {
  try {
    const feedback = await request.json();
    
    if (!feedback.type || !feedback.message) {
      return NextResponse.json(
        { error: 'Invalid feedback data' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Get user session if available
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // Store feedback in database
    const { data: savedFeedback, error: dbError } = await supabase
      .from('user_feedback')
      .insert({
        user_id: userId,
        type: feedback.type,
        email: feedback.email || session?.user?.email,
        message: feedback.message,
        attached_error: feedback.attachedError,
        event_id: feedback.eventId,
        url: feedback.url,
        user_agent: feedback.userAgent,
        viewport: feedback.viewport,
        status: 'new',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      throw dbError;
    }

    // Log feedback
    logger.info('User feedback received', {
      feedbackId: savedFeedback.id,
      type: feedback.type,
      userId,
      hasError: !!feedback.attachedError,
    });

    // Send notification for critical feedback
    if (feedback.type === 'bug' || feedback.attachedError) {
      await notifyTeam(savedFeedback);
    }

    // Track in Sentry
    Sentry.metrics.increment('feedback.submitted', 1, {
      tags: {
        type: feedback.type,
        has_error: feedback.attachedError ? 'true' : 'false',
      },
    });

    return NextResponse.json({ 
      success: true,
      feedbackId: savedFeedback.id,
    });
  } catch (error) {
    logger.error('Error storing user feedback', { error });
    Sentry.captureException(error);
    
    return NextResponse.json(
      { error: 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'all';
    const type = searchParams.get('type');
    const period = searchParams.get('period') || '7d';
    
    const supabase = await createClient();
    
    // Check if user is admin
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '24h':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case 'all':
        startDate.setFullYear(2000); // Far past date
        break;
    }

    // Build query
    let query = supabase
      .from('user_feedback')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    // Apply filters
    if (status !== 'all') {
      query = query.eq('status', status);
    }
    
    if (type) {
      query = query.eq('type', type);
    }

    const { data: feedback, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate statistics
    const stats = {
      total: feedback.length,
      byType: feedback.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byStatus: feedback.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      withErrors: feedback.filter(f => f.attached_error).length,
      responseRate: calculateResponseRate(feedback),
    };

    return NextResponse.json({
      period,
      stats,
      feedback: feedback.slice(0, 100), // Return first 100 items
    });
  } catch (error) {
    logger.error('Error retrieving user feedback', { error });
    Sentry.captureException(error);
    
    return NextResponse.json(
      { error: 'Failed to retrieve feedback' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { feedbackId, status, response } = await request.json();
    
    if (!feedbackId || !status) {
      return NextResponse.json(
        { error: 'Invalid update data' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Update feedback status
    const { error } = await supabase
      .from('user_feedback')
      .update({
        status,
        response,
        responded_at: status === 'responded' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', feedbackId);

    if (error) {
      throw error;
    }

    logger.info('Feedback updated', {
      feedbackId,
      status,
      hasResponse: !!response,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error updating feedback', { error });
    Sentry.captureException(error);
    
    return NextResponse.json(
      { error: 'Failed to update feedback' },
      { status: 500 }
    );
  }
}

async function notifyTeam(feedback: any) {
  try {
    // Send notification via preferred channel
    const notification = {
      alert: {
        type: 'user_feedback',
        severity: feedback.type === 'bug' ? 'high' : 'medium',
        message: `New ${feedback.type} feedback received`,
        details: {
          feedbackId: feedback.id,
          type: feedback.type,
          hasError: !!feedback.attached_error,
          url: feedback.url,
        },
        timestamp: new Date(),
      },
      channel: 'slack', // or email, etc.
    };

    await fetch('/api/monitoring/alerts/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notification),
    });
  } catch (error) {
    logger.error('Failed to notify team about feedback', { error });
  }
}

function calculateResponseRate(feedback: any[]): number {
  if (feedback.length === 0) return 0;
  
  const responded = feedback.filter(f => f.status === 'responded').length;
  return Math.round((responded / feedback.length) * 100);
}