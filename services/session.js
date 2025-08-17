const cache = require('./cache');

class SessionService {
  constructor() {
    this.sessionTTL = 3600; // 1 hour session timeout
  }

  // Generate unique session ID
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Create or retrieve session
  async getSession(sessionId) {
    if (!sessionId) {
      sessionId = this.generateSessionId();
    }

    const session = await cache.get(`session:${sessionId}`);
    if (!session) {
      // Create new session
      const newSession = {
        id: sessionId,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        messages: [],
        context: {
          language: 'en',
          customerInfo: {},
          currentIntent: null,
          lastProductViewed: null,
          cartItems: [],
          preferences: {}
        }
      };
      
      await cache.set(`session:${sessionId}`, newSession, this.sessionTTL);
      return newSession;
    }

    // Update last activity
    session.lastActivity = new Date().toISOString();
    await cache.set(`session:${sessionId}`, session, this.sessionTTL);
    
    return session;
  }

  // Add message to session
  async addMessage(sessionId, message, isUser = true) {
    const session = await this.getSession(sessionId);
    
    const messageObj = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: message,
      isUser,
      timestamp: new Date().toISOString(),
      metadata: {}
    };

    session.messages.push(messageObj);
    
    // Keep only last 50 messages to prevent memory issues
    if (session.messages.length > 50) {
      session.messages = session.messages.slice(-50);
    }

    await cache.set(`session:${sessionId}`, session, this.sessionTTL);
    return messageObj;
  }

  // Update session context
  async updateContext(sessionId, contextUpdates) {
    const session = await this.getSession(sessionId);
    
    session.context = {
      ...session.context,
      ...contextUpdates,
      lastUpdated: new Date().toISOString()
    };

    await cache.set(`session:${sessionId}`, session, this.sessionTTL);
    return session.context;
  }

  // Get conversation history for AI context
  async getConversationContext(sessionId, maxMessages = 10) {
    const session = await this.getSession(sessionId);
    
    if (!session.messages.length) return '';

    const recentMessages = session.messages.slice(-maxMessages);
    
    return recentMessages.map(msg => {
      const role = msg.isUser ? 'Customer' : 'JUN\'S AI';
      return `${role}: ${msg.content}`;
    }).join('\n');
  }

  // Get customer preferences
  async getCustomerPreferences(sessionId) {
    const session = await this.getSession(sessionId);
    return session.context.preferences || {};
  }

  // Set customer preferences
  async setCustomerPreferences(sessionId, preferences) {
    const session = await this.getSession(sessionId);
    
    session.context.preferences = {
      ...session.context.preferences,
      ...preferences
    };

    await cache.set(`session:${sessionId}`, session, this.sessionTTL);
    return session.context.preferences;
  }

  // Track product view
  async trackProductView(sessionId, productId, productTitle) {
    const session = await this.getSession(sessionId);
    
    session.context.lastProductViewed = {
      id: productId,
      title: productTitle,
      timestamp: new Date().toISOString()
    };

    // Add to recently viewed products
    if (!session.context.recentlyViewed) {
      session.context.recentlyViewed = [];
    }

    const existingIndex = session.context.recentlyViewed.findIndex(p => p.id === productId);
    if (existingIndex > -1) {
      session.context.recentlyViewed.splice(existingIndex, 1);
    }

    session.context.recentlyViewed.unshift({
      id: productId,
      title: productTitle,
      timestamp: new Date().toISOString()
    });

    // Keep only last 10 products
    session.context.recentlyViewed = session.context.recentlyViewed.slice(0, 10);

    await cache.set(`session:${sessionId}`, session, this.sessionTTL);
  }

  // Clean up expired sessions
  async cleanupExpiredSessions() {
    // This would typically be handled by Redis TTL
    // But we can add additional cleanup logic here if needed
    console.log('🧹 Session cleanup completed');
  }

  // Get session analytics
  async getSessionAnalytics(sessionId) {
    const session = await this.getSession(sessionId);
    
    return {
      messageCount: session.messages.length,
      sessionDuration: Date.now() - new Date(session.createdAt).getTime(),
      lastActivity: session.lastActivity,
      context: session.context
    };
  }
}

module.exports = new SessionService();
