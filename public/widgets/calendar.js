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
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
      
      const html = this.data.events.map(event => `
        <div class="event-item" data-event-id="${event.id}">
          <div class="event-info">
            <div class="event-title">${this.escapeHtml(event.title)}</div>
            <div class="event-details">
              ${this.formatDate(event.start)} • ${this.escapeHtml(event.field)}
            </div>
          </div>
          <div class="event-time">${this.formatTime(event.start, event.end)}</div>
        </div>
      `).join('');
      
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
      const html = Object.entries(groupedEvents).map(([date, events]) => `
        <div class="agenda-date">
          <h4>${this.formatDate(date)}</h4>
          ${events.map(event => `
            <div class="agenda-item" data-event-id="${event.id}">
              <div class="event-title">${this.escapeHtml(event.title)}</div>
              <div class="event-time">${this.formatTime(event.start, event.end)}</div>
              <div class="event-field">${this.escapeHtml(event.field)}</div>
            </div>
          `).join('')}
        </div>
      `).join('');
      
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
      const html = limitedEvents.map(event => `
        <div class="mini-event" data-event-id="${event.id}">
          <strong>${this.escapeHtml(event.title)}</strong><br>
          <small>${this.formatDate(event.start)} at ${this.formatTime(event.start, event.end)}</small>
        </div>
      `).join('');
      
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
      modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
      `;
      
      modal.innerHTML = `
        <div style="background: white; padding: 20px; border-radius: 8px; max-width: 400px; margin: 20px;">
          <h3>${this.escapeHtml(event.title)}</h3>
          <p><strong>Field:</strong> ${this.escapeHtml(event.field)}</p>
          <p><strong>Date:</strong> ${this.formatDate(event.start)}</p>
          <p><strong>Time:</strong> ${this.formatTime(event.start, event.end)}</p>
          <p><strong>Purpose:</strong> ${this.escapeHtml(event.purpose || 'N/A')}</p>
          <button onclick="this.parentElement.parentElement.remove()" 
                  style="background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
            Close
          </button>
        </div>
      `;
      
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
      return `${start.toLocaleTimeString(undefined, options)} - ${end.toLocaleTimeString(undefined, options)}`;
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
        this.container.style.cssText = `
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 9999 !important;
        `;
      }
    }
    
    destroy() {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }
    }
  }
})();