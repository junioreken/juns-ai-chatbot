const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const axios = require('axios');

// Import enhanced services
const cache = require('./services/cache');
const session = require('./services/session');
const intentClassifier = require('./services/intentClassifier');
const escalation = require('./services/escalation');
const analytics = require('./services/analytics');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// Shopify API config (from Railway variables)
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN; // e.g., https://j1ncvb-1b.myshopify.com
const SHOPIFY_API_TOKEN = process.env.SHOPIFY_API_TOKEN;

// Initialize OpenAI only if API key is available
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  console.log('✅ OpenAI configured');
} else {
  console.log('⚠️  OpenAI API key missing - AI features will be limited');
}

// Import enhanced routes
const enhancedChatRouter = require('./routes/enhanced-chat');
const recommendRouter = require('./routes/recommend');
const testRecommendRouter = require('./routes/test-recommend');
const debugShopifyRouter = require('./routes/debug-shopify');
const listProductsRouter = require('./routes/list-products');

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// Mount enhanced routes
app.use('/api', enhancedChatRouter);

// Debug endpoints
app.use('/debug-shopify', debugShopifyRouter);
app.use('/list-products', listProductsRouter);

// Use real Shopify products
if (!SHOPIFY_DOMAIN || !SHOPIFY_API_TOKEN) {
  console.log('⚠️  Shopify credentials missing, using test recommend endpoint with mock data');
  app.use('/recommend', testRecommendRouter);
} else {
  console.log('✅ Using real Shopify products from', SHOPIFY_DOMAIN);
  app.use('/recommend', recommendRouter);
}

app.get('/', (req, res) => {
  res.send("✅ JUN'S AI Chatbot Server is Running with Enhanced Features!");
});

// Legacy chat endpoint (maintained for backward compatibility)
app.post('/chat', async (req, res) => {
  const { message, name, email, lang, storeUrl } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  try {
    // Enhanced system prompt with more context about JUN'S store
    const systemPrompt = lang === 'fr'
      ? `Tu es JUN'S AI – un assistant mode francophone expert pour la boutique Shopify JUN'S (${SHOPIFY_DOMAIN || storeUrl}).

Tu peux aider avec :
- Questions sur les robes et vêtements de mode
- Informations sur les commandes et le suivi
- Recommandations de tenues par thème ou occasion
- Politiques de retour et d'échange
- Informations sur la livraison et les frais
- Questions sur la taille et le guide des tailles
- Informations sur les collections et nouveautés
- Aide à la navigation du site

Réponds toujours en français de manière professionnelle et amicale. Si tu ne sais pas quelque chose, dis-le honnêtement et guide le client vers le support client.`
      : `You are JUN'S AI – a fashion-savvy AI assistant for the JUN'S Shopify store (${SHOPIFY_DOMAIN || storeUrl}).

You can help with:
- Questions about dresses and fashion items
- Order tracking and status
- Outfit recommendations by theme or occasion
- Return and exchange policies
- Shipping information and costs
- Size guides and fitting advice
- Collection information and new arrivals
- Site navigation help

Always respond professionally and warmly. If you don't know something, be honest and guide the customer to customer support.`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    const reply = response.choices[0]?.message?.content || 
      (lang === 'fr' ? "Désolé, je ne sais pas comment répondre à cela." : "Sorry, I don't know how to answer that.");

    console.log(`🧠 Message from ${name || 'anonymous'} (${email || 'no email'}) in ${lang || 'en'}`);

    res.json({ reply });
  } catch (err) {
    console.error("OpenAI error:", err.message);
    const errorMsg = lang === 'fr' 
      ? "Oups! Quelque chose s'est mal passé de notre côté." 
      : "Oops! Something went wrong on our side.";
    res.status(500).json({ reply: errorMsg });
  }
});

// Enhanced endpoint for getting Shopify products with better error handling
app.get('/products', async (req, res) => {
  if (!SHOPIFY_DOMAIN || !SHOPIFY_API_TOKEN) {
    return res.status(400).json({ error: 'Shopify configuration missing' });
  }

  try {
    const result = await axios.get(`${SHOPIFY_DOMAIN}/admin/api/2023-07/products.json`, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    res.json(result.data);
  } catch (error) {
    console.error('❌ Shopify error:', error.message);
    res.status(500).json({ error: 'Failed to fetch products from Shopify' });
  }
});

// New endpoint to get store information
app.get('/store-info', async (req, res) => {
  if (!SHOPIFY_DOMAIN || !SHOPIFY_API_TOKEN) {
    return res.status(400).json({ error: 'Shopify configuration missing' });
  }

  try {
    const result = await axios.get(`${SHOPIFY_DOMAIN}/admin/api/2023-07/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    res.json(result.data);
  } catch (error) {
    console.error('❌ Shopify store info error:', error.message);
    res.status(500).json({ error: 'Failed to fetch store information' });
  }
});

// Enhanced health check endpoint
app.get('/health', async (req, res) => {
  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        cache: cache.isConnected,
        session: true,
        intentClassifier: true,
        escalation: true,
        analytics: true
      },
      shopify_configured: !!(SHOPIFY_DOMAIN && SHOPIFY_API_TOKEN),
      openai_configured: !!process.env.OPENAI_API_KEY,
      redis_configured: cache.isConnected
    };

    // Get basic metrics if available
    try {
      const conversationMetrics = await analytics.getConversationMetrics();
      healthData.metrics = conversationMetrics;
    } catch (error) {
      healthData.metrics = { error: 'Metrics unavailable' };
    }

    res.json(healthData);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Cache management endpoints
app.get('/cache/status', async (req, res) => {
  try {
    const status = {
      connected: cache.isConnected,
      redis_url: process.env.REDIS_URL || 'redis://localhost:6379',
      timestamp: new Date().toISOString()
    };
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get cache status' });
  }
});

app.post('/cache/clear', async (req, res) => {
  try {
    const result = await cache.flush();
    res.json({ success: result, message: 'Cache cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Intent classification test endpoint
app.post('/test-intent', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const intent = await intentClassifier.classifyIntent(message);
    res.json(intent);
  } catch (error) {
    res.status(500).json({ error: 'Intent classification failed' });
  }
});

// Escalation test endpoint
app.post('/test-escalation', async (req, res) => {
  try {
    const { message, intent, confidence, sessionId } = req.body;
    
    const escalationCheck = await escalation.shouldEscalate(message, intent, confidence, sessionId);
    res.json(escalationCheck);
  } catch (error) {
    res.status(500).json({ error: 'Escalation check failed' });
  }
});

// Analytics dashboard endpoint
app.get('/dashboard', async (req, res) => {
  try {
    const report = await analytics.getAnalyticsReport('24h');
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate dashboard report' });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  
  try {
    // Close Redis connection
    if (cache.client) {
      await cache.client.quit();
      console.log('✅ Redis connection closed');
    }
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

app.listen(PORT, () => {
  console.log(`🎉 JUN'S AI Chatbot Server is live on http://localhost:${PORT}`);
  console.log(`🏪 Shopify Domain: ${SHOPIFY_DOMAIN || 'Not configured'}`);
  console.log(`🔑 OpenAI: ${process.env.OPENAI_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`📊 Redis: ${cache.isConnected ? 'Connected' : 'Not connected'}`);
  console.log(`🚀 Enhanced Features: Caching, Sessions, Intent Classification, Escalation, Analytics`);
  console.log(`📈 New Endpoints:`);
  console.log(`   - POST /api/enhanced-chat - Enhanced chat with all optimizations`);
  console.log(`   - GET /api/analytics - Analytics dashboard`);
  console.log(`   - GET /dashboard - Quick dashboard view`);
  console.log(`   - GET /cache/status - Cache health check`);
  console.log(`   - POST /cache/clear - Clear cache`);
  console.log(`   - POST /test-intent - Test intent classification`);
  console.log(`   - POST /test-escalation - Test escalation logic`);
});
