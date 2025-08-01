interface EmbedWidgetOptions {
  type: 'list' | 'calendar' | 'agenda' | 'mini'
  theme: 'light' | 'dark' | 'auto'
  width?: string
  height?: string
  showPastEvents?: boolean
  maxEvents?: number
  dateRange?: {
    start?: string
    end?: string
  }
  fields?: string[]
  teams?: string[]
  statuses?: string[]
  timezone?: string
  colors?: {
    primary?: string
    secondary?: string
    background?: string
    text?: string
    border?: string
  }
  showHeaders?: boolean
  showFilters?: boolean
  clickAction?: 'none' | 'details' | 'redirect'
  redirectUrl?: string
  customCSS?: string
}

interface EmbedToken {
  token: string
  scope: 'user' | 'league' | 'field' | 'team' | 'public'
  scopeId?: string
  expiresAt?: string
}

export class CalendarEmbedService {
  
  /**
   * Generate embed widget HTML
   */
  generateEmbedHTML(token: string, options: EmbedWidgetOptions): string {
    const widgetId = `calendar-widget-${Date.now()}`
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fieldreservations.com'
    
    const configScript = this.generateConfigScript(widgetId, token, options)
    const widgetHTML = this.generateWidgetHTML(widgetId, options)
    const stylesCSS = this.generateWidgetStyles(options)
    
    return `
<!-- Field Reservations Calendar Widget -->
<div id="${widgetId}" class="field-calendar-widget">
  ${widgetHTML}
</div>

<style>
${stylesCSS}
${options.customCSS || ''}
</style>

<script>
${configScript}
(function() {
  const script = document.createElement('script');
  script.src = '${baseUrl}/widgets/calendar.js';
  script.async = true;
  script.onload = function() {
    if (window.FieldCalendarWidget) {
      window.FieldCalendarWidget.init('${widgetId}', window.${widgetId}Config);
    }
  };
  document.head.appendChild(script);
})();
</script>
<!-- End Field Reservations Calendar Widget -->
    `.trim()
  }

  /**
   * Generate widget configuration script
   */
  private generateConfigScript(widgetId: string, token: string, options: EmbedWidgetOptions): string {
    const config = {
      token,
      apiUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://fieldreservations.com'}/api/calendar/embed/${token}`,
      type: options.type,
      theme: options.theme,
      showPastEvents: options.showPastEvents,
      maxEvents: options.maxEvents,
      dateRange: options.dateRange,
      filters: {
        fields: options.fields,
        teams: options.teams,
        statuses: options.statuses
      },
      timezone: options.timezone || 'UTC',
      colors: options.colors || {},
      showHeaders: options.showHeaders !== false,
      showFilters: options.showFilters === true,
      clickAction: options.clickAction || 'details',
      redirectUrl: options.redirectUrl,
      refreshInterval: 300000 // 5 minutes
    }
    
    return `window.${widgetId}Config = ${JSON.stringify(config, null, 2)};`
  }

  /**
   * Generate widget HTML structure
   */
  private generateWidgetHTML(widgetId: string, options: EmbedWidgetOptions): string {
    const width = options.width || '100%'
    const height = options.height || (options.type === 'mini' ? '300px' : '600px')
    
    return `
  <div class="widget-container" style="width: ${width}; height: ${height};">
    <div class="widget-header" ${!options.showHeaders ? 'style="display: none;"' : ''}>
      <h3 class="widget-title">Field Reservations</h3>
      <div class="widget-controls">
        <button class="refresh-btn" title="Refresh">↻</button>
        <button class="fullscreen-btn" title="Fullscreen">⛶</button>
      </div>
    </div>
    
    <div class="widget-filters" ${!options.showFilters ? 'style="display: none;"' : ''}>
      <select class="field-filter" multiple>
        <option value="">All Fields</option>
      </select>
      <select class="team-filter" multiple>
        <option value="">All Teams</option>
      </select>
      <select class="status-filter" multiple>
        <option value="confirmed">Confirmed</option>
        <option value="pending">Pending</option>
      </select>
    </div>
    
    <div class="widget-content">
      <div class="loading-spinner">Loading calendar...</div>
      <div class="widget-error" style="display: none;">
        <p>Failed to load calendar data.</p>
        <button class="retry-btn">Retry</button>
      </div>
      <div class="widget-data" style="display: none;"></div>
    </div>
    
    <div class="widget-footer">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://fieldreservations.com'}" 
         target="_blank" class="powered-by">
        Powered by Field Reservations
      </a>
    </div>
  </div>
    `.trim()
  }

  /**
   * Generate widget CSS styles
   */
  private generateWidgetStyles(options: EmbedWidgetOptions): string {
    const colors = {
      primary: options.colors?.primary || '#3b82f6',
      secondary: options.colors?.secondary || '#64748b',
      background: options.colors?.background || '#ffffff',
      text: options.colors?.text || '#1f2937',
      border: options.colors?.border || '#e5e7eb',
      ...options.colors
    }
    
    const isDark = options.theme === 'dark' || 
                  (options.theme === 'auto' && 
                   (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches))
    
    if (isDark) {
      colors.background = options.colors?.background || '#1f2937'
      colors.text = options.colors?.text || '#f9fafb'
      colors.border = options.colors?.border || '#374151'
    }
    
    return `
.field-calendar-widget {
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', 'Roboto', sans-serif;
  color: ${colors.text};
  background: ${colors.background};
  border: 1px solid ${colors.border};
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.widget-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: ${colors.primary};
  color: white;
  border-bottom: 1px solid ${colors.border};
}

.widget-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.widget-controls {
  display: flex;
  gap: 8px;
}

.widget-controls button {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  font-size: 14px;
}

.widget-controls button:hover {
  background: rgba(255, 255, 255, 0.1);
}

.widget-filters {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: ${isDark ? '#374151' : '#f8fafc'};
  border-bottom: 1px solid ${colors.border};
  flex-wrap: wrap;
}

.widget-filters select {
  padding: 6px 8px;
  border: 1px solid ${colors.border};
  border-radius: 4px;
  background: ${colors.background};
  color: ${colors.text};
  font-size: 12px;
  min-width: 100px;
}

.widget-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  position: relative;
}

.loading-spinner {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100px;
  color: ${colors.secondary};
}

.widget-error {
  text-align: center;
  padding: 20px;
  color: #dc2626;
}

.retry-btn {
  background: ${colors.primary};
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 8px;
}

.widget-footer {
  padding: 8px 16px;
  text-align: center;
  border-top: 1px solid ${colors.border};
  background: ${isDark ? '#374151' : '#f8fafc'};
}

.powered-by {
  color: ${colors.secondary};
  text-decoration: none;
  font-size: 11px;
}

.powered-by:hover {
  text-decoration: underline;
}

/* Widget Type Specific Styles */
.widget-type-list .event-item {
  padding: 12px;
  border-bottom: 1px solid ${colors.border};
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.widget-type-list .event-item:last-child {
  border-bottom: none;
}

.widget-type-list .event-title {
  font-weight: 500;
  color: ${colors.text};
}

.widget-type-list .event-time {
  color: ${colors.secondary};
  font-size: 12px;
}

.widget-type-calendar .calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: ${colors.border};
  border: 1px solid ${colors.border};
}

.widget-type-calendar .calendar-day {
  background: ${colors.background};
  padding: 8px;
  min-height: 60px;
  font-size: 12px;
}

.widget-type-calendar .calendar-day.has-events {
  background: ${colors.primary}20;
}

.widget-type-agenda .agenda-item {
  margin-bottom: 16px;
  padding: 12px;
  border-left: 3px solid ${colors.primary};
  background: ${isDark ? '#374151' : '#f8fafc'};
}

.widget-type-mini .mini-event {
  padding: 6px 0;
  border-bottom: 1px solid ${colors.border};
  font-size: 12px;
}

.widget-type-mini .mini-event:last-child {
  border-bottom: none;
}

/* Responsive */
@media (max-width: 480px) {
  .widget-filters {
    flex-direction: column;
  }
  
  .widget-filters select {
    width: 100%;
  }
  
  .widget-header {
    padding: 8px 12px;
  }
  
  .widget-title {
    font-size: 14px;
  }
}
    `.trim()
  }

  /**
   * Generate embed token for widget access
   */
  async generateEmbedToken(
    scope: 'user' | 'league' | 'field' | 'team' | 'public',
    scopeId?: string,
    expiresIn?: number
  ): Promise<EmbedToken> {
    const token = this.generateToken()
    const expiresAt = expiresIn ? 
      new Date(Date.now() + expiresIn * 1000).toISOString() : 
      undefined
    
    // In a real implementation, store the token in database
    // with appropriate access controls
    
    return {
      token,
      scope,
      scopeId,
      expiresAt
    }
  }

  /**
   * Generate JavaScript widget code
   */
  generateWidgetScript(): string {
    return `
(function() {
  'use strict';
  
  window.FieldCalendarWidget = {
    widgets: new Map(),
    
    init: function(widgetId, config) {
      const widget = new CalendarWidget(widgetId, config);
      this.widgets.set(widgetId, widget);
      widget.load();
    },
    
    destroy: function(widgetId) {
      const widget = this.widgets.get(widgetId);
      if (widget) {
        widget.destroy();
        this.widgets.delete(widgetId);
      }
    }
  };
  
  class CalendarWidget {
    constructor(widgetId, config) {
      this.widgetId = widgetId;
      this.config = config;
      this.container = document.getElementById(widgetId);
      this.data = null;
      this.refreshTimer = null;
      
      this.bindEvents();
    }
    
    bindEvents() {
      const refreshBtn = this.container.querySelector('.refresh-btn');
      const retryBtn = this.container.querySelector('.retry-btn');
      const fullscreenBtn = this.container.querySelector('.fullscreen-btn');
      
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => this.refresh());
      }
      
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.load());
      }
      
      if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
      }
      
      // Filter changes
      const filters = this.container.querySelectorAll('.widget-filters select');
      filters.forEach(filter => {
        filter.addEventListener('change', () => this.applyFilters());
      });
    }
    
    async load() {
      this.showLoading();
      
      try {
        const response = await fetch(this.config.apiUrl + this.buildQueryString());
        
        if (!response.ok) {
          throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
        }
        
        this.data = await response.json();
        this.render();
        this.hideError();
        this.scheduleRefresh();
        
      } catch (error) {
        console.error('Calendar widget error:', error);
        this.showError(error.message);
      }
    }
    
    buildQueryString() {
      const params = new URLSearchParams();
      
      if (this.config.timezone) {
        params.append('timezone', this.config.timezone);
      }
      
      if (this.config.showPastEvents) {
        params.append('include_past', 'true');
      }
      
      if (this.config.maxEvents) {
        params.append('limit', this.config.maxEvents.toString());
      }
      
      if (this.config.dateRange?.start) {
        params.append('start_date', this.config.dateRange.start);
      }
      
      if (this.config.dateRange?.end) {
        params.append('end_date', this.config.dateRange.end);
      }
      
      return params.toString() ? '?' + params.toString() : '';
    }
    
    render() {
      const content = this.container.querySelector('.widget-data');
      if (!content) return;
      
      content.style.display = 'block';
      
      switch (this.config.type) {
        case 'list':
          this.renderList(content);
          break;
        case 'calendar':
          this.renderCalendar(content);
          break;
        case 'agenda':
          this.renderAgenda(content);
          break;
        case 'mini':
          this.renderMini(content);
          break;
      }
    }
    
    renderList(container) {
      container.className = 'widget-data widget-type-list';
      
      if (!this.data.events || this.data.events.length === 0) {
        container.innerHTML = '<p>No upcoming events</p>';
        return;
      }
      
      const html = this.data.events.map(event => \`
        <div class="event-item" data-event-id="\${event.id}">
          <div class="event-info">
            <div class="event-title">\${this.escapeHtml(event.title)}</div>
            <div class="event-details">
              \${this.formatDate(event.start)} • \${this.escapeHtml(event.field)}
            </div>
          </div>
          <div class="event-time">\${this.formatTime(event.start, event.end)}</div>
        </div>
      \`).join('');
      
      container.innerHTML = html;
      this.bindEventClicks(container);
    }
    
    renderCalendar(container) {
      container.className = 'widget-data widget-type-calendar';
      // Calendar grid implementation would go here
      container.innerHTML = '<p>Calendar view - implementation in progress</p>';
    }
    
    renderAgenda(container) {
      container.className = 'widget-data widget-type-agenda';
      
      if (!this.data.events || this.data.events.length === 0) {
        container.innerHTML = '<p>No upcoming events</p>';
        return;
      }
      
      const groupedEvents = this.groupEventsByDate(this.data.events);
      const html = Object.entries(groupedEvents).map(([date, events]) => \`
        <div class="agenda-date">
          <h4>\${this.formatDate(date)}</h4>
          \${events.map(event => \`
            <div class="agenda-item" data-event-id="\${event.id}">
              <div class="event-title">\${this.escapeHtml(event.title)}</div>
              <div class="event-time">\${this.formatTime(event.start, event.end)}</div>
              <div class="event-field">\${this.escapeHtml(event.field)}</div>
            </div>
          \`).join('')}
        </div>
      \`).join('');
      
      container.innerHTML = html;
      this.bindEventClicks(container);
    }
    
    renderMini(container) {
      container.className = 'widget-data widget-type-mini';
      
      if (!this.data.events || this.data.events.length === 0) {
        container.innerHTML = '<p>No events</p>';
        return;
      }
      
      const limitedEvents = this.data.events.slice(0, this.config.maxEvents || 5);
      const html = limitedEvents.map(event => \`
        <div class="mini-event" data-event-id="\${event.id}">
          <strong>\${this.escapeHtml(event.title)}</strong><br>
          <small>\${this.formatDate(event.start)} at \${this.formatTime(event.start, event.end)}</small>
        </div>
      \`).join('');
      
      container.innerHTML = html;
      this.bindEventClicks(container);
    }
    
    bindEventClicks(container) {
      if (this.config.clickAction === 'none') return;
      
      const eventItems = container.querySelectorAll('[data-event-id]');
      eventItems.forEach(item => {
        item.style.cursor = 'pointer';
        item.addEventListener('click', (e) => {
          const eventId = item.getAttribute('data-event-id');
          this.handleEventClick(eventId, e);
        });
      });
    }
    
    handleEventClick(eventId, event) {
      switch (this.config.clickAction) {
        case 'details':
          // Show event details in modal or tooltip
          this.showEventDetails(eventId);
          break;
        case 'redirect':
          if (this.config.redirectUrl) {
            const url = this.config.redirectUrl.replace('{eventId}', eventId);
            window.open(url, '_blank');
          }
          break;
      }
    }
    
    showEventDetails(eventId) {
      const event = this.data.events.find(e => e.id === eventId);
      if (!event) return;
      
      // Simple modal implementation
      const modal = document.createElement('div');
      modal.style.cssText = \`
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
      \`;
      
      modal.innerHTML = \`
        <div style="background: white; padding: 20px; border-radius: 8px; max-width: 400px; margin: 20px;">
          <h3>\${this.escapeHtml(event.title)}</h3>
          <p><strong>Field:</strong> \${this.escapeHtml(event.field)}</p>
          <p><strong>Date:</strong> \${this.formatDate(event.start)}</p>
          <p><strong>Time:</strong> \${this.formatTime(event.start, event.end)}</p>
          <p><strong>Purpose:</strong> \${this.escapeHtml(event.purpose || 'N/A')}</p>
          <button onclick="this.parentElement.parentElement.remove()" 
                  style="background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
            Close
          </button>
        </div>
      \`;
      
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });
      
      document.body.appendChild(modal);
    }
    
    groupEventsByDate(events) {
      return events.reduce((groups, event) => {
        const date = event.start.split('T')[0];
        if (!groups[date]) groups[date] = [];
        groups[date].push(event);
        return groups;
      }, {});
    }
    
    formatDate(dateStr) {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    }
    
    formatTime(startStr, endStr) {
      const start = new Date(startStr);
      const end = new Date(endStr);
      const options = { hour: 'numeric', minute: '2-digit' };
      return \`\${start.toLocaleTimeString(undefined, options)} - \${end.toLocaleTimeString(undefined, options)}\`;
    }
    
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    showLoading() {
      const loading = this.container.querySelector('.loading-spinner');
      const content = this.container.querySelector('.widget-data');
      const error = this.container.querySelector('.widget-error');
      
      if (loading) loading.style.display = 'block';
      if (content) content.style.display = 'none';
      if (error) error.style.display = 'none';
    }
    
    showError(message) {
      const loading = this.container.querySelector('.loading-spinner');
      const content = this.container.querySelector('.widget-data');
      const error = this.container.querySelector('.widget-error');
      
      if (loading) loading.style.display = 'none';
      if (content) content.style.display = 'none';
      if (error) {
        error.style.display = 'block';
        const errorMsg = error.querySelector('p');
        if (errorMsg) errorMsg.textContent = message || 'Failed to load calendar data.';
      }
    }
    
    hideError() {
      const error = this.container.querySelector('.widget-error');
      if (error) error.style.display = 'none';
    }
    
    refresh() {
      this.load();
    }
    
    scheduleRefresh() {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }
      
      if (this.config.refreshInterval > 0) {
        this.refreshTimer = setTimeout(() => {
          this.load();
        }, this.config.refreshInterval);
      }
    }
    
    toggleFullscreen() {
      // Simple fullscreen toggle
      if (this.container.classList.contains('fullscreen')) {
        this.container.classList.remove('fullscreen');
        this.container.style.cssText = '';
      } else {
        this.container.classList.add('fullscreen');
        this.container.style.cssText = \`
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 9999 !important;
        \`;
      }
    }
    
    destroy() {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }
    }
  }
})();
    `.trim()
  }

  /**
   * Generate random token
   */
  private generateToken(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
}

export const embedService = new CalendarEmbedService()