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

    // 8b. Shipping ETA (country/city-aware) before generic policies
    if (/(ship|shipping|deliver|delivery|arrive|receive)/i.test(lower)) {
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

    // 8d. Size advice
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
    ? `Tu es JUN'S AI – un assistant mode francophone expert pour la boutique de robes JUN'S.\nN'utilise que les produits, réductions, pages et politiques fournis dans le contexte ci-dessous. Si l'information n'est pas présente, dis-le et propose d'aider autrement.`
    : `You are JUN'S AI – a fashion-savvy AI assistant for the JUN'S dress store.\nOnly use products, discounts, pages and policies provided in the context below. If the information is not present, say so and offer alternatives.`;

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
    ? `\n\nInstructions:\n- Réponds en français de manière professionnelle et amicale\n- Utilise le contexte de la conversation si pertinent\n- Suggère des produits spécifiques provenant de la liste ci-dessus uniquement\n- Mentionne les réductions disponibles si applicable\n- Si l'information n'est pas disponible, dis-le clairement et propose des alternatives ou options générales liées aux achats (livraison, retours, tailles)\n- Évite les excuses répétitives; sois précis et concis (3–5 phrases max)`
    : `\n\nInstructions:\n- Respond professionally and warmly\n- Use conversation context if relevant\n- Suggest specific products strictly from the list above\n- Mention available discounts if applicable\n- If info isn't available, say so clearly and offer helpful shopping guidance (shipping, returns, sizing)\n- Avoid repetitive disclaimers; be precise and concise (3–5 sentences max)`;

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
  const colors = ['red','blue','green','black','white','ivory','cream','gold','silver','pink','purple','yellow','beige','brown','orange','navy','burgundy'];
  const color = colors.find(c => new RegExp(`\\b${c}\\b`, 'i').test(text));
  const priceUnder = (() => {
    const m = text.match(/under\s*\$?\s*(\d{2,4})/i) || text.match(/below\s*\$?\s*(\d{2,4})/i);
    return m ? parseFloat(m[1]) : null;
  })();
  const themeMatch = text.match(/(wedding|gala|night\s*out|office|business|casual|birthday|cocktail|graduation)/i);
  const theme = themeMatch ? themeMatch[1].toLowerCase().replace(/\s+/g,'-') : '';

  const needles = [];
  if (color) needles.push(color);
  if (theme) needles.push(theme, theme.replace(/-/g,' '));
  const wantRecommend = /(recommend|suggest|show|looking|ideas?|best|bestsellers?|options?)/i.test(text) || needles.length > 0;
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

  function matchesNeedles(p) {
    const title = normalize(p.title);
    const handle = normalize(p.handle);
    const body = normalize(p.body_html);
    const tags = Array.isArray(p.tags) ? p.tags.map(t => normalize(t)) : String(p.tags || '').split(',').map(t => normalize(t.trim()));
    const hay = [title, handle, body, tags.join(' ')].join(' ');
    return needles.length === 0 ? true : needles.some(n => n && hay.includes(n));
  }

  let list = products.filter(p => matchesNeedles(p));
  if (priceUnder !== null) list = list.filter(p => lowestVariantPrice(p) <= priceUnder);
  // simple relevance: prefer items whose tags/title include color/theme first
  list = list.sort((a,b) => {
    const aScore = (needles.filter(n => normalize(a.title).includes(n)).length) + (needles.filter(n => String(a.tags||'').toLowerCase().includes(n)).length);
    const bScore = (needles.filter(n => normalize(b.title).includes(n)).length) + (needles.filter(n => String(b.tags||'').toLowerCase().includes(n)).length);
    return bScore - aScore;
  }).slice(0, 3);

  if (list.length === 0) return '';

  const lines = list.map(p => {
    const price = p.variants?.[0]?.price || lowestVariantPrice(p) || '—';
    return `• ${p.title} — $${price} → /products/${p.handle}`;
  }).join('\n');

  return lang==='fr'
    ? `Voici quelques suggestions${color ? ` en ${color}` : ''}${theme ? ` pour ${theme.replace(/-/g,' ')}` : ''}:\n${lines}`
    : `Here are a few picks${color ? ` in ${color}` : ''}${theme ? ` for ${theme.replace(/-/g,' ')}` : ''}:\n${lines}`;
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
