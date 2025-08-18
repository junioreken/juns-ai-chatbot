const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');
const axios = require('axios');
const cache = require('../services/cache');
const session = require('../services/session');
const intentClassifier = require('../services/intentClassifier');
const escalation = require('../services/escalation');
const analytics = require('../services/analytics');

// Lazy init inside handler

// Enhanced chat endpoint with all optimizations
router.post('/enhanced-chat', async (req, res) => {
  const startTime = Date.now();
  const { message, name, email, lang, storeUrl, sessionId } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  try {
    // 1. Get or create session
    const currentSession = await session.getSession(sessionId);
    const currentSessionId = currentSession.id;

    // 2. Track conversation start if new
    if (!sessionId) {
      await analytics.trackConversationStart(currentSessionId, { name, email, lang });
    }

    // 3. Track user message
    await session.addMessage(currentSessionId, message, true);
    await analytics.trackMessage(currentSessionId, message, true);

    // 4. Intent classification (cost optimization)
    const intentResult = await intentClassifier.classifyIntent(message, currentSessionId);
    console.log(`🎯 Intent: ${intentResult.intent} (${(intentResult.confidence * 100).toFixed(1)}%)`);

    // 5. Check if escalation is needed
    const escalationCheck = await escalation.shouldEscalate(
      message, 
      intentResult.intent, 
      intentResult.confidence, 
      currentSessionId
    );

    if (escalationCheck.shouldEscalate) {
      // Create escalation ticket
      const ticket = await escalation.createEscalationTicket(
        currentSessionId,
        escalationCheck.reason,
        escalationCheck.factors,
        { name, email, lang }
      );

      // Track escalation
      await analytics.trackEscalation(
        currentSessionId,
        escalationCheck.reason,
        escalationCheck.recommendedChannel,
        ticket.priority
      );

      // Get escalation message
      const escalationMessage = escalation.getEscalationMessage(
        escalationCheck.reason,
        escalationCheck.recommendedChannel
      );

      // Add bot message about escalation
      await session.addMessage(currentSessionId, escalationMessage.message, false);
      await analytics.trackMessage(currentSessionId, escalationMessage.message, false);

      return res.json({
        reply: escalationMessage.message,
        escalation: {
          required: true,
          reason: escalationCheck.reason,
          channel: escalationCheck.recommendedChannel,
          contactInfo: escalationMessage.contactInfo,
          estimatedWait: escalationMessage.estimatedWait,
          ticketId: ticket.id
        },
        sessionId: currentSessionId
      });
    }

    // 6. Get cached store data or fetch fresh (domain-aware)
    const storeData = await getStoreDataWithCache(storeUrl);

    // 7. Get conversation context for AI
    const conversationContext = await session.getConversationContext(currentSessionId, 5);

    // 8. Shortcut handlers for well-known intents before LLM
    const lower = message.toLowerCase();
    // 8a. Order tracking by email or order number pattern
    if (/\b(track|status)\b/.test(lower)) {
      const hasId = /#?\d{4,}/.test(lower) || /@/.test(lower);
      if (!hasId) {
        const ask = lang==='fr'
          ? "Pour suivre votre commande, pourriez-vous me donner votre numéro de commande (ex: #12345) ou l'email utilisé pour l'achat ?"
          : "To track your order, please share your order number (e.g., #12345) or the email used at checkout.";
        await session.addMessage(currentSessionId, ask, false);
        await analytics.trackMessage(currentSessionId, ask, false);
        return res.json({ reply: ask, intent: 'order_tracking', confidence: 0.7, sessionId: currentSessionId, escalation: { required: false } });
      }
      try {
        const track = await trackOrderFromMessage(lower);
        if (track) {
          await session.addMessage(currentSessionId, track.reply, false);
          await analytics.trackMessage(currentSessionId, track.reply, false);
          return res.json({ reply: track.reply, intent: 'order_tracking', confidence: 0.95, sessionId: currentSessionId, escalation: { required: false } });
        }
      } catch (_) {}
    }

    // 8b. Policies summary (prioritize the policy asked for)
    if (/refund|return|exchange|policy|shipping|delivery|privacy/i.test(lower)) {
      const policiesReply = buildPoliciesReply(storeData, lang, lower);
      if (policiesReply) {
        await session.addMessage(currentSessionId, policiesReply, false);
        await analytics.trackMessage(currentSessionId, policiesReply, false);
        return res.json({ reply: policiesReply, intent: 'return_exchange', confidence: 0.9, sessionId: currentSessionId, escalation: { required: false } });
      }
    }

    // 8c. Size advice
    if (/size|fit|measurement|measure|waist|hip|bust|height|weight/i.test(lower)) {
      const sizeAdvice = buildSizeAdviceReply(storeData, message, lang);
      if (sizeAdvice) {
        await session.addMessage(currentSessionId, sizeAdvice, false);
        await analytics.trackMessage(currentSessionId, sizeAdvice, false);
        return res.json({ reply: sizeAdvice, intent: 'size_help', confidence: 0.85, sessionId: currentSessionId, escalation: { required: false } });
      } else {
        const ask = lang==='fr'
          ? "Pour vous conseiller la taille, indiquez vos mesures (taille, poids, tour de poitrine/taille/hanches). Ex: 168 cm, 60 kg, 88/70/95."
          : "To recommend a size, please share your measurements (height, weight, bust/waist/hip). Example: 168 cm, 60 kg, 88/70/95.";
        await session.addMessage(currentSessionId, ask, false);
        await analytics.trackMessage(currentSessionId, ask, false);
        return res.json({ reply: ask, intent: 'size_help', confidence: 0.7, sessionId: currentSessionId, escalation: { required: false } });
      }
    }

    // 9. Build AI prompt with context
    const systemPrompt = buildSystemPrompt(lang, storeData, conversationContext, intentResult);

    // 10. Generate AI response
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 400
    });

    let reply = response.choices[0]?.message?.content || 
      (lang === 'fr' ? "Désolé, je ne sais pas comment répondre à cela." : "Sorry, I don't know how to answer that.");

    // If we have products and the intent is product_inquiry/general_help, ensure at least one product mention
    if ((intentResult.intent === 'product_inquiry' || intentResult.intent === 'general_help') && storeData.products.length > 0) {
      const sample = storeData.products.slice(0, 3).map(p => p.title).join(', ');
      const reinforcement = isNaN(sample.length) || sample.length === 0 ? '' : (lang === 'fr'
        ? `\n\nExemples de produits disponibles: ${sample}`
        : `\n\nExamples of available products: ${sample}`);
      reply += reinforcement;
    }

    // 11. Track bot response
    await session.addMessage(currentSessionId, reply, false);
    await analytics.trackMessage(currentSessionId, reply, false);

    // 12. Track intent and performance
    const responseTime = Date.now() - startTime;
    await analytics.trackIntent(currentSessionId, intentResult.intent, intentResult.confidence, responseTime);

    // 13. Update session context
    await session.updateContext(currentSessionId, {
      currentIntent: intentResult.intent,
      lastResponseTime: responseTime,
      language: lang
    });

    console.log(`🧠 Enhanced response in ${responseTime}ms - Intent: ${intentResult.intent}`);

    res.json({
      reply,
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      responseTime,
      sessionId: currentSessionId,
      escalation: { required: false }
    });

  } catch (err) {
    console.error("❌ Enhanced chat error:", err.message);
    
    // Track failed attempt
    if (sessionId) {
      await escalation.incrementFailedAttempts(sessionId);
    }

    const errorMsg = lang === 'fr' 
      ? "Oups! Quelque chose s'est mal passé de notre côté." 
      : "Oops! Something went wrong on our side.";
    
    res.status(500).json({ reply: errorMsg });
  }
});

// Get store data with caching
async function getStoreDataWithCache(storeUrl) {
  try {
    const domainFromUrl = (storeUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const domain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_DOMAIN || domainFromUrl || "";
    const cacheKey = `store_data_complete:${domain || 'default'}`;
    // Try to get from cache first
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      console.log('📦 Using cached store data');
      return cachedData;
    }

    // Fetch fresh data if not cached
    console.log('🔄 Fetching fresh store data');
    const [products, policies, pages, discounts] = await Promise.all([
      fetchShopifyData('products.json?limit=20', domain),
      fetchShopifyData('policies.json', domain),
      fetchShopifyData('pages.json', domain),
      fetchShopifyData('price_rules.json', domain)
    ]);

    const normalizedPolicies = normalizePolicies(policies, pages.pages || []);
    const storeData = {
      products: products.products || [],
      policies: normalizedPolicies,
      pages: pages.pages || [],
      discounts: discounts.price_rules || [],
      lastUpdated: new Date().toISOString()
    };

    // Cache for 15 minutes
    await cache.set(cacheKey, storeData, 900);
    
    return storeData;

  } catch (error) {
    console.error('❌ Failed to fetch store data:', error);
    return { products: [], policies: {}, pages: [], discounts: [] };
  }
}

// Fetch data from Shopify using axios (compatible with Node 16+)
async function fetchShopifyData(endpoint, domainOverride = "") {
  const SHOP_DOMAIN = domainOverride || process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_DOMAIN || "";
  const ADMIN_API_VERSION = "2024-01";
  const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_API_TOKEN || process.env.SHOPIFY_ADMIN_API;

  if (!ADMIN_TOKEN) {
    throw new Error('Shopify admin token is not configured');
  }

  if (!SHOP_DOMAIN) {
    throw new Error('Shopify domain is not configured');
  }

  const baseUrl = SHOP_DOMAIN.startsWith('http') ? SHOP_DOMAIN : `https://${SHOP_DOMAIN}`;
  const url = `${baseUrl}/admin/api/${ADMIN_API_VERSION}/${endpoint}`;

  const { data } = await axios.get(url, {
    headers: {
      'X-Shopify-Access-Token': ADMIN_TOKEN,
      'Content-Type': 'application/json'
    }
  });

  return data;
}

// Build comprehensive system prompt
function buildSystemPrompt(lang, storeData, conversationContext, intentResult) {
  const isFrench = lang === 'fr';
  
  // Base prompt
  let prompt = isFrench 
    ? `Tu es JUN'S AI – un assistant mode francophone expert pour la boutique Shopify JUN'S.\nN'utilise que les produits, réductions, pages et politiques fournis dans le contexte ci-dessous. Si l'information n'est pas présente, dis-le et propose d'aider autrement.`
    : `You are JUN'S AI – a fashion-savvy AI assistant for the JUN'S Shopify store.\nOnly use products, discounts, pages and policies provided in the context below. If the information is not present, say so and offer alternatives.`;

  // Add intent context
  prompt += isFrench
    ? `\n\nIntent détecté: ${intentResult.intent} (Confiance: ${(intentResult.confidence * 100).toFixed(1)}%)`
    : `\n\nDetected intent: ${intentResult.intent} (Confidence: ${(intentResult.confidence * 100).toFixed(1)}%)`;

  // Add conversation context if available
  if (conversationContext) {
    prompt += isFrench
      ? `\n\nContexte de la conversation:\n${conversationContext}`
      : `\n\nConversation context:\n${conversationContext}`;
  }

  // Add store data context
  if (storeData.products.length > 0) {
    const productInfo = storeData.products.map(p => {
      const price = p.variants?.[0]?.price || "N/A";
      const compare = p.variants?.[0]?.compare_at_price;
      const discountNote = compare ? ` (was $${compare})` : "";
      return `• ${p.title} – $${price}${discountNote} – Tags: [${p.tags}]`;
    }).join('\n');

    prompt += isFrench
      ? `\n\nProduits disponibles:\n${productInfo}`
      : `\n\nAvailable products:\n${productInfo}`;
  }

  if (storeData.discounts.length > 0) {
    const discountInfo = storeData.discounts.map(d => 
      `• ${d.title} – ${d.value_type === "percentage" ? `${d.value.replace('-', '')}% off` : `$${d.value} off`}`
    ).join('\n');

    prompt += isFrench
      ? `\n\nRéductions actives:\n${discountInfo}`
      : `\n\nActive discounts:\n${discountInfo}`;
  }

  // Add response guidelines
  prompt += isFrench
    ? `\n\nInstructions:\n- Réponds en français de manière professionnelle et amicale\n- Utilise le contexte de la conversation si pertinent\n- Suggère des produits spécifiques provenant de la liste ci-dessus uniquement\n- Mentionne les réductions disponibles si applicable\n- Si l'information n'est pas disponible, dis-le clairement et propose d'autres options (ex: recommandations générales)`
    : `\n\nInstructions:\n- Respond professionally and warmly\n- Use conversation context if relevant\n- Suggest specific products strictly from the list above\n- Mention available discounts if applicable\n- If the requested info is not available, state that clearly and offer general alternatives`;

  return prompt;
}

// Normalize policies shape from Shopify API (object or array fallback via pages)
function normalizePolicies(rawPolicies, pagesArray) {
  const out = {};
  if (rawPolicies && (rawPolicies.refund_policy || rawPolicies.shipping_policy || rawPolicies.privacy_policy)) {
    Object.assign(out, rawPolicies);
  }
  const pages = Array.isArray(pagesArray) ? pagesArray : [];
  const findBy = (keys) => pages.find(pg => keys.some(k => (pg.title || '').toLowerCase().includes(k)));
  const refund = findBy(['refund', 'return']);
  const shipping = findBy(['shipping', 'delivery']);
  const privacy = findBy(['privacy']);
  if (!out.refund_policy && refund) out.refund_policy = { body: refund.body_html || '' };
  if (!out.shipping_policy && shipping) out.shipping_policy = { body: shipping.body_html || '' };
  if (!out.privacy_policy && privacy) out.privacy_policy = { body: privacy.body_html || '' };
  return out;
}

// Build policies reply from fetched store data
function buildPoliciesReply(storeData, lang, lowerMsg = '') {
  const p = storeData.policies || {};
  const parts = [];
  const add = (label, body, len) => {
    if (!body) return;
    parts.push(`${label}: ${body.replace(/<[^>]+>/g, '').slice(0, len)}...`);
  };

  const wantShipping = /shipping|delivery/.test(lowerMsg);
  const wantReturns = /refund|return|exchange/.test(lowerMsg);
  const wantPrivacy = /privacy/.test(lowerMsg);

  // Prioritize specific request
  if (wantShipping && p.shipping_policy?.body) return (lang==='fr'? 'Politique de livraison:\n' : 'Shipping policy:\n') + p.shipping_policy.body.replace(/<[^>]+>/g, '').slice(0, 600);
  if (wantReturns && p.refund_policy?.body) return (lang==='fr'? 'Politique de retour:\n' : 'Return policy:\n') + p.refund_policy.body.replace(/<[^>]+>/g, '').slice(0, 600);
  if (wantPrivacy && p.privacy_policy?.body) return (lang==='fr'? 'Politique de confidentialité:\n' : 'Privacy policy:\n') + p.privacy_policy.body.replace(/<[^>]+>/g, '').slice(0, 600);

  // Otherwise provide a short summary of all available
  add(lang==='fr'? 'Retour' : 'Returns', p.refund_policy?.body, 280);
  add(lang==='fr'? 'Livraison' : 'Shipping', p.shipping_policy?.body, 280);
  add(lang==='fr'? 'Confidentialité' : 'Privacy', p.privacy_policy?.body, 200);
  if (parts.length === 0) return '';
  return (lang==='fr'? 'Voici nos politiques principales:\n' : 'Here are our main store policies:\n') + parts.join('\n');
}

// Naive size advice generator from message and typical size charts
function buildSizeAdviceReply(storeData, message, lang) {
  const text = message.toLowerCase();

  // 1) Parse triad B/W/H like 88/70/95
  const triad = text.match(/(\d{2,3})\s*\/\s*(\d{2,3})\s*\/\s*(\d{2,3})/);
  let bust = triad ? parseInt(triad[1], 10) : null;
  let waist = triad ? parseInt(triad[2], 10) : null;
  let hip = triad ? parseInt(triad[3], 10) : null;

  // 2) Parse height and weight in either order: number + unit or label + number
  const heightNumFirst = text.match(/(\d{2,3})\s*(cm|centimeter|centimetre)\b/);
  const heightLabelFirst = text.match(/\b(height|tall)\s*(?:is|=|:)?\s*(\d{2,3})\b/);
  const weightNumFirst = text.match(/(\d{2,3})\s*(kg|kgs|kilograms|lb|lbs)\b/);
  const weightLabelFirst = text.match(/\b(weight)\s*(?:is|=|:)?\s*(\d{2,3})\b/);

  const height = heightNumFirst ? parseInt(heightNumFirst[1], 10) : (heightLabelFirst ? parseInt(heightLabelFirst[2], 10) : null);
  const weight = weightNumFirst ? parseInt(weightNumFirst[1], 10) : (weightLabelFirst ? parseInt(weightLabelFirst[2], 10) : null);

  // 3) Also parse labeled bust/waist/hip if present
  const bustLabel = text.match(/\b(bust|chest)\s*(?:is|=|:)?\s*(\d{2,3})\b/);
  const waistLabel = text.match(/\b(waist)\s*(?:is|=|:)?\s*(\d{2,3})\b/);
  const hipLabel = text.match(/\b(hip|hips)\s*(?:is|=|:)?\s*(\d{2,3})\b/);
  if (!bust && bustLabel) bust = parseInt(bustLabel[2], 10);
  if (!waist && waistLabel) waist = parseInt(waistLabel[2], 10);
  if (!hip && hipLabel) hip = parseInt(hipLabel[2], 10);

  // simple heuristic
  let suggested = '';
  if (bust && waist && hip) {
    if (bust < 86 && waist < 66 && hip < 90) suggested = 'XS';
    else if (bust < 92 && waist < 72 && hip < 96) suggested = 'S';
    else if (bust < 98 && waist < 78 && hip < 102) suggested = 'M';
    else if (bust < 104 && waist < 84 && hip < 108) suggested = 'L';
    else suggested = 'XL or above';
  } else if (height && weight) {
    if (height < 162 && weight < 55) suggested = 'S';
    else if (height < 170 && weight < 68) suggested = 'M';
    else suggested = 'L';
  }

  if (!suggested) return '';
  const note = lang==='fr'
    ? `En fonction des mesures fournies, nous recommandons la taille ${suggested}. Veuillez vérifier également le guide des tailles du produit spécifique pour confirmer.`
    : `Based on your measurements, we recommend size ${suggested}. Please also review the specific product's size guide to confirm.`;
  return note;
}

// Parse order tracking from message (email or order number)
async function trackOrderFromMessage(lower) {
  try {
    const axios = require('axios');
    const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_API_TOKEN || process.env.SHOPIFY_ADMIN_API;
    if (!shopifyDomain || !token) return null;

    // order number like #1234 or 12345
    const numMatch = lower.match(/#?(\d{4,})/);
    if (numMatch) {
      const url = `https://${shopifyDomain}/admin/api/2024-01/orders.json?name=${encodeURIComponent('#'+numMatch[1])}&status=any`;
      const { data } = await axios.get(url, { headers: { 'X-Shopify-Access-Token': token }});
      const ord = data.orders?.[0];
      if (ord) {
        const status = ord.fulfillment_status || ord.financial_status || 'processing';
        return { reply: `Order ${ord.name}: current status is ${status}. Last update: ${ord.updated_at}.` };
      }
    }

    const emailMatch = lower.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
    if (emailMatch) {
      const url = `https://${shopifyDomain}/admin/api/2024-01/orders.json?email=${encodeURIComponent(emailMatch[0])}&status=any&limit=1`;
      const { data } = await axios.get(url, { headers: { 'X-Shopify-Access-Token': token }});
      const ord = data.orders?.[0];
      if (ord) {
        const status = ord.fulfillment_status || ord.financial_status || 'processing';
        return { reply: `Latest order ${ord.name}: current status is ${status}. Last update: ${ord.updated_at}.` };
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Analytics endpoint
router.get('/analytics', async (req, res) => {
  try {
    const { format = 'json', timeRange = '24h' } = req.query;
    
    if (format === 'csv') {
      const csvData = await analytics.exportAnalyticsData('csv');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="chatbot-analytics.csv"');
      return res.send(csvData);
    }

    const report = await analytics.getAnalyticsReport(timeRange);
    res.json(report);

  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ error: 'Failed to generate analytics report' });
  }
});

// Session management endpoints
router.get('/session/:sessionId', async (req, res) => {
  try {
    const sessionData = await session.getSession(req.params.sessionId);
    res.json(sessionData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get session' });
  }
});

router.post('/session/:sessionId/satisfaction', async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    await analytics.trackSatisfaction(req.params.sessionId, rating, feedback);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to track satisfaction' });
  }
});

// Health check with enhanced metrics
router.get('/health-enhanced', async (req, res) => {
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
      metrics: await analytics.getConversationMetrics()
    };

    res.json(healthData);
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy',
      error: error.message 
    });
  }
});

module.exports = router;
