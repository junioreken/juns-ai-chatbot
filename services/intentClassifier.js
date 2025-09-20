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

  // Classify user intent with enhanced semantic understanding
  async classifyIntent(message, sessionId = null) {
    try {
      // Check cache first
      const cacheKey = `intent:${message.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const cachedIntent = await cache.get(cacheKey);
      if (cachedIntent) {
        return cachedIntent;
      }

      // Enhanced semantic analysis (highest priority)
      const semanticMatch = this.analyzeSemanticIntent(message);
      if (semanticMatch && semanticMatch.confidence > 0.7) {
        await cache.set(cacheKey, semanticMatch, 3600);
        return semanticMatch;
      }

      // Pattern matching (high confidence)
      const patternMatch = this.matchPatterns(message);
      if (patternMatch && patternMatch.confidence > 0.8) {
        await cache.set(cacheKey, patternMatch, 3600);
        return patternMatch;
      }

      // TF-IDF classification
      const tfidfMatch = this.classifyWithTFIDF(message);
      if (tfidfMatch && tfidfMatch.confidence > 0.6) {
        await cache.set(cacheKey, tfidfMatch, 3600);
        return tfidfMatch;
      }

      // Keyword matching (lower priority)
      const keywordMatch = this.matchKeywords(message);
      if (keywordMatch && keywordMatch.confidence > 0.5) {
        await cache.set(cacheKey, keywordMatch, 3600);
        return keywordMatch;
      }

      // Fallback to general help with higher confidence for AI processing
      return {
        intent: 'general_help',
        confidence: 0.6, // Increased confidence for AI processing
        handler: 'generalHandler',
        reason: 'Complex query requiring full AI analysis'
      };

    } catch (error) {
      console.error('❌ Intent classification error:', error);
      return {
        intent: 'general_help',
        confidence: 0.5,
        handler: 'generalHandler',
        reason: 'Classification failed, using AI for full analysis'
      };
    }
  }

  // Enhanced semantic analysis for natural language understanding
  analyzeSemanticIntent(message) {
    const lowerMessage = message.toLowerCase();
    
    // Product inquiry patterns (more sophisticated and comprehensive)
    if (this.matchesSemanticPatterns(lowerMessage, [
      'looking for', 'need help finding', 'recommend', 'suggest', 'what would you suggest',
      'best option', 'perfect dress', 'something for', 'suitable for', 'appropriate for',
      'what do you have', 'show me', 'find me', 'help me choose', 'what should i wear',
      'dress for', 'outfit for', 'what works', 'what fits', 'what matches',
      'outfit recommendation', 'style advice', 'fashion help', 'what to wear',
      'complete my look', 'styling help', 'outfit ideas', 'dress suggestions',
      'what would look good', 'help me style', 'fashion tips', 'outfit inspiration',
      'what goes with', 'how to style', 'outfit combination', 'dress for occasion',
      'what size should i get', 'size recommendation', 'fit advice', 'sizing help',
      'measurement guide', 'size chart', 'how to measure', 'size question',
      'what color', 'color recommendation', 'color advice', 'color suggestions',
      'what material', 'fabric advice', 'material help', 'fabric suggestions',
      'price range', 'budget options', 'affordable', 'expensive', 'cost',
      'quality', 'durability', 'long lasting', 'well made', 'good quality',
      'recommend me', 'suggest me', 'help me find', 'what can you recommend',
      'outfit', 'outfits', 'look', 'looks', 'ensemble', 'style', 'styles',
      'fashion', 'clothing', 'clothes', 'wear', 'wearing', 'dress up',
      'get dressed', 'put together', 'coordinate', 'matching', 'coordinated'
    ])) {
      return {
        intent: 'product_inquiry',
        confidence: 0.95,
        handler: 'productHandler',
        reason: 'Semantic analysis detected comprehensive product recommendation request'
      };
    }

    // Order tracking patterns
    if (this.matchesSemanticPatterns(lowerMessage, [
      'where is my order', 'order status', 'track my order', 'when will it arrive',
      'shipping status', 'delivery update', 'order tracking', 'package status',
      'when did you ship', 'is it shipped', 'delivery time', 'arrival time'
    ])) {
      return {
        intent: 'order_tracking',
        confidence: 0.9,
        handler: 'orderHandler',
        reason: 'Semantic analysis detected order tracking request'
      };
    }

    // Size help patterns (enhanced)
    if (this.matchesSemanticPatterns(lowerMessage, [
      'what size', 'size help', 'size guide', 'measurements', 'sizing chart',
      'how to measure', 'size recommendation', 'fit guide', 'size advice',
      'too big', 'too small', 'doesn\'t fit', 'size issue', 'measurement help',
      'size question', 'fit question', 'measurement question', 'sizing question',
      'what size am i', 'which size', 'size me', 'fit me', 'measure me',
      'propose me a size', 'propose a size', 'suggest a size', 'recommend a size',
      'tell me my size', 'determine my size', 'choose my size', 'what should I get size',
      'size calculator', 'fit calculator', 'measurement calculator', 'size finder',
      'size chart', 'measurement chart', 'sizing chart', 'fit chart',
      'bust measurement', 'waist measurement', 'hip measurement', 'height weight',
      'size conversion', 'size comparison', 'size difference', 'size variation',
      'petite size', 'plus size', 'regular size', 'size range', 'size options'
    ])) {
      return {
        intent: 'size_help',
        confidence: 0.9,
        handler: 'sizeHandler',
        reason: 'Semantic analysis detected comprehensive sizing assistance request'
      };
    }

    // Return/exchange patterns
    if (this.matchesSemanticPatterns(lowerMessage, [
      'return policy', 'how to return', 'exchange policy', 'refund policy',
      'return process', 'exchange process', 'return item', 'send back',
      'not satisfied', 'change my mind', 'swap size', 'return for refund'
    ])) {
      return {
        intent: 'return_exchange',
        confidence: 0.9,
        handler: 'returnHandler',
        reason: 'Semantic analysis detected return/exchange request'
      };
    }

    // Shipping label patterns (high priority)
    if (this.matchesSemanticPatterns(lowerMessage, [
      'shipping label', 'need a label', 'print label', 'get label',
      'label for my order', 'shipping label for', 'return label',
      'label please', 'need label', 'want label'
    ])) {
      return {
        intent: 'shipping_label',
        confidence: 0.95,
        handler: 'shippingLabelHandler',
        reason: 'Semantic analysis detected shipping label request'
      };
    }

    // Representative/agent patterns (high priority)
    if (this.matchesSemanticPatterns(lowerMessage, [
      'connect me to', 'speak to', 'talk to', 'representative', 'agent',
      'human', 'person', 'manager', 'supervisor', 'customer service',
      'live person', 'real person', 'help desk', 'support agent',
      'customer support', 'support team', 'service team', 'help team',
      'get help', 'need help', 'want to speak', 'contact support',
      'call support', 'reach out', 'get in touch', 'speak with someone',
      'talk to someone', 'human help', 'live chat', 'live support'
    ])) {
      return {
        intent: 'representative_request',
        confidence: 0.95,
        handler: 'representativeHandler',
        reason: 'Semantic analysis detected representative request'
      };
    }

    // Shipping information patterns (lower priority)
    if (this.matchesSemanticPatterns(lowerMessage, [
      'shipping cost', 'delivery cost', 'shipping time', 'delivery time',
      'how long to ship', 'shipping options', 'delivery options',
      'free shipping', 'express shipping', 'standard shipping',
      'when will it arrive', 'delivery estimate', 'shipping estimate'
    ])) {
      return {
        intent: 'shipping_info',
        confidence: 0.85,
        handler: 'shippingHandler',
        reason: 'Semantic analysis detected shipping information request'
      };
    }

    // Complex questions that need detailed AI analysis
    if (this.matchesSemanticPatterns(lowerMessage, [
      'tell me about', 'explain', 'how does', 'what is', 'why', 'when should',
      'can you help me understand', 'i need advice', 'i have a question',
      'i\'m confused about', 'help me understand', 'what do you think',
      'give me your opinion', 'what would you do', 'how would you',
      'i\'m looking for', 'i want to know', 'i need to know', 'i\'m wondering',
      'could you explain', 'can you tell me more', 'i\'d like to know',
      'help me with', 'i need help with', 'i\'m having trouble',
      'i don\'t understand', 'i\'m not sure', 'i\'m confused',
      'what\'s the difference', 'compare', 'which is better',
      'pros and cons', 'advantages', 'disadvantages', 'benefits'
    ])) {
      return {
        intent: 'detailed_help',
        confidence: 0.95,
        handler: 'detailedHandler',
        reason: 'Semantic analysis detected complex question requiring detailed AI analysis'
      };
    }

    return null;
  }

  // Helper method for semantic pattern matching
  matchesSemanticPatterns(message, patterns) {
    return patterns.some(pattern => {
      if (typeof pattern === 'string') {
        return message.includes(pattern);
      }
      return pattern.test(message);
    });
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
