const natural = require('natural');
const cache = require('./cache');

class IntentClassifier {
  constructor() {
    this.intents = {
      'product_inquiry': {
        keywords: ['product', 'item', 'dress', 'clothing', 'fashion', 'buy', 'purchase', 'available', 'stock'],
        patterns: [
          /(?:what|which|show|find|looking for|search).*(?:product|item|dress|clothing)/i,
          /(?:price|cost|how much).*(?:product|item|dress)/i,
          /(?:available|in stock|have).*(?:product|item|dress)/i
        ],
        confidence: 0.8,
        handler: 'productHandler'
      },
      'order_tracking': {
        keywords: ['order', 'track', 'status', 'shipping', 'delivery', 'when', 'arrive', 'tracking'],
        patterns: [
          /(?:where|when|how).*(?:order|package|delivery|shipping)/i,
          /(?:track|status).*(?:order|package)/i,
          /(?:order|package).*(?:arrive|delivered|shipped)/i
        ],
        confidence: 0.9,
        handler: 'orderHandler'
      },
      'return_exchange': {
        keywords: ['return', 'exchange', 'refund', 'wrong size', 'doesn\'t fit', 'change', 'swap'],
        patterns: [
          /(?:return|exchange|refund).*(?:item|product|dress)/i,
          /(?:wrong|incorrect).*(?:size|fit)/i,
          /(?:change|swap).*(?:item|product)/i
        ],
        confidence: 0.85,
        handler: 'returnHandler'
      },
      'shipping_info': {
        keywords: ['shipping', 'delivery', 'cost', 'time', 'free', 'express', 'standard'],
        patterns: [
          /(?:shipping|delivery).*(?:cost|price|free)/i,
          /(?:how long|when).*(?:delivery|shipping)/i,
          /(?:free|express|standard).*(?:shipping|delivery)/i
        ],
        confidence: 0.8,
        handler: 'shippingHandler'
      },
      'size_help': {
        keywords: ['size', 'fit', 'measurement', 'chart', 'guide', 'small', 'medium', 'large'],
        patterns: [
          /(?:size|fit).*(?:guide|chart|measurement)/i,
          /(?:what|which).*(?:size|fit)/i,
          /(?:measurement|measure).*(?:size|fit)/i
        ],
        confidence: 0.75,
        handler: 'sizeHandler'
      },
      'general_help': {
        keywords: ['help', 'support', 'question', 'assist', 'how', 'what', 'why'],
        patterns: [
          /(?:help|support|assist)/i,
          /(?:how|what|why).*(?:do|can|should)/i
        ],
        confidence: 0.6,
        handler: 'generalHandler'
      }
    };

    this.tokenizer = new natural.WordTokenizer();
    this.tfidf = new natural.TfIdf();
    
    // Train the TF-IDF model
    this.trainModel();
  }

  // Train the TF-IDF model with intent examples
  trainModel() {
    Object.entries(this.intents).forEach(([intent, config]) => {
      // Add keywords as training data
      config.keywords.forEach(keyword => {
        this.tfidf.addDocument(keyword, intent);
      });
      
      // Add pattern examples
      config.patterns.forEach(pattern => {
        const example = pattern.toString().replace(/[\/\^$]/g, '');
        this.tfidf.addDocument(example, intent);
      });
    });
  }

  // Classify user intent
  async classifyIntent(message, sessionId = null) {
    try {
      // Check cache first
      const cacheKey = `intent:${message.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const cachedIntent = await cache.get(cacheKey);
      if (cachedIntent) {
        return cachedIntent;
      }

      // Pattern matching (highest confidence)
      const patternMatch = this.matchPatterns(message);
      if (patternMatch && patternMatch.confidence > 0.8) {
        await cache.set(cacheKey, patternMatch, 3600); // Cache for 1 hour
        return patternMatch;
      }

      // TF-IDF classification
      const tfidfMatch = this.classifyWithTFIDF(message);
      if (tfidfMatch && tfidfMatch.confidence > 0.6) {
        await cache.set(cacheKey, tfidfMatch, 3600);
        return tfidfMatch;
      }

      // Keyword matching
      const keywordMatch = this.matchKeywords(message);
      if (keywordMatch && keywordMatch.confidence > 0.5) {
        await cache.set(cacheKey, keywordMatch, 3600);
        return keywordMatch;
      }

      // Fallback to general help
      return {
        intent: 'general_help',
        confidence: 0.4,
        handler: 'generalHandler',
        reason: 'No specific intent detected, defaulting to general help'
      };

    } catch (error) {
      console.error('❌ Intent classification error:', error);
      return {
        intent: 'general_help',
        confidence: 0.3,
        handler: 'generalHandler',
        reason: 'Classification failed, defaulting to general help'
      };
    }
  }

  // Pattern matching for high-confidence classification
  matchPatterns(message) {
    for (const [intent, config] of Object.entries(this.intents)) {
      for (const pattern of config.patterns) {
        if (pattern.test(message)) {
          return {
            intent,
            confidence: config.confidence,
            handler: config.handler,
            reason: `Pattern match: ${pattern.toString()}`
          };
        }
      }
    }
    return null;
  }

  // TF-IDF classification
  classifyWithTFIDF(message) {
    const tokens = this.tokenizer.tokenize(message.toLowerCase());
    const scores = {};
    
    this.tfidf.listTerms().forEach(item => {
      if (tokens.includes(item.term)) {
        scores[item.document] = (scores[item.document] || 0) + item.score;
      }
    });

    if (Object.keys(scores).length === 0) return null;

    const bestIntent = Object.entries(scores).reduce((a, b) => 
      scores[a[0]] > scores[b[0]] ? a : b
    );

    return {
      intent: bestIntent[0],
      confidence: Math.min(bestIntent[1] / 10, 0.9), // Normalize confidence
      handler: this.intents[bestIntent[0]].handler,
      reason: `TF-IDF score: ${bestIntent[1].toFixed(3)}`
    };
  }

  // Keyword matching
  matchKeywords(message) {
    const messageLower = message.toLowerCase();
    const scores = {};

    Object.entries(this.intents).forEach(([intent, config]) => {
      let score = 0;
      config.keywords.forEach(keyword => {
        if (messageLower.includes(keyword.toLowerCase())) {
          score += 1;
        }
      });
      
      if (score > 0) {
        scores[intent] = score / config.keywords.length;
      }
    });

    if (Object.keys(scores).length === 0) return null;

    const bestIntent = Object.entries(scores).reduce((a, b) => 
      scores[a[0]] > scores[b[0]] ? a : b
    );

    return {
      intent: bestIntent[0],
      confidence: bestIntent[1] * this.intents[bestIntent[0]].confidence,
      handler: this.intents[bestIntent[0]].handler,
      reason: `Keyword match score: ${bestIntent[1].toFixed(3)}`
    };
  }

  // Get handler function name for intent
  getHandler(intent) {
    return this.intents[intent]?.handler || 'generalHandler';
  }

  // Get confidence threshold for intent
  getConfidenceThreshold(intent) {
    return this.intents[intent]?.confidence || 0.5;
  }

  // Add new intent patterns (for future training)
  addIntentPattern(intent, pattern, keywords = []) {
    if (!this.intents[intent]) {
      this.intents[intent] = {
        keywords: [],
        patterns: [],
        confidence: 0.7,
        handler: 'generalHandler'
      };
    }

    if (pattern) {
      this.intents[intent].patterns.push(new RegExp(pattern, 'i'));
    }

    if (keywords.length > 0) {
      this.intents[intent].keywords.push(...keywords);
    }

    // Retrain model
    this.trainModel();
  }
}

module.exports = new IntentClassifier();
