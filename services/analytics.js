const cache = require('./cache');
const session = require('./session');

class AnalyticsService {
  constructor() {
    this.metrics = {
      conversations: {},
      intents: {},
      escalations: {},
      performance: {},
      customerSatisfaction: {}
    };
    
    this.retentionPeriod = 30; // Days to keep metrics
  }

  // Track conversation start
  async trackConversationStart(sessionId, customerInfo = {}) {
    try {
      const conversation = {
        sessionId,
        startTime: new Date().toISOString(),
        customerInfo,
        messageCount: 0,
        intentCount: {},
        escalationCount: 0,
        totalDuration: 0,
        satisfaction: null,
        ended: false
      };

      await cache.set(`conversation:${sessionId}`, conversation, 86400 * this.retentionPeriod);
      
      // Update global conversation count
      await this.incrementMetric('conversations', 'total');
      await this.incrementMetric('conversations', 'active');
      
      console.log(`📊 Conversation started: ${sessionId}`);
      
    } catch (error) {
      console.error('❌ Failed to track conversation start:', error);
    }
  }

  // Track conversation end
  async trackConversationEnd(sessionId, satisfaction = null) {
    try {
      const conversation = await cache.get(`conversation:${sessionId}`);
      if (!conversation) return;

      conversation.ended = true;
      conversation.endTime = new Date().toISOString();
      conversation.satisfaction = satisfaction;
      conversation.totalDuration = new Date(conversation.endTime) - new Date(conversation.startTime);

      await cache.set(`conversation:${sessionId}`, conversation, 86400 * this.retentionPeriod);
      
      // Update metrics
      await this.incrementMetric('conversations', 'completed');
      await this.decrementMetric('conversations', 'active');
      
      if (satisfaction) {
        await this.updateSatisfactionMetrics(satisfaction);
      }

      console.log(`📊 Conversation ended: ${sessionId} - Duration: ${conversation.totalDuration}ms`);
      
    } catch (error) {
      console.error('❌ Failed to track conversation end:', error);
    }
  }

  // Track message
  async trackMessage(sessionId, message, isUser = true, metadata = {}) {
    try {
      const conversation = await cache.get(`conversation:${sessionId}`);
      if (!conversation) return;

      conversation.messageCount += 1;
      
      if (isUser) {
        conversation.lastUserMessage = {
          content: message,
          timestamp: new Date().toISOString(),
          metadata
        };
      } else {
        conversation.lastBotMessage = {
          content: message,
          timestamp: new Date().toISOString(),
          metadata
        };
      }

      await cache.set(`conversation:${sessionId}`, conversation, 86400 * this.retentionPeriod);
      
      // Update global message count
      await this.incrementMetric('performance', 'totalMessages');
      
    } catch (error) {
      console.error('❌ Failed to track message:', error);
    }
  }

  // Track intent classification
  async trackIntent(sessionId, intent, confidence, responseTime) {
    try {
      const conversation = await cache.get(`conversation:${sessionId}`);
      if (!conversation) return;

      // Update conversation intent count
      conversation.intentCount[intent] = (conversation.intentCount[intent] || 0) + 1;

      await cache.set(`conversation:${sessionId}`, conversation, 86400 * this.retentionPeriod);
      
      // Update global intent metrics
      await this.incrementMetric('intents', intent);
      await this.updatePerformanceMetrics('responseTime', responseTime);
      
      // Track confidence distribution
      await this.trackConfidenceDistribution(confidence);
      
    } catch (error) {
      console.error('❌ Failed to track intent:', error);
    }
  }

  // Track escalation
  async trackEscalation(sessionId, reason, channel, priority) {
    try {
      const conversation = await cache.get(`conversation:${sessionId}`);
      if (!conversation) return;

      conversation.escalationCount += 1;
      conversation.escalations = conversation.escalations || [];
      conversation.escalations.push({
        reason,
        channel,
        priority,
        timestamp: new Date().toISOString()
      });

      await cache.set(`conversation:${sessionId}`, conversation, 86400 * this.retentionPeriod);
      
      // Update global escalation metrics
      await this.incrementMetric('escalations', 'total');
      await this.incrementMetric('escalations', reason);
      await this.incrementMetric('escalations', `channel_${channel}`);
      await this.incrementMetric('escalations', `priority_${priority}`);
      
      console.log(`📊 Escalation tracked: ${sessionId} - ${reason} via ${channel}`);
      
    } catch (error) {
      console.error('❌ Failed to track escalation:', error);
    }
  }

  // Track customer satisfaction
  async trackSatisfaction(sessionId, rating, feedback = '') {
    try {
      const conversation = await cache.get(`conversation:${sessionId}`);
      if (!conversation) return;

      conversation.satisfaction = {
        rating,
        feedback,
        timestamp: new Date().toISOString()
      };

      await cache.set(`conversation:${sessionId}`, conversation, 86400 * this.retentionPeriod);
      
      // Update satisfaction metrics
      await this.updateSatisfactionMetrics(rating);
      
      if (feedback) {
        await this.trackFeedback(feedback, rating);
      }
      
    } catch (error) {
      console.error('❌ Failed to track satisfaction:', error);
    }
  }

  // Update satisfaction metrics
  async updateSatisfactionMetrics(rating) {
    try {
      const metrics = await cache.get('satisfaction_metrics') || {
        total: 0,
        average: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      };

      metrics.total += 1;
      metrics.distribution[rating] = (metrics.distribution[rating] || 0) + 1;
      
      // Calculate new average
      const totalRating = Object.entries(metrics.distribution).reduce((sum, [rating, count]) => 
        sum + (parseInt(rating) * count), 0
      );
      metrics.average = totalRating / metrics.total;

      await cache.set('satisfaction_metrics', metrics, 86400 * this.retentionPeriod);
      
    } catch (error) {
      console.error('❌ Failed to update satisfaction metrics:', error);
    }
  }

  // Track feedback for sentiment analysis
  async trackFeedback(feedback, rating) {
    try {
      const feedbackData = await cache.get('feedback_data') || [];
      
      feedbackData.push({
        feedback,
        rating,
        timestamp: new Date().toISOString(),
        sentiment: this.analyzeFeedbackSentiment(feedback)
      });

      // Keep only last 1000 feedback entries
      if (feedbackData.length > 1000) {
        feedbackData.splice(0, feedbackData.length - 1000);
      }

      await cache.set('feedback_data', feedbackData, 86400 * this.retentionPeriod);
      
    } catch (error) {
      console.error('❌ Failed to track feedback:', error);
    }
  }

  // Simple sentiment analysis for feedback
  analyzeFeedbackSentiment(feedback) {
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'helpful', 'satisfied'];
    const negativeWords = ['bad', 'terrible', 'awful', 'unhelpful', 'dissatisfied', 'frustrated'];
    
    const feedbackLower = feedback.toLowerCase();
    const positiveCount = positiveWords.filter(word => feedbackLower.includes(word)).length;
    const negativeCount = negativeWords.filter(word => feedbackLower.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  // Update performance metrics
  async updatePerformanceMetrics(metric, value) {
    try {
      const metrics = await cache.get('performance_metrics') || {
        responseTime: { total: 0, count: 0, average: 0, min: Infinity, max: -Infinity },
        accuracy: { total: 0, count: 0, average: 0 },
        uptime: { startTime: new Date().toISOString(), totalDowntime: 0 }
      };

      if (metric === 'responseTime') {
        metrics.responseTime.total += value;
        metrics.responseTime.count += 1;
        metrics.responseTime.average = metrics.responseTime.total / metrics.responseTime.count;
        metrics.responseTime.min = Math.min(metrics.responseTime.min, value);
        metrics.responseTime.max = Math.max(metrics.responseTime.max, value);
      }

      await cache.set('performance_metrics', metrics, 86400 * this.retentionPeriod);
      
    } catch (error) {
      console.error('❌ Failed to update performance metrics:', error);
    }
  }

  // Track confidence distribution
  async trackConfidenceDistribution(confidence) {
    try {
      const distribution = await cache.get('confidence_distribution') || {
        '0.0-0.2': 0, '0.2-0.4': 0, '0.4-0.6': 0, '0.6-0.8': 0, '0.8-1.0': 0
      };

      if (confidence < 0.2) distribution['0.0-0.2']++;
      else if (confidence < 0.4) distribution['0.2-0.4']++;
      else if (confidence < 0.6) distribution['0.4-0.6']++;
      else if (confidence < 0.8) distribution['0.6-0.8']++;
      else distribution['0.8-1.0']++;

      await cache.set('confidence_distribution', distribution, 86400 * this.retentionPeriod);
      
    } catch (error) {
      console.error('❌ Failed to track confidence distribution:', error);
    }
  }

  // Increment metric counter
  async incrementMetric(category, metric) {
    try {
      const key = `${category}_metrics`;
      const metrics = await cache.get(key) || {};
      
      metrics[metric] = (metrics[metric] || 0) + 1;
      
      await cache.set(key, metrics, 86400 * this.retentionPeriod);
      
    } catch (error) {
      console.error('❌ Failed to increment metric:', error);
    }
  }

  // Decrement metric counter
  async decrementMetric(category, metric) {
    try {
      const key = `${category}_metrics`;
      const metrics = await cache.get(key) || {};
      
      metrics[metric] = Math.max((metrics[metric] || 0) - 1, 0);
      
      await cache.set(key, metrics, 86400 * this.retentionPeriod);
      
    } catch (error) {
      console.error('❌ Failed to decrement metric:', error);
    }
  }

  // Get comprehensive analytics report
  async getAnalyticsReport(timeRange = '24h') {
    try {
      const report = {
        timestamp: new Date().toISOString(),
        timeRange,
        conversations: await this.getConversationMetrics(),
        intents: await this.getIntentMetrics(),
        escalations: await this.getEscalationMetrics(),
        performance: await this.getPerformanceMetrics(),
        satisfaction: await this.getSatisfactionMetrics(),
        trends: await this.getTrendAnalysis()
      };

      return report;
      
    } catch (error) {
      console.error('❌ Failed to generate analytics report:', error);
      return null;
    }
  }

  // Get conversation metrics
  async getConversationMetrics() {
    try {
      const metrics = await cache.get('conversations_metrics') || {};
      const activeConversations = await this.getActiveConversationCount();
      
      return {
        total: metrics.total || 0,
        active: activeConversations,
        completed: metrics.completed || 0,
        averageDuration: await this.getAverageConversationDuration(),
        completionRate: metrics.total ? (metrics.completed / metrics.total * 100).toFixed(2) : 0
      };
      
    } catch (error) {
      console.error('❌ Failed to get conversation metrics:', error);
      return {};
    }
  }

  // Get active conversation count
  async getActiveConversationCount() {
    try {
      // This is a simplified approach - in production you'd use a more efficient method
      const keys = await cache.client?.keys('conversation:*') || [];
      let activeCount = 0;
      
      for (const key of keys) {
        const conversation = await cache.get(key);
        if (conversation && !conversation.ended) {
          activeCount++;
        }
      }
      
      return activeCount;
      
    } catch (error) {
      console.error('❌ Failed to get active conversation count:', error);
      return 0;
    }
  }

  // Get average conversation duration
  async getAverageConversationDuration() {
    try {
      const keys = await cache.client?.keys('conversation:*') || [];
      let totalDuration = 0;
      let completedCount = 0;
      
      for (const key of keys) {
        const conversation = await cache.get(key);
        if (conversation && conversation.ended && conversation.totalDuration) {
          totalDuration += conversation.totalDuration;
          completedCount++;
        }
      }
      
      return completedCount > 0 ? Math.round(totalDuration / completedCount) : 0;
      
    } catch (error) {
      console.error('❌ Failed to get average conversation duration:', error);
      return 0;
    }
  }

  // Get intent metrics
  async getIntentMetrics() {
    try {
      const metrics = await cache.get('intents_metrics') || {};
      const total = Object.values(metrics).reduce((sum, count) => sum + count, 0);
      
      return {
        total,
        distribution: metrics,
        topIntents: Object.entries(metrics)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([intent, count]) => ({ intent, count, percentage: ((count / total) * 100).toFixed(2) }))
      };
      
    } catch (error) {
      console.error('❌ Failed to get intent metrics:', error);
      return {};
    }
  }

  // Get escalation metrics
  async getEscalationMetrics() {
    try {
      const metrics = await cache.get('escalations_metrics') || {};
      const total = metrics.total || 0;
      
      return {
        total,
        rate: total > 0 ? ((total / (await this.getConversationMetrics()).total) * 100).toFixed(2) : 0,
        byReason: metrics,
        byChannel: Object.entries(metrics).filter(([key]) => key.startsWith('channel_')),
        byPriority: Object.entries(metrics).filter(([key]) => key.startsWith('priority_'))
      };
      
    } catch (error) {
      console.error('❌ Failed to get escalation metrics:', error);
      return {};
    }
  }

  // Get performance metrics
  async getPerformanceMetrics() {
    try {
      const metrics = await cache.get('performance_metrics') || {};
      const responseTime = metrics.responseTime || {};
      
      return {
        responseTime: {
          average: responseTime.average || 0,
          min: responseTime.min === Infinity ? 0 : responseTime.min,
          max: responseTime.max === -Infinity ? 0 : responseTime.max,
          total: responseTime.total || 0,
          count: responseTime.count || 0
        },
        uptime: metrics.uptime || {},
        totalMessages: (await cache.get('performance_metrics'))?.totalMessages || 0
      };
      
    } catch (error) {
      console.error('❌ Failed to get performance metrics:', error);
      return {};
    }
  }

  // Get satisfaction metrics
  async getSatisfactionMetrics() {
    try {
      const metrics = await cache.get('satisfaction_metrics') || {};
      
      return {
        total: metrics.total || 0,
        average: metrics.average || 0,
        distribution: metrics.distribution || {},
        satisfactionRate: metrics.total > 0 ? 
          ((metrics.distribution[4] + metrics.distribution[5]) / metrics.total * 100).toFixed(2) : 0
      };
      
    } catch (error) {
      console.error('❌ Failed to get satisfaction metrics:', error);
      return {};
    }
  }

  // Get trend analysis
  async getTrendAnalysis() {
    try {
      // This would typically analyze data over time periods
      // For now, return basic trend indicators
      return {
        message: 'Trend analysis requires historical data collection over time',
        recommendations: [
          'Monitor conversation completion rates',
          'Track escalation patterns',
          'Analyze customer satisfaction trends',
          'Identify peak usage times'
        ]
      };
      
    } catch (error) {
      console.error('❌ Failed to get trend analysis:', error);
      return {};
    }
  }

  // Export analytics data
  async exportAnalyticsData(format = 'json') {
    try {
      const report = await this.getAnalyticsReport();
      
      if (format === 'csv') {
        return this.convertToCSV(report);
      }
      
      return report;
      
    } catch (error) {
      console.error('❌ Failed to export analytics data:', error);
      return null;
    }
  }

  // Convert report to CSV format
  convertToCSV(report) {
    // Simple CSV conversion - in production you'd use a proper CSV library
    let csv = 'Metric,Value\n';
    
    Object.entries(report).forEach(([category, data]) => {
      if (typeof data === 'object' && data !== null) {
        Object.entries(data).forEach(([key, value]) => {
          csv += `${category}_${key},${value}\n`;
        });
      } else {
        csv += `${category},${data}\n`;
      }
    });
    
    return csv;
  }
}

module.exports = new AnalyticsService();
