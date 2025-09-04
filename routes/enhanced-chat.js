const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');
const axios = require('axios');
const cache = require('../services/cache');
const session = require('../services/session');
const intentClassifier = require('../services/intentClassifier');
const escalation = require('../services/escalation');
const analytics = require('../services/analytics');
const tracking = require('../services/tracking');

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
    // 8a. Order tracking: require tracking number (or detect it directly)
    // Accept tracking numbers 8-40 chars (alphanumeric, must contain a digit)
    const trackingNumDirect = (message.match(/\b(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{8,40}\b/) || [])[0];
    const carrierMatch = lower.match(/\b(dhl|ups|usps|fedex|canpar|gls|purolator|royal\s?mail|evri|yodel|laposte)\b/);
    if (/\b(track|status|where.*order|livraison|suivi)\b/.test(lower) || trackingNumDirect || carrierMatch) {
      const trackingNum = trackingNumDirect || null;
      if (!trackingNum) {
        const ask = lang==='fr'
          ? "Pour suivre votre commande, indiquez votre numéro de suivi (tracking) figurant dans l'email d'expédition."
          : "To track your order, please provide your shipment tracking number from your shipping email.";
        await session.addMessage(currentSessionId, ask, false);
        await analytics.trackMessage(currentSessionId, ask, false);
        return res.json({ reply: ask, intent: 'order_tracking', confidence: 0.8, sessionId: currentSessionId, escalation: { required: false } });
      }
      try {
        const tn = trackingNum;
        // allow specifying carrier in message: e.g., 'track fedex 123...', 'track dhl 123...'
        const preferredSlugMap = { dhl: 'dhl', ups: 'ups', usps: 'usps', fedex: 'fedex', canpar: 'canpar', gls: 'gls', purolator: 'purolator', 'royal mail': 'royal-mail', royalmail: 'royal-mail', evri: 'hermes-uk', yodel: 'yodel', laposte: 'laposte' };
        const preferredSlug = carrierMatch ? (preferredSlugMap[carrierMatch[1].replace(/\s+/g,'')] || '') : '';
        const info = await tracking.trackByNumber(tn, preferredSlug);
        const reply = lang==='fr'
          ? `Statut: ${info.status}${info.courier ? ` | Transporteur: ${info.courier}` : ''}${info.last_update ? ` | Dernière mise à jour: ${info.last_update}` : ''}${info.checkpoint ? `\nDernier point: ${info.checkpoint}` : ''}`
          : `Status: ${info.status}${info.courier ? ` | Carrier: ${info.courier}` : ''}${info.last_update ? ` | Last update: ${info.last_update}` : ''}${info.checkpoint ? `\nLast checkpoint: ${info.checkpoint}` : ''}`;
        await session.addMessage(currentSessionId, reply, false);
        await analytics.trackMessage(currentSessionId, reply, false);
        return res.json({ reply, intent: 'order_tracking', confidence: 0.95, sessionId: currentSessionId, escalation: { required: false } });
      } catch (_) {}
    }

    // 8b. Shipping label requests (high priority) - trigger live chat
    if (intentResult.intent === 'shipping_label') {
      const labelReply = lang === 'fr' 
        ? "Je comprends que vous avez besoin d'une étiquette d'expédition pour votre commande. Je vous connecte immédiatement à un représentant qui pourra vous aider avec cela."
        : "I understand you need a shipping label for your order. I'm connecting you immediately to a representative who can help you with this.";
      
      await session.addMessage(currentSessionId, labelReply, false);
      await analytics.trackMessage(currentSessionId, labelReply, false);
      return res.json({ 
        reply: labelReply, 
        intent: 'shipping_label', 
        confidence: 0.95, 
        sessionId: currentSessionId, 
        escalation: { required: true, reason: 'Shipping label request requires human assistance' },
        triggerLiveChat: true // Special flag to trigger live chat
      });
    }

    // 8c. Representative requests (high priority) - trigger live chat
    if (intentResult.intent === 'representative_request') {
      const repReply = lang === 'fr'
        ? "Bien sûr ! Je vous connecte immédiatement à un représentant de notre service client. Un instant s'il vous plaît..."
        : "Of course! I'm connecting you immediately to a customer service representative. One moment please...";
      
      await session.addMessage(currentSessionId, repReply, false);
      await analytics.trackMessage(currentSessionId, repReply, false);
      return res.json({ 
        reply: repReply, 
        intent: 'representative_request', 
        confidence: 0.95, 
        sessionId: currentSessionId, 
        escalation: { required: true, reason: 'Customer requested human representative' },
        triggerLiveChat: true // Special flag to trigger live chat
      });
    }

    // 8d. Shipping ETA (only for general shipping questions, not labels)
    if (intentResult.intent === 'shipping_info' && /(ship|shipping|deliver|delivery|arrive|receive)/i.test(lower)) {
      const eta = buildShippingEtaReply(lower, lang);
      if (eta) {
        await session.addMessage(currentSessionId, eta, false);
        await analytics.trackMessage(currentSessionId, eta, false);
        return res.json({ reply: eta, intent: 'shipping_info', confidence: 0.9, sessionId: currentSessionId, escalation: { required: false } });
      }
    }

    // 8c. Policies summary (prioritize the policy asked for)
    if (/refund|return|exchange|policy|shipping|delivery|privacy/i.test(lower)) {
      const policiesReply = await buildPoliciesReplyAsync(storeData, lang, lower);
      if (policiesReply) {
        await session.addMessage(currentSessionId, policiesReply, false);
        await analytics.trackMessage(currentSessionId, policiesReply, false);
        return res.json({ reply: policiesReply, intent: 'return_exchange', confidence: 0.9, sessionId: currentSessionId, escalation: { required: false } });
      }
    }

    // 8d. Size advice (also trigger on raw measurements like "168 cm, 60 kg, 88/70/95")
    const measurementLike = /(\d{2,3}\s*cm)|(\d{2,3}\s*(kg|lb|lbs))|(\b\d\s*(?:ft|foot|')\s*\d{1,2}\b)|(\b\d{2,3}\s*[\/\-]\s*\d{2,3}\s*[\/\-]\s*\d{2,3}\b)/i;
    if (/size|fit|measurement|measure|waist|hip|bust|height|weight/i.test(lower) || measurementLike.test(lower)) {
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

    // 8e. Product discovery (colors, themes, budget cues) before LLM
    const productDiscovery = handleProductDiscovery(storeData, message, lang);
    if (productDiscovery) {
      await session.addMessage(currentSessionId, productDiscovery, false);
      await analytics.trackMessage(currentSessionId, productDiscovery, false);
      return res.json({ reply: productDiscovery, intent: 'product_inquiry', confidence: 0.85, sessionId: currentSessionId, escalation: { required: false } });
    }

    // 8f. Discounts/promos quick answer
    if (/(discount|promo|code|coupon|sale)/i.test(lower)) {
      const disc = formatActiveDiscounts(storeData, lang);
      if (disc) {
        await session.addMessage(currentSessionId, disc, false);
        await analytics.trackMessage(currentSessionId, disc, false);
        return res.json({ reply: disc, intent: 'general_help', confidence: 0.8, sessionId: currentSessionId, escalation: { required: false } });
      }
    }

    // 9. Build AI prompt with context
    const systemPrompt = buildSystemPrompt(lang, storeData, conversationContext, intentResult);

    // 10. Generate AI response with enhanced configuration
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.8, // Increased for more natural responses
      max_tokens: 800,  // Doubled for more detailed responses
      top_p: 0.9,       // Better response diversity
      frequency_penalty: 0.1, // Reduce repetition
      presence_penalty: 0.1   // Encourage new topics
    });

    let reply = response.choices[0]?.message?.content || 
      (lang === 'fr' ? "Désolé, je ne sais pas comment répondre à cela." : "Sorry, I don't know how to answer that.");

    // Removed auto-append of product examples to keep responses concise and natural

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
      fetchShopifyData('products.json?limit=250', domain),
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

// Build comprehensive system prompt with advanced AI capabilities
function buildSystemPrompt(lang, storeData, conversationContext, intentResult) {
  const isFrench = lang === 'fr';
  
  // Advanced base prompt with sophisticated understanding
  let prompt = isFrench 
    ? `Tu es JUN'S AI – un assistant mode expert et intelligent pour la boutique de robes JUN'S. Tu comprends le langage naturel, les nuances, et peux adapter tes réponses au contexte complet de la conversation.

CAPACITÉS AVANCÉES:
- Compréhension contextuelle complète des questions des clients
- Analyse sémantique des demandes (pas seulement des mots-clés)
- Réponses personnalisées basées sur l'historique de conversation
- Suggestions intelligentes de produits basées sur les préférences implicites
- Gestion des questions complexes et multi-parties
- Adaptation au niveau de formalité du client

CONTEXTE DE LA CONVERSATION:
${conversationContext || 'Nouvelle conversation'}

INTENT DÉTECTÉ: ${intentResult.intent} (Confiance: ${(intentResult.confidence * 100).toFixed(1)}%)

INSTRUCTIONS DE RÉPONSE:
1. Analyse la question complète, pas seulement les mots-clés
2. Comprends l'intention réelle derrière la demande
3. Utilise le contexte de conversation pour des réponses cohérentes
4. Adapte ton niveau de formalité au style du client
5. Fournis des réponses détaillées et utiles (5-8 phrases)
6. Suggère des produits pertinents avec des justifications
7. Anticipe les questions de suivi possibles
8. Sois naturel et conversationnel, pas robotique

GESTION SPÉCIALE:
- Pour les demandes d'étiquettes d'expédition: Reconnais la demande et explique qu'une assistance humaine est nécessaire
- Pour les demandes de représentant: Offre immédiatement de connecter à un agent humain
- Pour les problèmes de commande: Fournis une aide spécifique ou escalade vers le support humain
- Pour les demandes complexes: Décompose la réponse en étapes claires et actionables`
    : `You are JUN'S AI – an expert and intelligent fashion assistant for the JUN'S dress store. You understand natural language, nuances, and can adapt your responses to the complete context of the conversation.

ADVANCED CAPABILITIES:
- Complete contextual understanding of customer questions
- Semantic analysis of requests (not just keywords)
- Personalized responses based on conversation history
- Intelligent product suggestions based on implicit preferences
- Handling of complex and multi-part questions
- Adaptation to customer's formality level

CONVERSATION CONTEXT:
${conversationContext || 'New conversation'}

DETECTED INTENT: ${intentResult.intent} (Confidence: ${(intentResult.confidence * 100).toFixed(1)}%)

RESPONSE INSTRUCTIONS:
1. Analyze the complete question, not just keywords
2. Understand the real intention behind the request
3. Use conversation context for coherent responses
4. Adapt your formality level to match the customer's style
5. Provide detailed and helpful responses (5-8 sentences)
6. Suggest relevant products with justifications
7. Anticipate possible follow-up questions
8. Be natural and conversational, not robotic

SPECIAL HANDLING:
- For shipping label requests: Acknowledge the request and explain that human assistance is needed
- For representative requests: Immediately offer to connect to a human agent
- For order issues: Provide specific help or escalate to human support
- For complex requests: Break down the response into clear, actionable steps`;

  // Add comprehensive store data context
  if (storeData.products.length > 0) {
    const productInfo = storeData.products.map(p => {
      const price = p.variants?.[0]?.price || "N/A";
      const compare = p.variants?.[0]?.compare_at_price;
      const discountNote = compare ? ` (was $${compare})` : "";
      const tags = Array.isArray(p.tags) ? p.tags.join(', ') : p.tags || '';
      const description = p.body_html ? p.body_html.replace(/<[^>]*>/g, '').substring(0, 200) + '...' : '';
      return `• ${p.title} – $${price}${discountNote} – Tags: [${tags}] – ${description}`;
    }).join('\n');

    prompt += isFrench
      ? `\n\nPRODUITS DISPONIBLES (utilise ces informations pour des suggestions précises):\n${productInfo}`
      : `\n\nAVAILABLE PRODUCTS (use this information for accurate suggestions):\n${productInfo}`;
  }

  if (storeData.discounts.length > 0) {
    const discountInfo = storeData.discounts.map(d => 
      `• ${d.title} – ${d.value_type === "percentage" ? `${d.value.replace('-', '')}% off` : `$${d.value} off`}`
    ).join('\n');

    prompt += isFrench
      ? `\n\nRÉDUCTIONS ACTIVES:\n${discountInfo}`
      : `\n\nACTIVE DISCOUNTS:\n${discountInfo}`;
  }

  // Add policies context
  if (storeData.policies) {
    const policies = Object.entries(storeData.policies)
      .filter(([key, value]) => value && value.body)
      .map(([key, value]) => `${key}: ${value.body.substring(0, 300)}...`)
      .join('\n\n');
    
    if (policies) {
      prompt += isFrench
        ? `\n\nPOLITIQUES DE LA BOUTIQUE:\n${policies}`
        : `\n\nSTORE POLICIES:\n${policies}`;
    }
  }

  // Final instructions for natural conversation
  prompt += isFrench
    ? `\n\nSTYLE DE RÉPONSE:
- Sois chaleureux, professionnel et engageant
- Montre que tu comprends vraiment la question du client
- Fournis des détails utiles et des suggestions pertinentes
- Adapte ton langage au niveau de formalité du client
- Pose des questions de suivi pertinentes quand approprié
- Sois proactif dans l'aide (anticipe les besoins)
- Utilise des exemples concrets et des détails spécifiques`
    : `\n\nRESPONSE STYLE:
- Be warm, professional, and engaging
- Show that you truly understand the customer's question
- Provide helpful details and relevant suggestions
- Adapt your language to match the customer's formality level
- Ask relevant follow-up questions when appropriate
- Be proactive in helping (anticipate needs)
- Use concrete examples and specific details`;

  return prompt;
}

// Normalize policies shape from Shopify API (object or array fallback via pages)
function normalizePolicies(rawPolicies, pagesArray) {
  const out = {};
  if (rawPolicies && (rawPolicies.refund_policy || rawPolicies.shipping_policy || rawPolicies.privacy_policy)) {
    Object.assign(out, rawPolicies);
  }
  const pages = Array.isArray(pagesArray) ? pagesArray : [];

  const findPage = (titleKeys = [], bodyKeys = []) => {
    const keysLower = (arr) => arr.map(k => k.toLowerCase());
    const tks = keysLower(titleKeys);
    const bks = keysLower(bodyKeys);
    return pages.find(pg => {
      const title = (pg.title || '').toLowerCase();
      const handle = (pg.handle || '').toLowerCase();
      const body = (pg.body_html || '').toLowerCase();
      const titleMatch = tks.some(k => title.includes(k) || handle.includes(k));
      const bodyMatch = bks.length > 0 ? bks.some(k => body.includes(k)) : false;
      return titleMatch || bodyMatch;
    });
  };

  const refund = findPage(['refund', 'return', 'returns', 'exchange'], ['refund', 'return', 'exchange']);
  const shipping = findPage(['shipping', 'delivery', 'ship', 'shipment'], ['shipping', 'delivery', 'courier', 'ship']);
  const privacy = findPage(['privacy', 'confidentiality', 'data'], ['privacy', 'personal data']);

  if (!out.refund_policy && refund) out.refund_policy = { body: refund.body_html || '' };
  if (!out.shipping_policy && shipping) out.shipping_policy = { body: shipping.body_html || '' };
  if (!out.privacy_policy && privacy) out.privacy_policy = { body: privacy.body_html || '' };

  return out;
}

// Remove scripts/styles and HTML tags; condense whitespace
function basicSanitize(html) {
  if (!html) return '';
  return String(html)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build policies reply from fetched store data
function buildPoliciesReply(storeData, lang, lowerMsg = '') {
  const p = storeData.policies || {};
  const parts = [];
  const add = (label, body, len) => {
    if (!body) return;
    const clean = basicSanitize(body);
    parts.push(`${label}: ${clean.slice(0, len)}...`);
  };

  const wantShipping = /\b(shipping|delivery)\b/.test(lowerMsg);
  const wantReturns = /\b(refund|return|exchange)\b/.test(lowerMsg);
  const wantPrivacy = /\bprivacy\b/.test(lowerMsg);

  // Prioritize specific request
  if (wantShipping && p.shipping_policy?.body) return (lang==='fr'? 'Politique de livraison:\n' : 'Shipping policy:\n') + basicSanitize(p.shipping_policy.body).slice(0, 600);
  if (wantReturns && p.refund_policy?.body) return (lang==='fr'? 'Politique de retour:\n' : 'Return policy:\n') + basicSanitize(p.refund_policy.body).slice(0, 600);
  if (wantPrivacy && p.privacy_policy?.body) return (lang==='fr'? 'Politique de confidentialité:\n' : 'Privacy policy:\n') + basicSanitize(p.privacy_policy.body).slice(0, 600);

  // Otherwise provide a short summary of all available
  add(lang==='fr'? 'Retour' : 'Returns', p.refund_policy?.body, 280);
  add(lang==='fr'? 'Livraison' : 'Shipping', p.shipping_policy?.body, 280);
  add(lang==='fr'? 'Confidentialité' : 'Privacy', p.privacy_policy?.body, 200);
  if (parts.length === 0) return '';
  return (lang==='fr'? 'Voici nos politiques principales:\n' : 'Here are our main store policies:\n') + parts.join('\n');
}

// Async wrapper: if requested policy missing, fetch from explicit public URLs
async function buildPoliciesReplyAsync(storeData, lang, lowerMsg = '') {
  const wantShipping = /\b(shipping|delivery)\b/.test(lowerMsg);
  const wantReturns = /\b(refund|return|exchange)\b/.test(lowerMsg);
  const wantPrivacy = /\bprivacy\b/.test(lowerMsg);

  const hasShipping = Boolean(storeData?.policies?.shipping_policy?.body);
  const hasReturns = Boolean(storeData?.policies?.refund_policy?.body);
  const hasPrivacy = Boolean(storeData?.policies?.privacy_policy?.body);

  if (wantShipping && process.env.SHIPPING_POLICY_URL) {
    const body = await fetchPolicyFromPublicUrl('shipping');
    if (body) return formatPolicyResponse('shipping', body, lang);
  }
  if (wantReturns && process.env.RETURNS_POLICY_URL) {
    const body = await fetchPolicyFromPublicUrl('returns');
    if (body) return formatPolicyResponse('returns', body, lang);
  }
  if (wantPrivacy && process.env.PRIVACY_POLICY_URL) {
    const body = await fetchPolicyFromPublicUrl('privacy');
    if (body) return formatPolicyResponse('privacy', body, lang);
  }

  if (wantShipping && hasShipping) {
    const text = basicSanitize(storeData.policies.shipping_policy.body).slice(0, 600);
    return formatPolicyResponse('shipping', text, lang);
  }
  if (wantReturns && hasReturns) {
    const text = basicSanitize(storeData.policies.refund_policy.body).slice(0, 600);
    return formatPolicyResponse('returns', text, lang);
  }
  if (wantPrivacy && hasPrivacy) {
    const text = basicSanitize(storeData.policies.privacy_policy.body).slice(0, 600);
    return formatPolicyResponse('privacy', text, lang);
  }

  if (wantShipping && !hasShipping) {
    const body = await fetchPolicyFromPublicUrl('shipping');
    if (body) return (lang==='fr'? 'Politique de livraison:\n' : 'Shipping policy:\n') + body;
  }
  if (wantReturns && !hasReturns) {
    const body = await fetchPolicyFromPublicUrl('returns');
    if (body) return (lang==='fr'? 'Politique de retour:\n' : 'Return policy:\n') + body;
  }
  if (wantPrivacy && !hasPrivacy) {
    const body = await fetchPolicyFromPublicUrl('privacy');
    if (body) return (lang==='fr'? 'Politique de confidentialité:\n' : 'Privacy policy:\n') + body;
  }

  const reply = buildPoliciesReply(storeData, lang, lowerMsg);
  if (reply) return reply;
  return '';
}

async function fetchPolicyFromPublicUrl(kind) {
  try {
    const url =
      kind === 'shipping' ? process.env.SHIPPING_POLICY_URL :
      kind === 'returns' ? process.env.RETURNS_POLICY_URL :
      kind === 'privacy' ? process.env.PRIVACY_POLICY_URL : '';
    if (!url) return '';
    const { data } = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'JunsAI/1.0' }});
    // If entire HTML page, isolate main content within <main> or policy container
    let html = String(data);
    const mainMatch = html.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
    if (mainMatch) html = mainMatch[1];
    // Shopify policy pages often include an h1 and policy text; basicSanitize removes tags
    return basicSanitize(html).slice(0, 900);
  } catch (e) {
    return '';
  }
}

// Produce a concise 2-4 bullet summary from a long policy text
function summarizePolicy(text, lang) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  const bullets = [];
  const daysMatch = t.match(/(\d{1,2})\s*-?\s*day(s)?/i);
  if (daysMatch) bullets.push(lang==='fr' ? `${daysMatch[1]} jours pour les retours` : `${daysMatch[1]} days to return`);
  if (/free shipping|free\s+delivery/i.test(t)) bullets.push(lang==='fr' ? `Livraison gratuite disponible` : `Free shipping available`);
  if (/tracking/i.test(t)) bullets.push(lang==='fr' ? `Suivi fourni après expédition` : `Tracking provided after shipment`);
  const contact = t.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
  if (contact) bullets.push((lang==='fr' ? `Assistance: ` : `Support: `) + contact[0]);
  if (bullets.length < 2) {
    const first = t.split(/\.(\s|$)/).filter(Boolean).slice(0, 2).join('. ').trim();
    if (first) bullets.push(first);
  }
  return bullets.slice(0, 4).map(b => `• ${b}`).join('<br>');
}

function formatPolicyResponse(kind, text, lang) {
  const titles = {
    shipping: lang==='fr' ? "Voici les informations de livraison" : "Here is our shipping policy",
    returns: lang==='fr' ? "Voici les informations de retour" : "Here is our return policy",
    privacy: lang==='fr' ? "Voici les informations de confidentialité" : "Here is our privacy policy"
  };
  const header = titles[kind] || (lang==='fr' ? 'Voici les informations demandées' : 'Here is the requested policy');
  let bullets = summarizePolicy(text, lang);

  // Append a final bullet with an inline link label
  const link = getPolicyUrl(kind);
  if (link) {
    const linkSentence = lang==='fr'
      ? (kind==='shipping'
          ? `Pour tous les détails, consultez la <a href="${link}" target="_blank">politique de livraison</a>`
          : kind==='returns'
            ? `Pour tous les détails, consultez la <a href="${link}" target="_blank">politique de retour</a>`
            : `Pour tous les détails, consultez la <a href="${link}" target="_blank">politique de confidentialité</a>`)
      : (kind==='shipping'
          ? `For full details, see the <a href="${link}" target="_blank">shipping policy</a>`
          : kind==='returns'
            ? `For full details, see the <a href="${link}" target="_blank">return policy</a>`
            : `For full details, see the <a href="${link}" target="_blank">privacy policy</a>`);
    bullets += `<br>• ${linkSentence}`;
  }

  return `${header}<br>${bullets}`;
}

function getPolicyUrl(kind) {
  const envUrl = kind==='shipping' ? process.env.SHIPPING_POLICY_URL
    : kind==='returns' ? process.env.RETURNS_POLICY_URL
    : kind==='privacy' ? process.env.PRIVACY_POLICY_URL
    : '';
  if (envUrl) return envUrl;
  const domain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_DOMAIN;
  if (!domain) return '';
  const base = domain.startsWith('http') ? domain : `https://${domain}`;
  const handle = kind==='shipping' ? 'shipping-policy' : kind==='returns' ? 'refund-policy' : 'privacy-policy';
  return `${base}/policies/${handle}`;
}

// ---------- Product discovery helpers ----------
function normalize(str) {
  return String(str || '').toLowerCase();
}

function handleProductDiscovery(storeData, message, lang) {
  const products = Array.isArray(storeData.products) ? storeData.products : [];
  if (products.length === 0) return '';

  const text = normalize(message);
  const colorMap = {
    red: ['red','wine','burgundy','maroon'],
    blue: ['blue','navy','cobalt','royal blue'],
    green: ['green','emerald','olive','sage'],
    black: ['black','noir'],
    white: ['white','ivory','cream'],
    pink: ['pink','blush','rose','fuchsia','magenta'],
    purple: ['purple','lavender','lilac','violet'],
    gold: ['gold','champagne'],
    silver: ['silver','metallic'],
    beige: ['beige','taupe','nude','sand'],
    yellow: ['yellow','mustard'],
    orange: ['orange','rust','terracotta'],
    brown: ['brown','chocolate','coffee'],
    grey: ['grey','gray','charcoal']
  };
  const allColorTerms = Object.values(colorMap).flat();
  const colorFound = allColorTerms.find(c => new RegExp(`\\b${c}\\b`, 'i').test(text));
  const canonicalColor = colorFound && Object.keys(colorMap).find(k => colorMap[k].includes(colorFound));

  // Material/fabric detection (optional hard filter)
  const materialMap = {
    leather: ['leather','faux leather','pu leather','pu'],
    satin: ['satin','silk satin','silky'],
    denim: ['denim','jean','jeans'],
    wool: ['wool','cashmere'],
    cotton: ['cotton'],
    linen: ['linen'],
    chiffon: ['chiffon'],
    velvet: ['velvet'],
    lace: ['lace'],
    sequin: ['sequin','sequins']
  };
  const allMaterialTerms = Object.values(materialMap).flat();
  const materialFound = allMaterialTerms.find(m => new RegExp(`\\b${m}\\b`, 'i').test(text));
  const materialKey = materialFound && Object.keys(materialMap).find(k => materialMap[k].includes(materialFound));

  const priceUnder = (() => {
    const m = text.match(/under\s*\$?\s*(\d{2,4})/i) || text.match(/below\s*\$?\s*(\d{2,4})/i);
    return m ? parseFloat(m[1]) : null;
  })();
  const priceOver = (() => {
    const m = text.match(/over\s*\$?\s*(\d{2,4})/i) || text.match(/above\s*\$?\s*(\d{2,4})/i);
    return m ? parseFloat(m[1]) : null;
  })();
  const priceBetween = (() => {
    const m = text.match(/(?:between|from)\s*\$?\s*(\d{2,4})\s*(?:and|to|-)\s*\$?\s*(\d{2,4})/i);
    return m ? [parseFloat(m[1]), parseFloat(m[2])].sort((a,b)=>a-b) : null;
  })();

  const themeMatch = text.match(/(wedding|gala|night\s*out|nightclub|night\s*club|office|business|casual|birthday|cocktail|graduation|beach|summer|eid)/i);
  const themeRaw = themeMatch ? themeMatch[1].toLowerCase() : '';
  // Preserve 'nightclub' as its own theme; normalize 'night club' -> 'nightclub'
  let theme = themeRaw
    ? themeRaw.replace(/\s+/g, (m) => m === ' ' && themeRaw.includes('night club') ? '' : '-')
    : '';
  if (theme === 'night-club') theme = 'nightclub';
  let selectedTheme = theme ? decodeURIComponent(theme) : '';

  // Theme synonyms mapping for exact matching
  const themeSynonyms = {
    'wedding': ['wedding','bride','bridal','ceremony','elegant','white','ivory','lace','satin','guest'],
    'gala': ['gala','evening','black-tie','luxury','formal'],
    'night-out': ['night out','night-out','party','sexy','bold','club','short'],
    'office': ['office','work','business','professional','chic','neutral'],
    'casual': ['casual','day','everyday','relaxed','cozy','soft','sweater','pullover','fleece','autumn','winter','warm','streetwear'],
    'birthday': ['birthday','celebration','party','fun','bright'],
    'cocktail': ['cocktail','semi-formal'],
    'graduation': ['graduation','grad'],
    'beach': ['beach','summer','vacation','boho','resort'],
    'summer': ['summer','beach','boho','sun'],
    'eid': ['eid','modest','abaya','long','classy']
  };

  // Category intent parsing
  const categoryMap = {
    dress: ['dress','dresses','gown','gowns','robe','robes'],
    jacket: ['jacket','jackets','coat','coats','parka','outerwear','puffer','blazer'],
    skirt: ['skirt','skirts'],
    bag: ['bag','bags','purse','clutch','handbag','tote'],
    shoes: ['heel','heels','shoe','shoes','sandal','sandals','pump','pumps','boots'],
    jewelry: ['jewelry','jewelery','necklace','earring','earrings','bracelet','ring'],
    accessory: ['accessory','accessories','belt','scarf','hat','headband']
  };
  const accessoryTerms = Array.from(new Set(Object.values(categoryMap).flat()));
  const wantAccessories = accessoryTerms.some(t => new RegExp(`\\b${t}\\b`,`i`).test(text));
  const detectedCategories = Object.entries(categoryMap)
    .filter(([, words]) => words.some(w => new RegExp(`\\b${w}\\b`,`i`).test(text)))
    .map(([k]) => k);
  let desiredCategory = detectedCategories[0] || (/(accessory|accessories)/i.test(text) ? 'accessory' : '');
  // Default to dresses when user specifies only a theme (e.g., "casual", "wedding") with no category
  if (!desiredCategory && theme) desiredCategory = 'dress';

  // If theme not recognized, infer from merchant tags present in the user's message
  function allStoreTagsLower() {
    try {
      const set = new Set();
      const prods = Array.isArray(storeData.products) ? storeData.products : [];
      for (const p of prods) {
        const raw = Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',');
        for (const t of raw) {
          const v = String(t).toLowerCase().trim();
          if (v) set.add(v);
        }
      }
      return Array.from(set);
    } catch (_) { return []; }
  }

  if (!theme) {
    const tags = allStoreTagsLower();
    let best = '';
    for (const t of tags) {
      const spaced = t;
      const slug = t.replace(/\s+/g,'-');
      const re = new RegExp(`\\b${spaced.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')}\\b`, 'i');
      if (re.test(message) && slug.length > best.length) best = slug;
    }
    if (best) {
      theme = best;
      selectedTheme = decodeURIComponent(best);
      if (!desiredCategory) desiredCategory = 'dress';
    }
  }

  const needles = [];
  if (canonicalColor) needles.push(canonicalColor, ...(colorMap[canonicalColor]||[]));
  if (theme) needles.push(theme, theme.replace(/-/g,' '));
  if (wantAccessories) needles.push(...accessoryTerms);
  const wantRecommend = /(recommend|suggest|show|looking|ideas?|best|bestsellers?|options?|complete my look)/i.test(text) || needles.length > 0;
  if (!wantRecommend) return '';

  function lowestVariantPrice(p) {
    const vars = Array.isArray(p.variants) ? p.variants : [];
    let min = Number.POSITIVE_INFINITY;
    for (const v of vars) {
      const val = parseFloat(String(v.price || '0').replace(/[^0-9.]/g,''));
      if (!Number.isNaN(val) && val < min) min = val;
    }
    return min === Number.POSITIVE_INFINITY ? 0 : min;
  }

  function findColorOptionIndex(product) {
    const options = Array.isArray(product.options) ? product.options : [];
    return options.findIndex(opt => /color|colour|couleur/i.test(String(opt?.name || '')));
  }

  function matchVariantByColor(product, canonicalColorKey) {
    if (!canonicalColorKey) return { variant: null, matchedTerm: '' };
    const synonyms = colorMap[canonicalColorKey] || [canonicalColorKey];
    const colorIdx = findColorOptionIndex(product);
    const variants = Array.isArray(product.variants) ? product.variants : [];
    for (const variant of variants) {
      const value = colorIdx >= 0 ? String(variant[`option${colorIdx + 1}`] || '').toLowerCase() : String(variant.title || '').toLowerCase();
      const hit = synonyms.find(term => value.includes(term));
      if (hit) return { variant, matchedTerm: hit };
    }
    // Fallback: product-level
    const hay = [normalize(product.title), normalize(product.handle), normalize(product.body_html), normalize(product.tags)].join(' ');
    const hit = synonyms.find(term => hay.includes(term));
    return { variant: null, matchedTerm: hit || '' };
  }

  // ---- Strict tag helpers (merchant-controlled tags only) ----
  function normalizeTagsValue(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(v => String(v).toLowerCase().trim()).filter(Boolean);
    return String(value).toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
  }

  function hasThemeTagStrict(p) {
    if (!selectedTheme) return true;
    const tags = normalizeTagsValue(p.tags);
    // accept exact slug or space version
    return tags.includes(selectedTheme) || tags.includes(selectedTheme.replace(/-/g,' '));
  }

  function hasDressTagStrict(p) {
    const tags = normalizeTagsValue(p.tags);
    return tags.includes('dress') || tags.includes('gown') || tags.includes('robe') || tags.includes('robes');
  }

  function hasSkirtTagStrict(p){
    const tags = normalizeTagsValue(p.tags);
    return tags.includes('skirt') || tags.includes('skirts');
  }

  function materialMatch(p){
    if (!materialKey) return true;
    const tags = normalizeTagsValue(p.tags);
    if (tags.includes(materialKey)) return true;
    const hay = [normalize(p.title), normalize(p.handle), normalize(p.body_html)].join(' ');
    return new RegExp(`\\b${materialKey}\\b`,'i').test(hay);
  }

  function isDressHeuristic(p){
    const t = normalize(p.title);
    const pt = normalize(p.product_type||'');
    return /\b(dress|gown|robe)\b/.test(t) || /\b(dress|gown|robe)\b/.test(pt);
  }

  function scoreProduct(p, variantColorHit) {
    const title = normalize(p.title);
    const handle = normalize(p.handle);
    const body = normalize(p.body_html);
    const tags = normalizeTagsValue(p.tags);
    const hay = [title, handle, body, tags.join(' ')].join(' ');
    let score = 0;
    if (selectedTheme && (tags.includes(selectedTheme) || tags.includes(selectedTheme.replace(/-/g,' ')))) score += 3;
    if (canonicalColor) {
      if (variantColorHit) score += 3; else {
        const terms = colorMap[canonicalColor] || [canonicalColor];
        if (terms.some(n => n && hay.includes(n))) score += 1;
      }
    }
    if (wantAccessories) {
      if (accessoryTerms.some(n => hay.includes(n))) score += 2; else score -= 1;
    } else {
      if (tags.includes('dress') || tags.includes('gown') || tags.includes('robe') || tags.includes('robes')) score += 1;
    }
    return score;
  }

  function pricePassValue(value) {
    if (priceBetween) return value >= priceBetween[0] && value <= priceBetween[1];
    if (priceUnder !== null) return value <= priceUnder;
    if (priceOver !== null) return value >= priceOver;
    return true;
  }

  const classifyProduct = (p) => {
    const hay = [normalize(p.title), normalize(p.handle), normalize(p.body_html), normalize(Array.isArray(p.tags) ? p.tags.join(',') : p.tags), normalize(p.product_type)].join(' ');
    // Category regex with word boundaries to avoid "dressy", "address"
    const re = {
      bag: /\b(bag|purse|clutch|handbag|tote|shoulder\s*bag)\b/i,
      shoes: /\b(heel|heels|shoe|shoes|sandal|sandals|pump|pumps|boot|boots)\b/i,
      jewelry: /\b(jewel(?:ry|lery)?|necklace|earring(?:s)?|bracelet|ring|pendant)\b/i,
      accessory: /\b(accessor(?:y|ies)|belt|scarf|shawl|headband|hair\s*clip)\b/i,
      dress: /\b(dress(?:es)?|gown(?:s)?|robe|robes)\b/i,
      jacket: /\b(jacket|jackets|coat|coats|parka|outerwear|puffer|blazer)\b/i,
      skirt: /\b(skirt|skirts)\b/i
    };
    if (re.bag.test(hay)) return 'bag';
    if (re.shoes.test(hay)) return 'shoes';
    if (re.jewelry.test(hay)) return 'jewelry';
    if (re.accessory.test(hay)) return 'accessory';
    if (re.jacket.test(hay)) return 'jacket';
    if (re.skirt.test(hay)) return 'skirt';
    if (re.dress.test(hay)) return 'dress';
    return '';
  };

  const candidates = [];
  for (const product of products) {
    // Strict gating by manual tags
    if (!hasThemeTagStrict(product)) continue;
    if (desiredCategory === 'dress' || !desiredCategory) {
      const hasAnyStrict = true; // we don't know across all products here; allow heuristic fallback if missing tag
      if (!(hasDressTagStrict(product) || (!hasAnyStrict && isDressHeuristic(product)))) continue;
    }
    if (desiredCategory === 'skirt') {
      if (!hasSkirtTagStrict(product)) continue;
    }
    // Category enforcement
    if (desiredCategory) {
      const cat = classifyProduct(product);
      const allowed = desiredCategory === 'accessory' ? ['accessory','bag','jewelry'] : [desiredCategory];
      // Exclude skirts when asking for dresses only
      if (desiredCategory === 'dress' && cat === 'skirt') continue;
      if (!allowed.includes(cat)) continue;
    }

    // Optional material hard filter
    if (!materialMatch(product)) continue;

    // No fuzzy theme enforcement; strict tag gating above controls theme

    let chosenVariant = null;
    let matchedColorTerm = '';
    if (canonicalColor) {
      const { variant, matchedTerm } = matchVariantByColor(product, canonicalColor);
      matchedColorTerm = matchedTerm;
      if (variant) {
        const vPrice = parseFloat(String(variant.price || '0').replace(/[^0-9.]/g,'')) || 0;
        if (!pricePassValue(vPrice)) continue;
        chosenVariant = variant;
      } else {
        // Require a real color match at product-level at least
        if (!matchedColorTerm) continue;
        const minPrice = lowestVariantPrice(product);
        if (!pricePassValue(minPrice)) continue;
      }
    } else {
      const minPrice = lowestVariantPrice(product);
      if (!pricePassValue(minPrice)) continue;
    }
    const s = scoreProduct(product, Boolean(chosenVariant));
    candidates.push({ product, score: s, chosenVariant, matchedColorTerm });
  }

  const bothRequested = Boolean(theme) && Boolean(canonicalColor);
  let list = candidates.sort((a,b)=>b.score-a.score);
  const limit = desiredCategory && desiredCategory !== 'dress' ? 8 : 4;
  if (bothRequested) {
    const strict = list.filter(x => x.score >= 5).slice(0, limit);
    list = strict.length >= 2 ? strict : list.filter(x => x.score >= 1).slice(0, limit);
  } else {
    list = list.filter(x => x.score >= 0).slice(0, limit);
  }

  if (list.length === 0) return '';

  // Prefer first image if present
  const grid = `
<div class="product-grid">
  ${list.map(({ product, chosenVariant }) => {
    let img = (product.images && product.images[0] && product.images[0].src) || '';
    if (chosenVariant && chosenVariant.image_id && Array.isArray(product.images)) {
      const hit = product.images.find(im => String(im.id) === String(chosenVariant.image_id));
      if (hit && hit.src) img = hit.src;
    }
    const price = chosenVariant ? chosenVariant.price : (product.variants?.[0]?.price || lowestVariantPrice(product) || '—');
    const href = `/products/${product.handle}`;
    return `<div class="product-card"><a href="${href}" target="_blank" rel="noopener"><img src="${img}" alt="${product.title}"/><div class="pc-title">${product.title}</div><div class="pc-price">$${price}</div></a></div>`;
  }).join('')}
</div>`;

  const displayColor = (colorFound || canonicalColor) ? (colorFound || canonicalColor) : '';
  const catLabel = desiredCategory && desiredCategory !== 'dress' ? ` ${desiredCategory}` : '';
  const header = lang==='fr'
    ? `Voici quelques${catLabel ? ` ${catLabel}` : ''} suggestions${displayColor ? ` en ${displayColor}` : ''}${selectedTheme ? ` pour ${selectedTheme.replace(/-/g,' ')}` : ''}:`
    : `Here are a few${catLabel ? ` ${catLabel}` : ''} picks${displayColor ? ` in ${displayColor}` : ''}${selectedTheme ? ` for ${selectedTheme.replace(/-/g,' ')}` : ''}:`;

  return `${header}\n${grid}`;
}

function formatActiveDiscounts(storeData, lang) {
  const rules = Array.isArray(storeData.discounts) ? storeData.discounts : [];
  if (rules.length === 0) return '';
  const items = rules.slice(0, 5).map(r => {
    const val = r.value_type === 'percentage' ? `${String(r.value).replace('-', '')}% off` : `$${r.value} off`;
    return `• ${r.title} — ${val}`;
  }).join('\n');
  return lang==='fr' ? `Promotions en cours:\n${items}` : `Current promotions:\n${items}`;
}

// Naive size advice generator from message and typical size charts
function buildSizeAdviceReply(storeData, message, lang) {
  const text = String(message).toLowerCase();

  // Helpers: unit parsing and conversion
  const toNumber = (v) => {
    const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
    return Number.isNaN(n) ? null : n;
  };

  const parseHeight = (t) => {
    // Formats: 170 cm, 1.65 m, 5'6, 5 ft 6 in
    let cm = null;
    const m = t.match(/(\d{1}\.\d{1,2})\s*m\b/);
    if (m) cm = Math.round(parseFloat(m[1]) * 100);
    const cmM = t.match(/(\d{2,3})\s*cm\b/);
    if (cmM) cm = parseInt(cmM[1], 10);
    const feetIn = t.match(/(\d)\s*(?:ft|foot|')\s*(\d{1,2})?\s*(?:in|"|inch|inches)?/);
    if (!cm && feetIn) {
      const ft = parseInt(feetIn[1], 10);
      const inch = feetIn[2] ? parseInt(feetIn[2], 10) : 0;
      cm = Math.round((ft * 12 + inch) * 2.54);
    }
    return cm;
  };

  const parseWeight = (t) => {
    // Formats: 60 kg, 132 lb/lbs
    const kgM = t.match(/(\d{2,3})\s*(kg|kgs|kilograms)\b/);
    if (kgM) return parseInt(kgM[1], 10);
    const lbM = t.match(/(\d{2,3})\s*(lb|lbs|pounds?)\b/);
    if (lbM) return Math.round(parseInt(lbM[1], 10) * 0.453592);
    return null;
  };

  const parseTriad = (t) => {
    // 88/70/95 (cm) or 34-27-38 (in)
    const tri = t.match(/(\d{2,3})\s*[\/\-]\s*(\d{2,3})\s*[\/\-]\s*(\d{2,3})/);
    if (!tri) return { bust: null, waist: null, hip: null };
    let b = parseInt(tri[1], 10), w = parseInt(tri[2], 10), h = parseInt(tri[3], 10);
    // Heuristic: assume inches if typical inch ranges
    const likelyInches = b < 60 && w < 60 && h < 60;
    if (likelyInches) {
      b = Math.round(b * 2.54); w = Math.round(w * 2.54); h = Math.round(h * 2.54);
    }
    return { bust: b, waist: w, hip: h };
  };

  // Parse inputs
  let { bust, waist, hip } = parseTriad(text);
  const labels = {
    bust: text.match(/\b(bust|chest)\s*(?:is|=|:)?\s*(\d{2,3})\b/),
    waist: text.match(/\b(waist)\s*(?:is|=|:)?\s*(\d{2,3})\b/),
    hip: text.match(/\b(hip|hips)\s*(?:is|=|:)?\s*(\d{2,3})\b/)
  };
  if (!bust && labels.bust) bust = parseInt(labels.bust[2], 10);
  if (!waist && labels.waist) waist = parseInt(labels.waist[2], 10);
  if (!hip && labels.hip) hip = parseInt(labels.hip[2], 10);

  const heightCm = parseHeight(text);
  const weightKg = parseWeight(text);

  // Suggest size with layered heuristics
  const suggestByBWH = () => {
    if (!(bust && waist && hip)) return '';
    if (bust < 86 && waist < 66 && hip < 90) return 'XS';
    if (bust < 92 && waist < 72 && hip < 96) return 'S';
    if (bust < 98 && waist < 78 && hip < 102) return 'M';
    if (bust < 104 && waist < 84 && hip < 108) return 'L';
    return 'XL or above';
  };

  const suggestByHW = () => {
    if (!(heightCm && weightKg)) return '';
    // Rough BMI-based split
    const bmi = weightKg / Math.pow(heightCm / 100, 2);
    if (bmi < 20.5) return 'S';
    if (bmi < 24.5) return 'M';
    if (bmi < 28.5) return 'L';
    return 'XL';
  };

  const size = suggestByBWH() || suggestByHW();
  if (!size) return '';

  const note = lang==='fr'
    ? `Conseil taille: ${size}. ${heightCm ? `Taille: ${heightCm} cm. ` : ''}${weightKg ? `Poids: ${weightKg} kg. ` : ''}${bust ? `Tour de poitrine: ${bust} cm. ` : ''}${waist ? `Taille: ${waist} cm. ` : ''}${hip ? `Hanches: ${hip} cm. ` : ''}Vérifiez aussi le guide des tailles du produit.`
    : `Size tip: ${size}. ${heightCm ? `Height: ${heightCm} cm. ` : ''}${weightKg ? `Weight: ${weightKg} kg. ` : ''}${bust ? `Bust: ${bust} cm. ` : ''}${waist ? `Waist: ${waist} cm. ` : ''}${hip ? `Hip: ${hip} cm. ` : ''}Please also check the product’s size guide.`;
  return note.trim();
}

// Simple shipping ETA inference
function buildShippingEtaReply(lowerMsg, lang) {
  const text = String(lowerMsg);

  // Extract destination phrases: "to X", "in X", "ship to X"
  const toMatch = text.match(/\b(?:to|in|vers|pour)\s+([a-z ,'-]{2,60})/i);
  const placeRaw = toMatch ? toMatch[1].trim() : '';
  const place = placeRaw.replace(/[^a-z ,'-]/ig,'').toLowerCase();

  const inSet = (s, arr) => arr.some(x => s.includes(x));
  const CA = ['canada','ontario','toronto','ottawa','montreal','quebec','bc','british columbia','vancouver','alberta','calgary','edmonton','manitoba','winnipeg'];
  const US = ['usa','united states','u.s.','new york','california','texas','florida','los angeles','chicago','nyc'];
  const UK = ['uk','united kingdom','england','london','manchester','scotland','wales'];
  const EU = ['france','germany','spain','italy','portugal','netherlands','belgium','austria','sweden','finland','denmark','ireland','poland','greece','europe'];
  const AU = ['australia','sydney','melbourne','new zealand','auckland','nz'];
  const ME = ['uae','dubai','saudi','riyadh','qatar','doha','kuwait','bahrain'];
  const AS = ['japan','tokyo','china','shanghai','hong kong','singapore','malaysia','korea','seoul','india','mumbai','delhi','bangkok','thailand','vietnam'];
  const AF = ['nigeria','lagos','ghana','accra','kenya','nairobi','south africa','johannesburg','egypt','cairo'];
  const LATAM = ['mexico','brazil','argentina','chile','colombia','peru'];

  const pick = () => {
    if (place && inSet(place, CA)) return 'CA';
    if (place && inSet(place, US)) return 'US';
    if (place && (inSet(place, UK) || inSet(place, EU))) return 'EU';
    if (place && inSet(place, AU)) return 'AU';
    if (place && inSet(place, ME)) return 'ME';
    if (place && inSet(place, AS)) return 'AS';
    if (place && inSet(place, AF)) return 'AF';
    if (place && inSet(place, LATAM)) return 'LATAM';
    return '';
  };

  const zone = pick();
  const byZone = {
    CA: { en: 'Shipping to Canada', fr: 'Livraison vers le Canada', eta: '3–7 business days after 1–3 days processing' },
    US: { en: 'Shipping to the USA', fr: 'Livraison vers les USA', eta: '5–10 business days after 1–3 days processing' },
    EU: { en: 'Shipping to the UK/EU', fr: "Livraison vers le Royaume‑Uni/UE", eta: '7–14 business days after 1–3 days processing' },
    AU: { en: 'Shipping to Australia/NZ', fr: 'Livraison vers Australie/NZ', eta: '7–15 business days after 1–3 days processing' },
    ME: { en: 'Shipping to Middle East', fr: 'Livraison vers le Moyen‑Orient', eta: '7–15 business days after 1–3 days processing' },
    AS: { en: 'Shipping to Asia', fr: 'Livraison vers l’Asie', eta: '7–15 business days after 1–3 days processing' },
    AF: { en: 'Shipping to Africa', fr: 'Livraison vers l’Afrique', eta: '10–20 business days after 1–3 days processing' },
    LATAM: { en: 'Shipping to Latin America', fr: "Livraison vers l’Amérique latine", eta: '10–20 business days after 1–3 days processing' }
  };

  if (zone) {
    const hdr = lang==='fr' ? byZone[zone].fr : byZone[zone].en;
    const eta = byZone[zone].eta;
    return `${hdr}${place ? ` (${placeRaw})` : ''}: ${eta}. ${lang==='fr' ? "Suivi fourni après l’expédition." : "Tracking provided after shipment."}`;
  }

  // Generic
  return lang==='fr'
    ? "Délais typiques: Canada 3–7 j, USA 5–10 j, UK/UE 7–14 j, Australie/NZ 7–15 j (après 1–3 j de traitement)."
    : "Typical ETAs: Canada 3–7 days, USA 5–10, UK/EU 7–14, Australia/NZ 7–15 (after 1–3 days processing).";
}

// Parse order tracking from message (email or order number)
async function trackOrderFromMessage(lower) {
  try {
    const axios = require('axios');
    const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_API_TOKEN || process.env.SHOPIFY_ADMIN_API;
    if (!shopifyDomain || !token) return null;

    const formatOrder = (ord) => {
      const name = ord.name || `#${ord.order_number}`;
      const fin = ord.financial_status || 'unknown';
      const ful = ord.fulfillment_status || 'unfulfilled';
      const updated = ord.updated_at;
      let trackingLine = '';
      const f = (ord.fulfillments || []).find(ff => ff.tracking_number || (ff.tracking_numbers && ff.tracking_numbers.length));
      if (f) {
        const tn = f.tracking_number || f.tracking_numbers?.[0];
        const tc = f.tracking_company || 'carrier';
        const tu = f.tracking_url || (f.tracking_urls && f.tracking_urls[0]);
        trackingLine = tn ? `\nTracking: ${tn} (${tc})${tu ? ` – ${tu}` : ''}` : '';
      }
      return { reply: `Order ${name}: fulfillment ${ful}, financial ${fin}. Last update: ${updated}.${trackingLine}` };
    };

    // order number like #1234 or 12345
    const numMatch = lower.match(/(?:order\s*#?|#)(\d{3,7})|\b(\d{5,8})\b/);
    const orderNumber = numMatch ? (numMatch[1] || numMatch[2]) : null;
    if (orderNumber) {
      const url = `https://${shopifyDomain}/admin/api/2024-01/orders.json?name=${encodeURIComponent('#'+orderNumber)}&status=any&limit=1`;
      const { data } = await axios.get(url, { headers: { 'X-Shopify-Access-Token': token }});
      const ord = data.orders?.[0];
      if (ord) return formatOrder(ord);
    }

    const emailMatch = lower.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
    if (emailMatch) {
      const url = `https://${shopifyDomain}/admin/api/2024-01/orders.json?email=${encodeURIComponent(emailMatch[0])}&order=created_at+desc&status=any&limit=1`;
      const { data } = await axios.get(url, { headers: { 'X-Shopify-Access-Token': token }});
      const ord = data.orders?.[0];
      if (ord) return formatOrder(ord);
    }

    // tracking number heuristic
    const trackMatch = lower.match(/\b([A-Za-z0-9]{8,20})\b/);
    if (trackMatch) {
      const tn = trackMatch[1];
      const url = `https://${shopifyDomain}/admin/api/2024-01/orders.json?status=any&limit=50&fields=id,name,order_number,updated_at,financial_status,fulfillment_status,fulfillments`;
      const { data } = await axios.get(url, { headers: { 'X-Shopify-Access-Token': token }});
      const ord = (data.orders || []).find(o => (o.fulfillments || []).some(ff => (ff.tracking_number && ff.tracking_number.includes(tn)) || (ff.tracking_numbers || []).some(x => x && x.includes(tn))));
      if (ord) return formatOrder(ord);
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
