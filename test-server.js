const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Mock store data for testing
const mockStoreData = {
  products: [
    {
      id: 1,
      title: "Elegant Black Evening Dress",
      handle: "elegant-black-evening-dress",
      price: "89.99",
      tags: ["dress", "black", "evening", "elegant", "formal"],
      images: [{ src: "https://via.placeholder.com/300x400/000000/FFFFFF?text=Black+Dress" }],
      variants: [{ price: "89.99", title: "Default" }]
    },
    {
      id: 2,
      title: "Casual Summer Floral Dress",
      handle: "casual-summer-floral-dress",
      price: "59.99",
      tags: ["dress", "casual", "summer", "floral", "day"],
      images: [{ src: "https://via.placeholder.com/300x400/FFB6C1/000000?text=Floral+Dress" }],
      variants: [{ price: "59.99", title: "Default" }]
    },
    {
      id: 3,
      title: "Professional Blazer Set",
      handle: "professional-blazer-set",
      price: "129.99",
      tags: ["blazer", "professional", "office", "business", "formal"],
      images: [{ src: "https://via.placeholder.com/300x400/4169E1/FFFFFF?text=Blazer+Set" }],
      variants: [{ price: "129.99", title: "Default" }]
    },
    {
      id: 4,
      title: "Chic Cocktail Dress",
      handle: "chic-cocktail-dress",
      price: "79.99",
      tags: ["dress", "cocktail", "party", "chic", "evening"],
      images: [{ src: "https://via.placeholder.com/300x400/800080/FFFFFF?text=Cocktail+Dress" }],
      variants: [{ price: "79.99", title: "Default" }]
    }
  ],
  policies: {
    shipping_policy: { body: "Free shipping on orders over $75. Standard delivery 3-5 business days." },
    refund_policy: { body: "30-day return policy. Items must be in original condition." }
  },
  discounts: []
};

// Import the enhanced chat logic
const intentClassifier = require('./services/intentClassifier');
const session = require('./services/session');

// Enhanced chat endpoint for testing
app.post('/enhanced-chat', async (req, res) => {
  const { message, name, email, lang, storeUrl, sessionId } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  try {
    // Get or create session
    const currentSession = await session.getSession(sessionId);
    const currentSessionId = currentSession.id;

    // Track user message and extract preferences
    await session.addMessage(currentSessionId, message, true);
    await session.extractPreferences(currentSessionId, message);

    // Intent classification
    const intentResult = await intentClassifier.classifyIntent(message, currentSessionId);
    console.log(`🎯 Intent: ${intentResult.intent} (${(intentResult.confidence * 100).toFixed(1)}%)`);

    // Handle product discovery for outfit recommendations
    if (intentResult.intent === 'product_inquiry') {
      const productDiscovery = handleProductDiscovery(mockStoreData, message, lang || 'en');
      if (productDiscovery) {
        await session.addMessage(currentSessionId, productDiscovery, false);
        return res.json({ 
          reply: productDiscovery, 
          intent: 'product_inquiry', 
          confidence: 0.95, 
          sessionId: currentSessionId, 
          escalation: { required: false } 
        });
      }
    }

    // Fallback response
    const fallbackResponse = lang === 'fr' 
      ? "Je comprends que vous cherchez des conseils mode. Pouvez-vous me donner plus de détails sur le style ou l'occasion que vous recherchez ?"
      : "I understand you're looking for fashion advice. Could you give me more details about the style or occasion you're looking for?";

    await session.addMessage(currentSessionId, fallbackResponse, false);
    return res.json({ 
      reply: fallbackResponse, 
      intent: intentResult.intent, 
      confidence: intentResult.confidence, 
      sessionId: currentSessionId, 
      escalation: { required: false } 
    });

  } catch (err) {
    console.error("❌ Enhanced chat error:", err.message);
    const errorMsg = lang === 'fr' 
      ? "Oups! Quelque chose s'est mal passé de notre côté." 
      : "Oops! Something went wrong on our side.";
    
    res.status(500).json({ reply: errorMsg });
  }
});

// Simplified product discovery function
function handleProductDiscovery(storeData, message, lang) {
  const products = Array.isArray(storeData.products) ? storeData.products : [];
  if (products.length === 0) return '';

  const text = message.toLowerCase();
  
  // Check if user wants outfit recommendations
  const wantRecommend = /(recommend|suggest|show|looking|ideas?|best|bestsellers?|options?|complete my look|outfit|outfits|look|looks|ensemble|style|styles|fashion|clothing|clothes|wear|wearing|dress up|get dressed|put together|coordinate|matching|coordinated)/i.test(text);
  if (!wantRecommend) return '';

  // Filter products (simplified)
  const filteredProducts = products.filter(product => {
    const tags = Array.isArray(product.tags) ? product.tags : String(product.tags || '').split(',');
    return tags.some(tag => ['dress', 'blazer', 'outfit'].includes(tag.toLowerCase()));
  });

  if (filteredProducts.length === 0) return '';

  // Create product grid
  const grid = `
<div class="product-grid">
  ${filteredProducts.slice(0, 4).map(product => {
    const img = product.images && product.images[0] ? product.images[0].src : 'https://via.placeholder.com/300x400/CCCCCC/000000?text=No+Image';
    const price = product.variants && product.variants[0] ? product.variants[0].price : product.price || '—';
    return `<div class="product-card">
      <a href="/products/${product.handle}" target="_blank" rel="noopener">
        <img src="${img}" alt="${product.title}"/>
        <div class="pc-title">${product.title}</div>
        <div class="pc-price">$${price}</div>
      </a>
    </div>`;
  }).join('')}
</div>`;

  const header = lang === 'fr'
    ? `Voici quelques suggestions d'outfits pour vous:`
    : `Here are some outfit recommendations for you:`;

  return `${header}\n${grid}`;
}

// Serve the test page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-chatbot.html'));
});

app.listen(PORT, () => {
  console.log(`🎉 Test JUN'S AI Chatbot Server is live on http://localhost:${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} to test the outfit recommendations`);
});
