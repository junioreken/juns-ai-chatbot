const session = require('./session');
const cache = require('./cache');

class EscalationService {
  constructor() {
    this.escalationThresholds = {
      confidence: 0.6, // Escalate if AI confidence is below this
      complexity: 0.7, // Escalate if query complexity is above this
      attempts: 3,     // Escalate after this many failed attempts
      sentiment: 0.3   // Escalate if customer sentiment is negative
    };

    this.escalationReasons = {
      'low_confidence': 'AI confidence too low for accurate response',
      'high_complexity': 'Query too complex for automated handling',
      'multiple_attempts': 'Multiple failed attempts to resolve issue',
      'negative_sentiment': 'Customer appears frustrated or dissatisfied',
      'technical_issue': 'Technical problem requiring human intervention',
      'policy_exception': 'Request requires policy exception or special handling',
      'billing_dispute': 'Billing or payment dispute',
      'product_defect': 'Product defect or quality issue'
    };

    this.humanAgentChannels = {
      'email': 'support@juns-store.com',
      'phone': '+1-800-JUNS-HELP',
      'live_chat': 'https://juns-store.com/live-chat',
      'whatsapp': '+1-800-JUNS-WHATSAPP'
    };
  }

  // Determine if escalation is needed
  async shouldEscalate(message, intent, confidence, sessionId) {
    try {
      const escalationFactors = {
        confidence: confidence < this.escalationThresholds.confidence,
        complexity: this.calculateComplexity(message) > this.escalationThresholds.complexity,
        attempts: await this.getFailedAttempts(sessionId) >= this.escalationThresholds.attempts,
        sentiment: this.analyzeSentiment(message) < this.escalationThresholds.sentiment
      };

      const shouldEscalate = Object.values(escalationFactors).some(factor => factor);
      
      if (shouldEscalate) {
        const reason = this.determineEscalationReason(escalationFactors);
        return {
          shouldEscalate: true,
          reason,
          factors: escalationFactors,
          recommendedChannel: this.getRecommendedChannel(reason, message)
        };
      }

      return { shouldEscalate: false };

    } catch (error) {
      console.error('❌ Escalation check error:', error);
      return { shouldEscalate: false };
    }
  }

  // Calculate message complexity
  calculateComplexity(message) {
    const factors = {
      length: Math.min(message.length / 200, 1), // Normalize by expected length
      specialChars: (message.match(/[^a-zA-Z0-9\s]/g) || []).length / message.length,
      technicalTerms: this.countTechnicalTerms(message),
      questionCount: (message.match(/\?/g) || []).length
    };

    // Weighted complexity score
    const complexity = (
      factors.length * 0.3 +
      factors.specialChars * 0.2 +
      factors.technicalTerms * 0.3 +
      factors.questionCount * 0.2
    );

    return Math.min(complexity, 1);
  }

  // Count technical or specialized terms
  countTechnicalTerms(message) {
    const technicalTerms = [
      'refund', 'chargeback', 'dispute', 'warranty', 'defect', 'damage',
      'custom', 'alteration', 'rush', 'express', 'international', 'duties',
      'tax', 'invoice', 'receipt', 'confirmation', 'cancellation'
    ];

    const messageLower = message.toLowerCase();
    return technicalTerms.filter(term => messageLower.includes(term)).length / technicalTerms.length;
  }

  // Analyze customer sentiment
  analyzeSentiment(message) {
    const positiveWords = [
      'good', 'great', 'excellent', 'amazing', 'wonderful', 'perfect',
      'love', 'like', 'happy', 'satisfied', 'pleased', 'thank'
    ];

    const negativeWords = [
      'bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike',
      'angry', 'frustrated', 'upset', 'disappointed', 'annoyed', 'mad'
    ];

    const messageLower = message.toLowerCase();
    const positiveCount = positiveWords.filter(word => messageLower.includes(word)).length;
    const negativeCount = negativeWords.filter(word => messageLower.includes(word)).length;

    if (positiveCount === 0 && negativeCount === 0) return 0.5; // Neutral

    return positiveCount / (positiveCount + negativeCount);
  }

  // Get failed attempts count for session
  async getFailedAttempts(sessionId) {
    if (!sessionId) return 0;

    try {
      const sessionData = await session.getSession(sessionId);
      return sessionData.context.failedAttempts || 0;
    } catch (error) {
      console.error('❌ Failed to get failed attempts:', error);
      return 0;
    }
  }

  // Increment failed attempts
  async incrementFailedAttempts(sessionId) {
    if (!sessionId) return;

    try {
      const sessionData = await session.getSession(sessionId);
      const currentAttempts = sessionData.context.failedAttempts || 0;
      await session.updateContext(sessionId, { failedAttempts: currentAttempts + 1 });
    } catch (error) {
      console.error('❌ Failed to increment failed attempts:', error);
    }
  }

  // Determine escalation reason
  determineEscalationReason(factors) {
    if (factors.confidence) return 'low_confidence';
    if (factors.complexity) return 'high_complexity';
    if (factors.attempts) return 'multiple_attempts';
    if (factors.sentiment) return 'negative_sentiment';
    return 'general_escalation';
  }

  // Get recommended escalation channel
  getRecommendedChannel(reason, message) {
    const messageLower = message.toLowerCase();
    
    // Urgent issues get phone support
    if (reason === 'negative_sentiment' || messageLower.includes('urgent') || messageLower.includes('emergency')) {
      return 'phone';
    }

    // Complex technical issues get live chat
    if (reason === 'high_complexity' || reason === 'technical_issue') {
      return 'live_chat';
    }

    // General inquiries get email
    return 'email';
  }

  // Create escalation ticket
  async createEscalationTicket(sessionId, reason, factors, customerInfo) {
    try {
      const ticket = {
        id: `ESC_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sessionId,
        reason,
        factors,
        customerInfo,
        status: 'open',
        priority: this.calculatePriority(reason, factors),
        createdAt: new Date().toISOString(),
        assignedTo: null,
        notes: []
      };

      // Store ticket in cache (in production, this would go to a database)
      await cache.set(`ticket:${ticket.id}`, ticket, 86400); // 24 hours

      // Log escalation for monitoring
      console.log(`🚨 ESCALATION CREATED: ${ticket.id} - ${reason} - Priority: ${ticket.priority}`);

      return ticket;

    } catch (error) {
      console.error('❌ Failed to create escalation ticket:', error);
      return null;
    }
  }

  // Calculate ticket priority
  calculatePriority(reason, factors) {
    let priority = 'medium';

    // High priority for urgent issues
    if (reason === 'negative_sentiment' || factors.sentiment) {
      priority = 'high';
    }

    // High priority for multiple failed attempts
    if (factors.attempts) {
      priority = 'high';
    }

    // Medium priority for complexity issues
    if (factors.complexity) {
      priority = 'medium';
    }

    // Low priority for low confidence (can wait)
    if (factors.confidence && !factors.sentiment) {
      priority = 'low';
    }

    return priority;
  }

  // Get escalation message for customer
  getEscalationMessage(reason, channel) {
    const messages = {
      'low_confidence': {
        en: "I want to make sure you get the most accurate help possible. Let me connect you with one of our expert customer service representatives.",
        fr: "Je veux m'assurer que vous obteniez l'aide la plus précise possible. Laissez-moi vous connecter avec l'un de nos représentants du service client."
      },
      'high_complexity': {
        en: "This is a complex request that I'd like our specialists to handle personally to ensure you get the best possible solution.",
        fr: "C'est une demande complexe que j'aimerais que nos spécialistes traitent personnellement pour vous assurer la meilleure solution possible."
      },
      'multiple_attempts': {
        en: "I've tried to help but I want to make sure you get the assistance you need. Let me connect you with someone who can better assist you.",
        fr: "J'ai essayé de vous aider mais je veux m'assurer que vous obteniez l'assistance dont vous avez besoin. Laissez-moi vous connecter avec quelqu'un qui peut mieux vous aider."
      },
      'negative_sentiment': {
        en: "I understand you're frustrated and I want to make this right. Let me connect you with someone who can resolve this immediately.",
        fr: "Je comprends que vous êtes frustré et je veux arranger cela. Laissez-moi vous connecter avec quelqu'un qui peut résoudre cela immédiatement."
      }
    };

    const message = messages[reason] || messages['low_confidence'];
    const channelInfo = this.humanAgentChannels[channel];

    return {
      message: message.en, // Default to English, can be localized
      channel: channel,
      contactInfo: channelInfo,
      estimatedWait: this.getEstimatedWait(channel, reason)
    };
  }

  // Get estimated wait time
  getEstimatedWait(channel, reason) {
    const waitTimes = {
      'phone': reason === 'negative_sentiment' ? '2-5 minutes' : '5-10 minutes',
      'live_chat': reason === 'negative_sentiment' ? '1-3 minutes' : '3-5 minutes',
      'email': reason === 'negative_sentiment' ? '2-4 hours' : '4-8 hours',
      'whatsapp': reason === 'negative_sentiment' ? '5-15 minutes' : '15-30 minutes'
    };

    return waitTimes[channel] || '5-10 minutes';
  }

  // Track escalation metrics
  async trackEscalation(escalationData) {
    try {
      const metrics = await cache.get('escalation_metrics') || {
        total: 0,
        byReason: {},
        byChannel: {},
        byPriority: {},
        daily: {}
      };

      // Update total count
      metrics.total += 1;

      // Update by reason
      metrics.byReason[escalationData.reason] = (metrics.byReason[escalationData.reason] || 0) + 1;

      // Update by channel
      metrics.byChannel[escalationData.channel] = (metrics.byChannel[escalationData.channel] || 0) + 1;

      // Update by priority
      metrics.byPriority[escalationData.priority] = (metrics.byPriority[escalationData.priority] || 0) + 1;

      // Update daily count
      const today = new Date().toDateString();
      metrics.daily[today] = (metrics.daily[today] || 0) + 1;

      await cache.set('escalation_metrics', metrics, 86400 * 30); // 30 days

    } catch (error) {
      console.error('❌ Failed to track escalation metrics:', error);
    }
  }
}

module.exports = new EscalationService();
