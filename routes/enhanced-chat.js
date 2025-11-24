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

    // 3. Track user message and extract preferences
    await session.addMessage(currentSessionId, message, true);
    await session.extractPreferences(currentSessionId, message);
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

    // 7. Get conversation context for AI (increased from 8 to 20 messages for better context)
    const conversationContext = await session.getConversationContext(currentSessionId, 20);

    // Build follow-up anchors (last intent/policy/products) to help the LLM resolve pronouns
    let conversationContextExtended = conversationContext;
    let isFollowUpQuestion = false;
    try {
      const s = await session.getSession(currentSessionId);
      const lastIntent = s?.context?.currentIntent || '';
      const lastPolicy = s?.context?.lastPolicyKind || '';
      const lastRecs = Array.isArray(s?.context?.lastRecommendations) ? s.context.lastRecommendations.slice(0, 4) : [];
      const names = lastRecs.map(r => r.title || r.handle).filter(Boolean).join(', ');
      
      // Detect if this is a follow-up question (pronouns, "this", "that", "it", "more", "another", etc.)
      const followUpIndicators = /\b(it|this|that|one|those|them|the|first|second|third|fourth|above|mentioned|previous|earlier|before|same|also|too|as well)\b/i;
      const moreIndicators = /\b(more|another|others|other|different|alternatives|alternate|plus|encore|additional|extra|further|next|another one|more options|more samples|show me more|give me more|recommend more|suggest more|any other|any others)\b/i;
      const hasPronouns = followUpIndicators.test(message);
      const wantsMore = moreIndicators.test(message);
      const hasLastContext = lastIntent || lastRecs.length > 0 || s?.context?.lastSearchContext;
      isFollowUpQuestion = (hasPronouns || wantsMore) && hasLastContext && s.messages.length > 2; // More than just initial greeting
      
      const anchors = `\nFOLLOW-UP ANCHORS:\n- Last intent: ${lastIntent || 'n/a'}${lastPolicy ? ` (${lastPolicy})` : ''}\n- Last products: ${names || 'n/a'}\n- Is follow-up: ${isFollowUpQuestion ? 'yes' : 'no'}`;
      conversationContextExtended = conversationContext + anchors;
    } catch (_) {}

    // Helper: light HTML -> text sanitizer
    const stripHtml = (html) => String(html || '')
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

    // 8. Shortcut handlers for well-known intents before LLM
    // IMPORTANT: Skip keyword handlers if this is a follow-up question to maintain conversation context
    const lower = message.toLowerCase();
    
    // Only run keyword handlers if NOT a follow-up question (to preserve conversation flow)
    if (!isFollowUpQuestion) {
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
        const linkHtml = info.link ? (lang==='fr' ? `\nLien de suivi: <a href="${info.link}" target="_blank" rel="noopener">ouvrir le suivi</a>` : `\nTracking link: <a href="${info.link}" target="_blank" rel="noopener">open tracking</a>`) : '';
        const reply = lang==='fr'
          ? `Statut: ${info.status}${info.courier ? ` | Transporteur: ${info.courier}` : ''}${info.last_update ? ` | Dernière mise à jour: ${info.last_update}` : ''}${info.checkpoint ? `\nDernier point: ${info.checkpoint}` : ''}${linkHtml}`
          : `Status: ${info.status}${info.courier ? ` | Carrier: ${info.courier}` : ''}${info.last_update ? ` | Last update: ${info.last_update}` : ''}${info.checkpoint ? `\nLast checkpoint: ${info.checkpoint}` : ''}${linkHtml}`;
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
        // Track last policy kind in session for follow-ups
        try {
          let lastPolicyKind = '';
          if (/shipping|delivery/i.test(lower)) lastPolicyKind = 'shipping';
          else if (/refund|return|exchange/i.test(lower)) lastPolicyKind = 'returns';
          else if (/privacy/i.test(lower)) lastPolicyKind = 'privacy';
          if (lastPolicyKind) {
            await session.updateContext(currentSessionId, { lastPolicyKind });
          }
        } catch (_) {}
        return res.json({ reply: policiesReply, intent: 'return_exchange', confidence: 0.9, sessionId: currentSessionId, escalation: { required: false } });
      }
    }

    // 8d. Size advice (also trigger on raw measurements like "168 cm, 60 kg, 88/70/95")
    const measurementLike = /(\d{2,3}\s*cm)|(\d{2,3}\s*(kg|lb|lbs))|(\b\d\s*(?:ft|foot|')\s*\d{1,2}\b)|(\b\d{2,3}\s*[\/\-]\s*\d{2,3}\s*[\/\-]\s*\d{2,3}\b)/i;
    // More specific size patterns to avoid matching "outfit" -> "fit"
    const sizePattern = /\b(size|sizing|measurement|measure|waist|hip|bust|height|weight|fit\s+(guide|chart|help|advice))\b/i;
    if (sizePattern.test(lower) || measurementLike.test(lower) || /\b(propose|recommend|suggest)\b.*\b(size)\b/i.test(lower)) {
      const sizeAdvice = buildSizeAdviceReply(storeData, message, lang);
      const defaultGuidance = lang==='fr'
        ? "Sans mesures, voici un repère général: XS <86/66/90, S <92/72/96, M <98/78/102, L <104/84/108, XL au‑dessus. Si vous partagez votre taille/poids/mesures (poitrine/taille/hanches), je peux affiner."
        : "Without measurements, here's a general guide: XS <86/66/90, S <92/72/96, M <98/78/102, L <104/84/108, XL above. If you share height/weight/measurements (bust/waist/hip), I can refine.";
      const replySize = sizeAdvice || defaultGuidance;
      await session.addMessage(currentSessionId, replySize, false);
      await analytics.trackMessage(currentSessionId, replySize, false);
      return res.json({ reply: replySize, intent: 'size_help', confidence: sizeAdvice ? 0.85 : 0.75, sessionId: currentSessionId, escalation: { required: false } });
    }

  // 8e. Named product availability/variant follow-up (semantic, catalog-wide)
    const availabilityLike = /(available|in\s*stock|do\s*you\s*have|have\s*it|stock)/i.test(lower);
    if (availabilityLike) {
      const products = Array.isArray(storeData.products) ? storeData.products : [];
      const colorTerms = ['red','blue','green','black','white','pink','purple','gold','silver','beige','yellow','orange','brown','grey','gray','navy','ivory','cream'];
      const colorMention = (() => {
        const m = lower.match(new RegExp(`\\b(${colorTerms.join('|')})\\b`, 'i'));
        return m ? m[1].toLowerCase() : '';
      })();
      const tokens = lower.replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(t => t && t.length > 2 && !['available','stock','color','white','black','blue','green','pink','purple','gold','silver','beige','yellow','orange','brown','grey','gray','have','you','this','that','in','is','are','the','for','dress','robe','gown','silk','satin'].includes(t));
      const scoreProductByTokens = (p) => {
        const hay = [String(p.title||'').toLowerCase(), String(p.handle||'').toLowerCase()].join(' ');
        let s = 0;
        for (const t of tokens) { if (hay.includes(t)) s += 1; }
        return s;
      };
      let best = null, bestScore = 0;
      for (const p of products) {
        const sc = scoreProductByTokens(p);
        if (sc > bestScore) { best = p; bestScore = sc; }
      }
      if (best && bestScore >= 1) {
        const options = Array.isArray(best.options) ? best.options : [];
        const variants = Array.isArray(best.variants) ? best.variants : [];
        const colorIdx = options.findIndex(o => /color|colour|couleur/i.test(String(o?.name || '')));
        const sizeIdx  = options.findIndex(o => /size|taille/i.test(String(o?.name || '')));
        const collect = (idx) => {
          if (idx < 0) return [];
          const set = new Set();
          for (const v of variants) {
            const val = String(v[`option${idx+1}`] || '').trim();
            if (val) set.add(val);
          }
          return Array.from(set);
        };
        const colors = collect(colorIdx);
        const sizes  = collect(sizeIdx);
        const isVariantAvailable = (v) => (typeof v.available === 'boolean' ? v.available : (typeof v.inventory_quantity === 'number' ? v.inventory_quantity > 0 : true));
        let replyAvail = '';
        if (colorMention) {
          // try to find a variant for the requested color
          const hit = variants.find(v => {
            const val = colorIdx >= 0 ? String(v[`option${colorIdx+1}`]||'').toLowerCase() : String(v.title||'').toLowerCase();
            return val.includes(colorMention);
          });
          if (hit) {
            const ok = isVariantAvailable(hit);
            replyAvail = lang==='fr'
              ? `${best.title} en ${colorMention} est ${ok ? 'disponible' : 'actuellement indisponible'}.`
              : `${best.title} in ${colorMention} is ${ok ? 'available' : 'currently unavailable'}.`;
          } else if (colors.length) {
            replyAvail = lang==='fr'
              ? `Je n'ai pas trouvé ${best.title} en ${colorMention}. Couleurs disponibles: ${colors.join(', ')}.`
              : `I didn't find ${best.title} in ${colorMention}. Available colors: ${colors.join(', ')}.`;
          }
        }
        if (!replyAvail) {
          const anyAvailable = variants.some(isVariantAvailable);
          replyAvail = lang==='fr'
            ? `${best.title} est ${anyAvailable ? 'en stock' : 'actuellement en rupture'}.${colors.length ? ` Couleurs: ${colors.join(', ')}.` : ''}${sizes.length ? ` Tailles: ${sizes.join(', ')}.` : ''}`
            : `${best.title} is ${anyAvailable ? 'in stock' : 'currently out of stock'}.${colors.length ? ` Colors: ${colors.join(', ')}.` : ''}${sizes.length ? ` Sizes: ${sizes.join(', ')}.` : ''}`;
        }
        await session.addMessage(currentSessionId, replyAvail, false);
        await analytics.trackMessage(currentSessionId, replyAvail, false);
        return res.json({ reply: replyAvail, intent: 'product_inquiry', confidence: 0.88, sessionId: currentSessionId, escalation: { required: false } });
      }
    }

    // 8e. Product discovery (colors, themes, budget cues) before LLM
    // ALWAYS trigger product discovery if user asks for dresses/products/recommendations
    const hasLastRecs = (await session.getLastRecommendations(currentSessionId)).length > 0;
    const lastSearchContext = await session.getLastSearchContext(currentSessionId);
    const looksLikeFollowUp = /(first|second|third|fourth|this|that|it|those|them)\b/i.test(lower)
      || /(what|which)\s+(color|colors|colour|colours)\b|\bavailable\s+colors?\b/i.test(lower)
      || /(what|which)\s+(size|sizes)\b|\bavailable\s+sizes?\b/i.test(lower)
      || /(how\s+much|price|cost|\$\s*\??)\b/i.test(lower)
      || /(in\s*stock|available\s+now|availability|is\s+it\s+available)/i.test(lower)
      || /(material|fabric|made\s+of|composition)/i.test(lower)
      || /(length|how\s+long|mini|midi|maxi|knee\s*length|floor\s*length)/i.test(lower)
      || /(link|url|page|open\s+it|show\s+me\s+it|where\s+to\s+buy)/i.test(lower);

    // Detect product/dress requests - ALWAYS show in card format
    const wantsProducts = /(show|recommend|suggest|find|looking|need|want|search|browse|see|display|give me|help me find|what.*have|what.*available|dress|dresses|gown|gowns|robe|robes|jacket|jackets|coat|coats|skirt|skirts|bag|bags|shoes|heels|accessories|products|items|clothing|clothes|fashion|outfit|outfits|look|looks|style|styles|ensemble)/i.test(lower);
    
    // Detect "more" requests - use last search context instead of parsing message
    const wantsMore = /(more|another|others|other|different|alternatives|alternate|plus|encore|additional|extra|further|next|another one|more options|more samples|show me more|give me more|recommend more|suggest more|any other|any others)\b/i.test(lower);
    
    let productDiscovery = '';
    let searchContextToStore = null;
    
    console.log(`🔍 Product request check - wantsProducts: ${wantsProducts}, wantsMore: ${wantsMore}, hasLastRecs: ${hasLastRecs}, looksLikeFollowUp: ${looksLikeFollowUp}`);
    
    if (wantsMore && lastSearchContext) {
      // User wants more of the same - use stored search context
      console.log(`🔄 "More" request detected - using last search context:`, lastSearchContext);
      const excludeHandles = await session.getSeenRecommendations(currentSessionId);
      // Reconstruct the search using stored context
      productDiscovery = handleProductDiscovery(
        storeData, 
        '', // Empty message since we're using stored context
        lang, 
        { 
          excludeHandles,
          useStoredContext: lastSearchContext // Pass stored context
        }
      );
      console.log(`📦 Product discovery result (more): ${productDiscovery ? 'Found products' : 'No products'}`);
    } else if (wantsProducts) {
      // User wants products/dresses - ALWAYS show in card format (removed restrictive condition)
      console.log(`🛍️ Product request detected - triggering product discovery`);
      let excludeHandles = [];
      if (hasLastRecs && !looksLikeFollowUp) {
        // Only exclude if it's NOT a follow-up question about attributes
        try { excludeHandles = (await session.getLastRecommendations(currentSessionId)).map(r=>r.handle); } catch(_) {}
      }
      productDiscovery = handleProductDiscovery(storeData, message, lang, { excludeHandles });
      console.log(`📦 Product discovery result: ${productDiscovery ? `Found ${(productDiscovery.match(/product-card/g) || []).length} products` : 'No products'}`);
      if (!productDiscovery) {
        console.log(`⚠️ No products found for: "${message}"`);
      }
    }
    if (productDiscovery) {
      // Capture product handles from the HTML grid so follow-up questions like
      // "what colors does this dress come in" can be resolved
      try {
        const handleMatches = Array.from(productDiscovery.matchAll(/href=\"\/products\/([^\"\/]+)\"/g)).map(m => m[1]);
        const recs = (Array.isArray(handleMatches) ? handleMatches : []).map(h => {
          const p = (storeData.products || []).find(pp => String(pp.handle) === String(h));
          return p ? { id: p.id, handle: p.handle, title: p.title } : { id: null, handle: h, title: '' };
        });
        if (recs.length) {
          await session.setLastRecommendations(currentSessionId, recs);
        }
        
        // Store search context for "more" requests (only if not using stored context)
        if (!wantsMore || !lastSearchContext) {
          // Extract search context from the current search
          const searchContext = extractSearchContext(message, storeData);
          if (searchContext) {
            await session.setLastSearchContext(currentSessionId, searchContext);
            console.log(`💾 Stored search context:`, searchContext);
          }
        }
      } catch (_) {}
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

    // Follow-up handler: attribute questions about last recommended products
    const followUpColor = /(what|which)\s+(color|colors|colour|colours)\b|\bavailable\s+colors?\b|\bin\s+(red|blue|green|black|white|pink|purple|gold|silver|beige|yellow|orange|brown|grey|gray)\b/i.test(lower);
    const followUpSize  = /(what|which)\s+(size|sizes)\b|\bavailable\s+sizes?\b/i.test(lower);
    const followUpPrice = /(how\s+much|price|cost|\$\s*\??)\b/i.test(lower);
    const followUpStock = /(in\s*stock|available\s+now|availability|is\s+it\s+available)/i.test(lower);
    const followUpMaterial = /(material|fabric|made\s+of|composition)/i.test(lower);
    const followUpLength = /(length|how\s+long|mini|midi|maxi|knee\s*length|floor\s*length)/i.test(lower);
    const followUpLink = /(link|url|page|open\s+it|show\s+me\s+it|where\s+to\s+buy)/i.test(lower);
    const anyProductFU = followUpColor || followUpSize || followUpPrice || followUpStock || followUpMaterial || followUpLength || followUpLink;
    if (anyProductFU) {
      const lastRecs = await session.getLastRecommendations(currentSessionId);
      const products = Array.isArray(storeData.products) ? storeData.products : [];
      const byHandle = (h) => products.find(p => String(p.handle) === String(h));
      const ord = (() => {
        if (/\bfirst\b/i.test(lower)) return 0;
        if (/\bsecond\b/i.test(lower)) return 1;
        if (/\bthird\b/i.test(lower)) return 2;
        if (/\bfourth\b/i.test(lower)) return 3;
        return -1;
      })();
      const explicitNameHit = (() => {
        for (const r of lastRecs) {
          if (!r || !r.title) continue;
          const t = String(r.title).toLowerCase();
          if (t && lower.includes(t.split(' ').slice(0,2).join(' '))) return r;
        }
        return null;
      })();
      let target = null;
      if (explicitNameHit) target = explicitNameHit;
      else if (ord >= 0 && lastRecs[ord]) target = lastRecs[ord];
      else if (lastRecs.length === 1) target = lastRecs[0];

      if (!target) {
        if (lastRecs.length > 1) {
          const options = lastRecs.map((r, i) => `${i+1}. ${r.title || r.handle}`).slice(0,5).join('\n');
          const ask = lang==='fr'
            ? `Parlez-vous de l'un de ces produits? Répondez par "premier", "deuxième", etc.\n${options}`
            : `Are you asking about one of these products? Reply with "first", "second", etc.\n${options}`;
          await session.addMessage(currentSessionId, ask, false);
          await analytics.trackMessage(currentSessionId, ask, false);
          return res.json({ reply: ask, intent: 'product_inquiry', confidence: 0.8, sessionId: currentSessionId, escalation: { required: false } });
        }
      }

      if (target) {
        const full = byHandle(target.handle) || {};
        const options = Array.isArray(full.options) ? full.options : [];
        const variants = Array.isArray(full.variants) ? full.variants : [];
        const colorIdx = options.findIndex(o => /color|colour|couleur/i.test(String(o?.name || '')));
        const sizeIdx  = options.findIndex(o => /size|taille/i.test(String(o?.name || '')));
        const collect = (idx) => {
          if (idx < 0) return [];
          const set = new Set();
          for (const v of variants) {
            const val = String(v[`option${idx+1}`] || '').trim();
            if (val) set.add(val);
          }
          return Array.from(set);
        };
        const colors = collect(colorIdx);
        const sizes  = collect(sizeIdx);
        let replyFU = '';
        if (followUpColor && colors.length) {
          replyFU = lang==='fr'
            ? `Couleurs disponibles pour ${full.title || 'cet article'}: ${colors.join(', ')}.`
            : `Available colors for ${full.title || 'this item'}: ${colors.join(', ')}.`;
        }
        if (!replyFU && followUpSize && sizes.length) {
          replyFU = lang==='fr'
            ? `Tailles disponibles pour ${full.title || 'cet article'}: ${sizes.join(', ')}.`
            : `Available sizes for ${full.title || 'this item'}: ${sizes.join(', ')}.`;
        }
        if (!replyFU && followUpPrice) {
          const numbers = variants.map(v => parseFloat(String(v.price || '0').replace(/[^0-9.]/g,''))).filter(n => !Number.isNaN(n));
          const min = numbers.length ? Math.min(...numbers) : (full.variants?.[0]?.price || null);
          const max = numbers.length ? Math.max(...numbers) : null;
          const range = min !== null ? (max && max !== min ? `$${min.toFixed(2)} – $${max.toFixed(2)}` : `$${parseFloat(min).toFixed(2)}`) : '—';
          replyFU = lang==='fr'
            ? `Prix pour ${full.title || 'cet article'}: ${range}.`
            : `Price for ${full.title || 'this item'}: ${range}.`;
        }
        if (!replyFU && followUpStock) {
          const available = variants.some(v => (typeof v.available === 'boolean' ? v.available : (typeof v.inventory_quantity === 'number' ? v.inventory_quantity > 0 : true)));
          replyFU = lang==='fr'
            ? `${full.title || 'Cet article'} est ${available ? 'en stock' : 'actuellement en rupture'}${available ? '' : ' (certaines options peuvent revenir bientôt)'}.`
            : `${full.title || 'This item'} is ${available ? 'in stock' : 'currently out of stock'}${available ? '' : ' (some options may restock soon)'}.`;
        }
        if (!replyFU && followUpMaterial) {
          const hay = [String(full.body_html||'').replace(/<[^>]+>/g,' ').toLowerCase(), String(full.tags||'').toLowerCase(), String(full.title||'').toLowerCase()].join(' ');
          const mats = ['satin','silk','cotton','linen','wool','cashmere','denim','chiffon','lace','polyester','spandex','elastane','viscose','rayon','nylon','velvet','sequin'];
          const found = mats.filter(m => new RegExp(`\\b${m}\\b`).test(hay));
          replyFU = found.length
            ? (lang==='fr' ? `Matières: ${found.join(', ')}.` : `Materials: ${found.join(', ')}.`)
            : (lang==='fr' ? `La matière n'est pas précisée. Souhaitez‑vous que je vérifie un modèle précis?` : `Material not specified. Want me to check a specific model?`);
        }
        if (!replyFU && followUpLength) {
          const tags = Array.isArray(full.tags) ? full.tags.map(t => String(t).toLowerCase()) : String(full.tags||'').toLowerCase().split(',').map(t=>t.trim());
          const label = tags.includes('mini') ? 'mini' : tags.includes('midi') ? 'midi' : (tags.includes('maxi') ? 'maxi' : '');
          replyFU = label
            ? (lang==='fr' ? `Longueur: ${label}.` : `Length: ${label}.`)
            : (lang==='fr' ? `La longueur n'est pas précisée, mais d'après les photos cela semble ${/mini|midi|maxi/i.test(String(full.body_html||'')) ? 'être mentionné dans la description' : 'être approximatif'}.` : `Length not explicitly tagged; please check the product photos/description.`);
        }
        if (!replyFU && followUpLink) {
          const url = `/products/${target.handle}`;
          replyFU = lang==='fr' ? `Voici la page du produit: ${url}` : `Here is the product page: ${url}`;
        }
        if (replyFU) {
          await session.addMessage(currentSessionId, replyFU, false);
          await analytics.trackMessage(currentSessionId, replyFU, false);
          return res.json({ reply: replyFU, intent: 'product_inquiry', confidence: 0.9, sessionId: currentSessionId, escalation: { required: false } });
        }
      }

      // If we couldn't resolve locally, let LLM answer with the context we have
    }
    } // End of !isFollowUpQuestion check

    // Pronoun-based follow-up router using last intent
    const pronounish = /(it|this|that|one|those|them)\b/i.test(lower);
    if (pronounish) {
      try {
        const s = await session.getSession(currentSessionId);
        const lastIntent = s?.context?.currentIntent || '';
        const lastPolicy = s?.context?.lastPolicyKind || '';
        if (lastIntent === 'shipping_info') {
          const eta = buildShippingEtaReply(lower + ' shipping', lang);
          if (eta) {
            await session.addMessage(currentSessionId, eta, false);
            await analytics.trackMessage(currentSessionId, eta, false);
            return res.json({ reply: eta, intent: 'shipping_info', confidence: 0.85, sessionId: currentSessionId, escalation: { required: false } });
          }
        }
        if (lastIntent === 'return_exchange') {
          const kind = lastPolicy || 'returns';
          const reply = await (async () => {
            if (kind === 'shipping') return formatPolicyResponse('shipping', basicSanitize(storeData?.policies?.shipping_policy?.body || ''), lang);
            if (kind === 'privacy') return formatPolicyResponse('privacy', basicSanitize(storeData?.policies?.privacy_policy?.body || ''), lang);
            return formatPolicyResponse('returns', basicSanitize(storeData?.policies?.refund_policy?.body || ''), lang);
          })();
          if (reply) {
            await session.addMessage(currentSessionId, reply, false);
            await analytics.trackMessage(currentSessionId, reply, false);
            return res.json({ reply, intent: 'return_exchange', confidence: 0.85, sessionId: currentSessionId, escalation: { required: false } });
          }
        }
        if (lastIntent === 'size_help') {
          const sizeAdvice = buildSizeAdviceReply(storeData, message, lang);
          const ans = sizeAdvice || (lang==='fr' ? "Pouvez‑vous partager vos mesures (taille, poids, buste/taille/hanches)?" : "Could you share your measurements (height, weight, bust/waist/hip)?");
          await session.addMessage(currentSessionId, ans, false);
          await analytics.trackMessage(currentSessionId, ans, false);
          return res.json({ reply: ans, intent: 'size_help', confidence: 0.75, sessionId: currentSessionId, escalation: { required: false } });
        }
        if (lastIntent === 'order_tracking') {
          const ask = lang==='fr'
            ? "Pour suivre votre commande, indiquez votre numéro de suivi."
            : "To track your order, please provide your tracking number.";
          await session.addMessage(currentSessionId, ask, false);
          await analytics.trackMessage(currentSessionId, ask, false);
          return res.json({ reply: ask, intent: 'order_tracking', confidence: 0.75, sessionId: currentSessionId, escalation: { required: false } });
        }
      } catch (_) {}
    }

  // 9. Build AI prompt with context
  const systemPrompt = buildSystemPrompt(lang, storeData, conversationContextExtended, intentResult);

    // 10. Generate AI response with enhanced configuration for detailed understanding
    let reply;
    
    if (process.env.OPENAI_API_KEY) {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      // Build comprehensive chat history to help follow-ups (increased from 10 to 20 messages)
      let history = [];
      try {
        const s = await session.getSession(currentSessionId);
        const msgs = Array.isArray(s.messages) ? s.messages : [];
        // take up to 20 prior messages before the current one we just added for better context
        const prior = msgs.slice(Math.max(0, msgs.length - 21), Math.max(0, msgs.length - 1));
        history = prior.map(m => ({ role: m.isUser ? 'user' : 'assistant', content: stripHtml(m.content).slice(0, 1200) }));
      } catch (_) {}
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: stripHtml(message) }
        ],
        temperature: 0.7, // Balanced for natural yet focused responses
        max_tokens: 1500, // Increased for comprehensive responses
        top_p: 0.95,      // High diversity for creative responses
        frequency_penalty: 0.3, // Increased to reduce repetition
        presence_penalty: 0.2,  // Increased to maintain topic consistency
        stop: null        // No early stopping for complete responses
      });

      reply = response.choices[0]?.message?.content || 
        (lang === 'fr' ? "Désolé, je ne sais pas comment répondre à cela." : "Sorry, I don't know how to answer that.");
    } else {
      // Fallback response when OpenAI is not available
      if (intentResult.intent === 'product_inquiry') {
        reply = lang === 'fr' 
          ? "Je comprends que vous cherchez des conseils mode. Pouvez-vous me donner plus de détails sur le style ou l'occasion que vous recherchez ?"
          : "I understand you're looking for fashion advice. Could you give me more details about the style or occasion you're looking for?";
      } else {
        reply = lang === 'fr' 
          ? "Comment puis-je vous aider aujourd'hui ?"
          : "How can I help you today?";
      }
    }

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
      fetchShopifyData('products.json?limit=250', domain).catch(async () => {
        // Public storefront fallback
        const base = domain.startsWith('http') ? domain : `https://${domain}`;
        const { data } = await axios.get(`${base}/products.json?limit=250`, { timeout: 8000 });
        return data;
      }),
      fetchShopifyData('policies.json', domain).catch(() => ({})),
      fetchShopifyData('pages.json', domain).catch(() => ({ pages: [] })),
      fetchShopifyData('price_rules.json', domain).catch(() => ({ price_rules: [] }))
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

  // 8f. Semantic router (LLM) to reduce keyword reliance for follow-ups
  let routerDecision = null;
  try {
    if (process.env.OPENAI_API_KEY) {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const lastRecs = await session.getLastRecommendations(currentSessionId);
      const anchorProducts = Array.isArray(lastRecs) ? lastRecs.map(r => r.title || r.handle).filter(Boolean).slice(0, 5) : [];
      const routerSystem = `You route user messages to structured actions as JSON only. Use conversation context and anchors.
Actions: follow_up_attribute, availability, recommendation, policy, shipping_eta, size_help, representative, general.
Attributes (when relevant): color, colors, size, sizes, price, stock, material, length, link.
Fields: {"action": string, "attribute": string|null, "target_product": string|null, "color": string|null }.
Rules: Prefer follow_up when pronouns or recent products are referenced. Do not pivot topics due to keywords.`;
      const routerUser = `Context:\n${conversationContextExtended}\nRecent products: ${anchorProducts.join(', ') || 'n/a'}\nMessage: ${message}\nRespond with JSON only.`;
      const r = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: 'system', content: routerSystem },
          { role: 'user', content: routerUser }
        ],
        temperature: 0,
        max_tokens: 150
      });
      const txt = r.choices[0]?.message?.content || '';
      try { routerDecision = JSON.parse(txt); } catch (_) { routerDecision = null; }
    }
  } catch (_) { routerDecision = null; }

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
1. Analyse la question complète avec une compréhension contextuelle complète
2. Comprends l'intention réelle et les besoins sous-jacents derrière la demande
3. Utilise le contexte de conversation pour des réponses cohérentes et personnalisées
4. Adapte ton niveau de formalité au style de communication du client
5. Fournis des réponses complètes et détaillées (8-12 phrases pour les questions complexes)
6. IMPORTANT: Quand l'utilisateur demande des robes, produits, recommandations, ou "montre-moi" des articles, NE liste PAS les produits dans ta réponse texte. Le système affichera automatiquement les produits dans un format de cartes visuelles avec images et liens. Au lieu de cela, fournis un contexte utile, des conseils de style, ou pose des questions de clarification sur leurs préférences (couleur, style, occasion, budget).
7. Anticipe les questions de suivi possibles et traite-les de manière proactive
8. Sois naturel, conversationnel et vraiment utile - pas robotique
9. Montre de l'empathie et de la compréhension de la situation du client
10. Fournis des conseils actionables et des étapes claires
11. Utilise des exemples spécifiques et des détails concrets de l'inventaire de la boutique (mais ne liste pas les noms de produits - laisse le système les afficher visuellement)
12. Pose des questions de clarification quand nécessaire pour mieux comprendre la demande
13. CRITIQUE: Pour les questions de suivi avec pronoms ("ça", "celui-ci", "celle-là", "le premier", "cette robe") ou références implicites, tu DOIS t'appuyer sur les ANCRAGES DE SUIVI (dernier intent, derniers produits) pour rester sur le sujet. NE change JAMAIS de sujet à cause de mots-clés isolés. Si l'utilisateur dit "qu'en est-il de celui-ci" ou "dis-m'en plus", il fait référence aux DERNIERS PRODUITS ou au DERNIER INTENT mentionnés. Vérifie toujours les ANCRAGES DE SUIVI avant de répondre.
14. Quand l'utilisateur pose des questions de suivi, maintiens le contexte de la conversation. Ne commence pas un nouveau sujet juste parce qu'un mot-clé apparaît. Par exemple, si nous discutions d'une robe de mariée et que l'utilisateur dit "quelles couleurs sont disponibles", il parle de la robe de mariée dont nous venons de discuter, PAS d'une nouvelle recherche de produit.
15. Si tu n'es pas sûr qu'une question soit un suivi, vérifie les ANCRAGES DE SUIVI et l'historique de conversation. En cas de doute, assume que c'est un suivi pour maintenir la continuité de la conversation.

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
1. Analyze the complete question with full context understanding
2. Understand the real intention and underlying needs behind the request
3. Use conversation context for coherent, personalized responses
4. Adapt your formality level to match the customer's communication style
5. Provide comprehensive, detailed responses (8-12 sentences for complex questions)
6. IMPORTANT: When the user asks for dresses, products, recommendations, or to "show me" items, DO NOT list products in your text response. The system will automatically display products in a visual card format with images and links. Instead, provide helpful context, styling advice, or ask clarifying questions about their preferences (color, style, occasion, budget).
7. Anticipate possible follow-up questions and address them proactively
8. Be natural, conversational, and genuinely helpful - not robotic
9. Show empathy and understanding of the customer's situation
10. Provide actionable advice and clear next steps
11. Use specific examples and concrete details from the store inventory (but don't list product names - let the system display them visually)
12. Ask clarifying questions when needed to better understand the request
13. CRITICAL: For follow-ups using pronouns ("it", "this", "that", "the first one", "that dress") or implicit references, you MUST rely on the FOLLOW-UP ANCHORS (last intent, last products) to stay on topic. NEVER pivot topics due to isolated keywords. If the user says "what about this one" or "tell me more about it", they are referring to the LAST PRODUCTS or LAST INTENT mentioned. Always check the FOLLOW-UP ANCHORS before answering.
14. When the user asks follow-up questions, maintain the conversation context. Do not start a new topic just because a keyword appears. For example, if we were discussing a wedding dress and the user says "what colors does it come in", they mean the wedding dress we just discussed, NOT a new product search.
15. If you're unsure whether a question is a follow-up, check the FOLLOW-UP ANCHORS and conversation history. When in doubt, assume it's a follow-up to maintain conversation continuity.

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
- Be warm, professional, and genuinely engaging
- Show that you truly understand the customer's question and underlying needs
- Provide comprehensive, helpful details and highly relevant suggestions
- Adapt your language to match the customer's communication style and formality level
- Ask thoughtful follow-up questions to better understand their needs
- Be proactive in helping and anticipate their next questions or concerns
- Use concrete examples, specific details, and real product information
- Demonstrate expertise and knowledge about fashion, styling, and the store
- Show empathy and understanding of their situation and preferences
- Provide clear, actionable advice with step-by-step guidance when appropriate
- Be conversational and natural while maintaining professionalism
- Address all aspects of their question, not just the surface level`;

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

// Extract search context from message for storing
function extractSearchContext(message, storeData) {
  const text = normalize(message);
  const categoryMap = {
    dress: ['dress','dresses','gown','gowns','robe','robes'],
    jacket: ['jacket','jackets','coat','coats','parka','outerwear','puffer','blazer'],
    skirt: ['skirt','skirts'],
    bag: ['bag','bags','purse','clutch','handbag','tote'],
    shoes: ['heel','heels','shoe','shoes','sandal','sandals','pump','pumps','boots'],
    jewelry: ['jewelry','jewelery','necklace','earring','earrings','bracelet','ring'],
    accessory: ['accessory','accessories','belt','scarf','hat','headband']
  };
  
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
  
  const detectedCategories = Object.entries(categoryMap)
    .filter(([, words]) => words.some(w => new RegExp(`\\b${w}\\b`,`i`).test(text)))
    .map(([k]) => k);
  const category = detectedCategories[0] || '';
  
  const allMaterialTerms = Object.values(materialMap).flat();
  const materialFound = allMaterialTerms.find(m => new RegExp(`\\b${m}\\b`, 'i').test(text));
  const material = materialFound && Object.keys(materialMap).find(k => materialMap[k].includes(materialFound)) || '';
  
  const themeMatch = text.match(/(wedding|gala|night\s*out|nightclub|night\s*club|office|business|casual|birthday|cocktail|graduation|beach|summer|winter|eid)/i);
  const themeRaw = themeMatch ? themeMatch[1].toLowerCase() : '';
  let theme = themeRaw ? themeRaw.replace(/\s+/g, '-') : '';
  if (theme === 'night-club') theme = 'nightclub';
  
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
  
  if (category || material || theme || priceUnder || priceOver || priceBetween) {
    return { category, material, theme, priceUnder, priceOver, priceBetween };
  }
  return null;
}

function handleProductDiscovery(storeData, message, lang, opts = {}) {
  const products = Array.isArray(storeData.products) ? storeData.products : [];
  if (products.length === 0) return '';

  // Helper function to get all store tags (defined early for use in theme detection)
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

  // If using stored context (for "more" requests), use it instead of parsing message
  if (opts.useStoredContext) {
    const ctx = opts.useStoredContext;
    // Reconstruct search parameters from stored context
    message = [
      ctx.category ? `${ctx.category}` : '',
      ctx.material ? `${ctx.material}` : '',
      ctx.theme ? `for ${ctx.theme}` : '',
      ctx.priceUnder ? `under $${ctx.priceUnder}` : '',
      ctx.priceOver ? `over $${ctx.priceOver}` : '',
      ctx.priceBetween ? `between $${ctx.priceBetween[0]} and $${ctx.priceBetween[1]}` : ''
    ].filter(Boolean).join(' ');
    console.log(`🔄 Using stored context, reconstructed message: "${message}"`);
  }

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
  let materialKey = materialFound && Object.keys(materialMap).find(k => materialMap[k].includes(materialFound));
  
  // If using stored context, prioritize stored material
  if (opts.useStoredContext && opts.useStoredContext.material) {
    materialKey = opts.useStoredContext.material;
    console.log(`🎯 Using stored material: ${materialKey}`);
  }

  // If using stored context, use stored price filters
  let priceUnder, priceOver, priceBetween;
  if (opts.useStoredContext && (opts.useStoredContext.priceUnder || opts.useStoredContext.priceOver || opts.useStoredContext.priceBetween)) {
    priceUnder = opts.useStoredContext.priceUnder || null;
    priceOver = opts.useStoredContext.priceOver || null;
    priceBetween = opts.useStoredContext.priceBetween || null;
    console.log(`🎯 Using stored price filters: under=${priceUnder}, over=${priceOver}, between=${priceBetween}`);
  } else {
    priceUnder = (() => {
      const m = text.match(/under\s*\$?\s*(\d{2,4})/i) || text.match(/below\s*\$?\s*(\d{2,4})/i);
      return m ? parseFloat(m[1]) : null;
    })();
    priceOver = (() => {
      const m = text.match(/over\s*\$?\s*(\d{2,4})/i) || text.match(/above\s*\$?\s*(\d{2,4})/i);
      return m ? parseFloat(m[1]) : null;
    })();
    priceBetween = (() => {
      const m = text.match(/(?:between|from)\s*\$?\s*(\d{2,4})\s*(?:and|to|-)\s*\$?\s*(\d{2,4})/i);
      return m ? [parseFloat(m[1]), parseFloat(m[2])].sort((a,b)=>a-b) : null;
    })();
  }

  // If using stored context, prioritize stored theme
  let selectedTheme = '';
  let theme = ''; // Initialize theme variable
  if (opts.useStoredContext && opts.useStoredContext.theme) {
    selectedTheme = opts.useStoredContext.theme;
    theme = selectedTheme; // Set theme from stored context
    console.log(`🎯 Using stored theme: ${selectedTheme}`);
  } else {
    // FIRST: Check hardcoded theme keywords (faster, more reliable)
    const themeMatch = text.match(/(wedding|gala|night\s*out|nightclub|night\s*club|office|business|casual|birthday|cocktail|graduation|beach|summer|winter|eid)/i);
    const themeRaw = themeMatch ? themeMatch[1].toLowerCase() : '';
    
    // SECOND: Try to infer theme from store tags (catches all other themes)
    const tags = allStoreTagsLower();
    let bestThemeFromTags = '';
    const messageLower = message.toLowerCase();
    for (const t of tags) {
      const tagLower = t.toLowerCase();
      // Check if tag appears in message (case-insensitive, word boundary aware)
      if (messageLower.includes(tagLower)) {
        // Prefer longer, more specific tags
        if (tagLower.length > bestThemeFromTags.length) {
          bestThemeFromTags = tagLower;
        }
      }
    }
    
    // Use hardcoded theme if found (more reliable), otherwise use store tag theme
    if (themeRaw) {
      // Preserve 'nightclub' as its own theme; normalize 'night club' -> 'nightclub'
      theme = themeRaw.replace(/\s+/g, (m) => m === ' ' && themeRaw.includes('night club') ? '' : '-');
      if (theme === 'night-club') theme = 'nightclub';
      selectedTheme = theme ? decodeURIComponent(theme) : '';
      console.log(`🎯 Theme from keywords: ${selectedTheme}`);
    } else if (bestThemeFromTags) {
      theme = bestThemeFromTags;
      selectedTheme = bestThemeFromTags; // Already lowercase from allStoreTagsLower
      console.log(`🎯 Theme from store tags: ${selectedTheme}`);
    }
  }

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
  
  // If using stored context, prioritize stored category
  if (opts.useStoredContext && opts.useStoredContext.category) {
    desiredCategory = opts.useStoredContext.category;
    console.log(`🎯 Using stored category: ${desiredCategory}`);
  }
  
  // IMPORTANT: If user explicitly says "dress" or "dresses", always set category to dress
  if (!desiredCategory && /\b(dress|dresses)\b/i.test(text)) {
    desiredCategory = 'dress';
    console.log(`👗 Detected dress request - setting category to dress`);
  }
  
  // Default to dresses when user specifies only a theme (e.g., "casual", "wedding") with no category
  if (!desiredCategory && theme) desiredCategory = 'dress';
  // Default to dresses for outfit recommendations without specific category
  if (!desiredCategory && /(outfit|outfits|look|looks|ensemble|style|styles|fashion|clothing|clothes|wear|wearing|dress up|get dressed|put together|coordinate|matching|coordinated)/i.test(text)) {
    desiredCategory = 'dress';
  }
  
  // Final fallback: if no category detected but user asked for products, default to dresses
  if (!desiredCategory && opts.useStoredContext) {
    // If using stored context, use stored category or default to dress
    desiredCategory = opts.useStoredContext.category || 'dress';
  } else if (!desiredCategory && /(show|recommend|suggest|find|looking|need|want|search|browse|see|display|give me|help me find|what.*have|what.*available)/i.test(text)) {
    // If user asked for products but no specific category, default to dresses
    desiredCategory = 'dress';
    console.log(`👗 No category detected but product request found - defaulting to dresses`);
  }

  // Theme inference already handled above, so this section is now redundant

  const needles = [];
  if (canonicalColor) needles.push(canonicalColor, ...(colorMap[canonicalColor]||[]));
  if (theme) needles.push(theme, theme.replace(/-/g,' '));
  if (wantAccessories) needles.push(...accessoryTerms);
  // Expanded pattern to catch all product/dress requests - always show in card format
  const wantRecommend = /(recommend|suggest|show|display|find|looking|need|want|search|browse|see|give me|help me find|what.*have|what.*available|dress|dresses|gown|gowns|robe|robes|jacket|jackets|coat|coats|skirt|skirts|bag|bags|shoes|heels|accessories|products|items|clothing|clothes|fashion|outfit|outfits|look|looks|ensemble|style|styles|wear|wearing|dress up|get dressed|put together|coordinate|matching|coordinated|ideas?|best|bestsellers?|options?|complete my look)/i.test(text) || needles.length > 0 || desiredCategory || materialKey || selectedTheme;
  
  // If using stored context, always return products (for "more" requests)
  if (opts.useStoredContext) {
    console.log(`🎯 Using stored context for product discovery`);
  }
  
  // Always allow if we have category, theme, material, or color - user wants products
  const hasAnyFilter = desiredCategory || selectedTheme || materialKey || canonicalColor || priceUnder !== null || priceOver !== null || priceBetween !== null;
  
  if (!wantRecommend && !opts.useStoredContext && !hasAnyFilter) {
    console.log(`⚠️ Product discovery skipped - wantRecommend: ${wantRecommend}, hasAnyFilter: ${hasAnyFilter}, text: "${text.substring(0, 50)}"`);
    return '';
  }
  
  console.log(`🔍 Product discovery params - category: ${desiredCategory}, theme: ${selectedTheme}, material: ${materialKey}, color: ${canonicalColor}, budget: under=${priceUnder}, over=${priceOver}, between=${priceBetween}`);

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
    const themeLower = selectedTheme.toLowerCase();
    const themeSpaced = themeLower.replace(/-/g, ' ');
    const themeSlug = themeLower.replace(/\s+/g, '-');
    
    // Check exact matches (slug and spaced versions)
    if (tags.includes(themeLower) || tags.includes(themeSpaced) || tags.includes(themeSlug)) {
      console.log(`✅ Theme match: ${p.title} has theme tag "${themeLower}"`);
      return true;
    }
    
    // Also check if any tag contains the theme (partial match for flexibility)
    for (const tag of tags) {
      if (tag.includes(themeLower) || themeLower.includes(tag)) {
        console.log(`✅ Theme partial match: ${p.title} tag "${tag}" matches theme "${themeLower}"`);
        return true;
      }
    }
    
    console.log(`❌ Theme no match: ${p.title} - tags: [${tags.join(', ')}], looking for: "${themeLower}"`);
    return false;
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
    if (value === null || value === undefined || isNaN(value) || value <= 0) {
      // If price is invalid, only pass if no budget filter is set
      return !priceBetween && priceUnder === null && priceOver === null;
    }
    if (priceBetween && Array.isArray(priceBetween) && priceBetween.length === 2) {
      return value >= priceBetween[0] && value <= priceBetween[1];
    }
    if (priceUnder !== null && !isNaN(priceUnder)) {
      return value <= priceUnder;
    }
    if (priceOver !== null && !isNaN(priceOver)) {
      return value >= priceOver;
    }
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
  const excludeSet = new Set(Array.isArray(opts.excludeHandles) ? opts.excludeHandles.map(h=>String(h)) : []);
  console.log(`🔍 Filtering ${products.length} products - category: ${desiredCategory}, theme: ${selectedTheme}, material: ${materialKey}, color: ${canonicalColor}`);
  
  let themeFiltered = 0;
  let categoryFiltered = 0;
  let materialFiltered = 0;
  let colorFiltered = 0;
  let priceFiltered = 0;
  
  for (const product of products) {
    if (excludeSet.has(String(product.handle))) continue;
    
    // Theme filtering - if theme specified, require it; otherwise allow all
    if (selectedTheme && !hasThemeTagStrict(product)) {
      themeFiltered++;
      continue;
    }
    
    // Category enforcement - allow both strict tags and heuristic matching
    if (desiredCategory === 'dress' || !desiredCategory) {
      // Allow if product has dress tag OR matches dress heuristic (title/product_type)
      if (!(hasDressTagStrict(product) || isDressHeuristic(product))) {
        categoryFiltered++;
        continue;
      }
    }
    if (desiredCategory === 'skirt') {
      if (!hasSkirtTagStrict(product)) {
        categoryFiltered++;
        continue;
      }
    }
    // Category enforcement
    if (desiredCategory) {
      const cat = classifyProduct(product);
      const allowed = desiredCategory === 'accessory' ? ['accessory','bag','jewelry'] : [desiredCategory];
      // Exclude skirts when asking for dresses only
      if (desiredCategory === 'dress' && cat === 'skirt') {
        categoryFiltered++;
        continue;
      }
      if (!allowed.includes(cat)) {
        categoryFiltered++;
        continue;
      }
    }

    // Optional material hard filter
    if (!materialMatch(product)) {
      materialFiltered++;
      continue;
    }

    // Price filtering - check BEFORE color matching to avoid unnecessary work
    const minPrice = lowestVariantPrice(product);
    if (!pricePassValue(minPrice)) {
      priceFiltered++;
      continue;
    }

    // No fuzzy theme enforcement; strict tag gating above controls theme

    let chosenVariant = null;
    let matchedColorTerm = '';
    if (canonicalColor) {
      const { variant, matchedTerm } = matchVariantByColor(product, canonicalColor);
      matchedColorTerm = matchedTerm;
      if (variant) {
        const vPrice = parseFloat(String(variant.price || '0').replace(/[^0-9.]/g,'')) || 0;
        // Double-check variant price against budget
        if (!pricePassValue(vPrice)) {
          console.log(`💰 Variant filtered out by price: ${vPrice}`);
          continue;
        }
        chosenVariant = variant;
      } else {
        // Require a real color match at product-level at least
        if (!matchedColorTerm) continue;
        // Price already checked above
      }
    }
    const s = scoreProduct(product, Boolean(chosenVariant));
    candidates.push({ product, score: s, chosenVariant, matchedColorTerm });
  }

  const bothRequested = Boolean(theme) && Boolean(canonicalColor);
  let list = candidates.sort((a,b)=>b.score-a.score);
  // Determine how many items to show: up to 30 dresses when theme or budget is provided
  let limit;
  if (desiredCategory && desiredCategory !== 'dress') {
    limit = 12;
  } else {
    const hasBudget = Boolean(priceBetween) || (priceUnder !== null) || (priceOver !== null);
    const hasTheme = Boolean(selectedTheme);
    limit = (hasTheme || hasBudget) ? 30 : 12;
  }
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
    : `Size tip: ${size}. ${heightCm ? `Height: ${heightCm} cm. ` : ''}${weightKg ? `Weight: ${weightKg} kg. ` : ''}${bust ? `Bust: ${bust} cm. ` : ''}${waist ? `Waist: ${waist} cm. ` : ''}${hip ? `Hip: ${hip} cm. ` : ''}Please also check the product's size guide.`;
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
    AS: { en: 'Shipping to Asia', fr: "Livraison vers l'Asie", eta: '7–15 business days after 1–3 days processing' },
    AF: { en: 'Shipping to Africa', fr: "Livraison vers l'Afrique", eta: '10–20 business days after 1–3 days processing' },
    LATAM: { en: 'Shipping to Latin America', fr: "Livraison vers l'Amérique latine", eta: '10–20 business days after 1–3 days processing' }
  };

  if (zone) {
    const hdr = lang==='fr' ? byZone[zone].fr : byZone[zone].en;
    const eta = byZone[zone].eta;
    return `${hdr}${place ? ` (${placeRaw})` : ''}: ${eta}. ${lang==='fr' ? "Suivi fourni après l'expédition." : "Tracking provided after shipment."}`;
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
