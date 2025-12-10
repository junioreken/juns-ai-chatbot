// Prevent multiple script loads
if (window.JUNS_CHATBOT_LOADED) {
  console.log('JUNS Chatbot already loaded, skipping...');
} else {
  window.JUNS_CHATBOT_LOADED = true;

// Resolve API base from the script's own src so it works cross-origin when embedded in Shopify
function getAssetInfo() {
  try {
    const thisScript = document.currentScript || (function() {
      const scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();
    const scriptUrl = new URL(thisScript.src);
    return {
      api: (typeof window !== 'undefined' && window.JUNS_CHATBOT_API_URL)
        ? window.JUNS_CHATBOT_API_URL
        : `${scriptUrl.origin}/api/enhanced-chat`,
      origin: scriptUrl.origin
    };
  } catch (e) {
    return { api: (typeof window !== "undefined" && window.JUNS_CHATBOT_API_URL) ? window.JUNS_CHATBOT_API_URL : "/api/enhanced-chat", origin: "" };
  }
}

const { api: API_URL, origin: ASSET_ORIGIN } = getAssetInfo();

function detectLang() {
  try {
    const htmlLang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    const shopifyLocale = (window.Shopify && (Shopify.locale || Shopify.translationLocale)) || '';
    const rootPrefix = (window.Shopify && Shopify.routes && Shopify.routes.root) || '';
    const path = window.location.pathname || '';
    const pathIsFr = path === '/fr' || path.startsWith('/fr/') || /^\/(fr)(\b|\/|\?|#)/i.test(path);
    const navLang = (navigator.language || '').toLowerCase();
    if (htmlLang.startsWith('fr') || String(shopifyLocale).toLowerCase().startsWith('fr') || String(rootPrefix).startsWith('/fr') || pathIsFr || navLang.startsWith('fr')) return 'fr';
  } catch (error) {
    console.warn('[JUNS chatbot] Failed to detect lang, defaulting to en:', error);
  }
  return 'en';
}

const I18N = {
  en: {
    inputPlaceholder: 'Type your message...',
    quick: { recommend: 'Show me recommendations', sizing: 'Sizing help', delivery: 'Delivery time', tracking: 'Order tracking', complete: 'Complete my look' },
    greet: "Hi 👋 I’m your JUN’S Stylist. I can help with sizing, delivery, order tracking, and outfit ideas.",
    connecting: '✅ Connecting you to our live assistant…',
    sizingPlaceholder: 'Type your measurements...',
    deliveryPlaceholder: 'City, Country...'
  },
  fr: {
    inputPlaceholder: 'Écrivez votre message…',
    quick: { recommend: 'Voir des recommandations', sizing: 'Aide taille', delivery: 'Délai de livraison', tracking: 'Suivi de commande', complete: 'Compléter mon look' },
    greet: "Bonjour 👋 Je suis votre styliste JUN’S. Je peux aider pour les tailles, la livraison, le suivi et les idées de tenues.",
    connecting: '✅ Connexion à notre assistant en direct…',
    sizingPlaceholder: 'Saisissez vos mensurations…',
    deliveryPlaceholder: 'Ville, Pays…'
  }
};

let JUNS_SHADOW = null; // ShadowRoot
let JUNS_ROOT = null; // Host element
let TAWK_LOADING = false;
let TAWK_LOADED = false;

function ensureShadowRoot() {
  if (JUNS_SHADOW) return JUNS_SHADOW;
  JUNS_ROOT = document.getElementById('juns-ai-root');
  if (!JUNS_ROOT) {
    JUNS_ROOT = document.createElement('div');
    JUNS_ROOT.id = 'juns-ai-root';
    document.body.appendChild(JUNS_ROOT);
  }
  // Create shadow root only once
  JUNS_SHADOW = JUNS_ROOT.shadowRoot || JUNS_ROOT.attachShadow({ mode: 'open' });
  // Inject minimal critical styles for the launcher bubble only (to avoid blocking page load)
  const style = document.createElement('style');
  style.textContent = `
    #juns-ai-button{position:fixed;bottom:30px;right:30px;z-index:2147483647}
    #chat-circle{width:60px;height:60px;background:linear-gradient(135deg,#000,#333);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(0,0,0,.3);cursor:pointer}
    #chat-circle .bubble-title{display:flex;flex-direction:column;align-items:center;line-height:1.1}
    #chat-circle .bubble-title .brand{font-weight:800;font-size:11px}
    #chat-circle .bubble-title .sub{font-weight:700;font-size:9px;opacity:.95}
  `;
  JUNS_SHADOW.appendChild(style);
  return JUNS_SHADOW;
}

// Lazy-load full stylesheet on first interaction
function loadFullStylesOnce(root){
  return new Promise((resolve)=>{
    if (!ASSET_ORIGIN) return resolve();
    if (root.getElementById && root.getElementById('juns-ai-style-link')) return resolve();
    const link = document.createElement('link');
    link.id = 'juns-ai-style-link';
    link.rel = 'stylesheet';
    link.href = `${ASSET_ORIGIN}/chatbot-style.css`;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    root.appendChild(link);
    // Fallback resolve in case onload doesn't fire
    setTimeout(resolve, 600);
  });
}

// --- Tawk.to integration (hidden by default) ---
function loadTawkOnce() {
  if (TAWK_LOADING || TAWK_LOADED) return;
  TAWK_LOADING = true;
  (function () {
    var s1 = document.createElement("script"),
      s0 = document.getElementsByTagName("script")[0];
    s1.async = true;
    // Replace with your own Tawk property ID if needed
    s1.src = 'https://embed.tawk.to/68a6b4e77ebce11927981c0e/1j35j5a9d';
    s1.charset = 'UTF-8';
    s1.setAttribute('crossorigin', '*');
    s1.onload = function () {
      TAWK_LOADED = true;
      try { 
        if (typeof Tawk_API !== 'undefined') { 
          // ALWAYS hide widget on load - never auto-show
          Tawk_API.hideWidget(); 
        } 
      } catch(_) {}
      // Aggressively keep it hidden - check every 200ms for 60 seconds
      try {
        let attempts = 0; 
        const hideLoop = setInterval(() => {
          attempts++;
          try { 
            if (window.Tawk_API) {
              // Check if widget was explicitly opened via JUNS.support.open()
              var wasExplicitlyOpened = false;
              try {
                if (window.JUNS && window.JUNS.support && typeof window.JUNS.support.open === 'function') {
                  // Check localStorage to see if it was explicitly opened
                  var tawkStorageKey = localStorage.getItem('juns_tawk_opened');
                  wasExplicitlyOpened = tawkStorageKey === 'true';
                }
              } catch(_) {}
              
              // Only hide if NOT explicitly opened
              if (!wasExplicitlyOpened) {
                Tawk_API.hideWidget();
                // Also hide via CSS
                var tawkElements = document.querySelectorAll('[data-tawk-widget], #tawk-widget, iframe[src*="tawk"], iframe[src*="tawk.to"]');
                tawkElements.forEach(function(el) {
                  if (el) {
                    el.style.display = 'none';
                    el.style.visibility = 'hidden';
                    el.style.opacity = '0';
                  }
                });
              }
            }
          } catch(_) {}
          if (attempts > 300) clearInterval(hideLoop); // 60 seconds
        }, 200);
      } catch(_) {}
    };
    if (s0 && s0.parentNode) s0.parentNode.insertBefore(s1, s0); else document.head.appendChild(s1);
  })();
}

async function openLiveChat() {
  // ALWAYS use theme provided helper first (it handles positioning and hiding properly)
  if (window.JUNS && window.JUNS.support && typeof window.JUNS.support.open === 'function') {
    window.JUNS.support.open();
    return;
  }
  
  // Fallback: Only if theme helper is not available, load Tawk ourselves
  // But ensure it's positioned bottom-left BEFORE showing
  // NOTE: This fallback should rarely be needed if theme code is properly loaded
  loadTawkOnce();
  
  // Wait briefly for Tawk to be ready
  let tries = 0;
  const maxTries = 100; // ~5s worst case
  while (tries < maxTries) {
    if (window.Tawk_API && typeof window.Tawk_API.showWidget === 'function') {
      try {
        // Position Tawk widget to bottom-left BEFORE showing
        setupTawkPositioningInChatbot();
        
        // Force positioning immediately with setProperty
        const tawkElements = document.querySelectorAll('[data-tawk-widget], #tawk-widget, iframe[src*="tawk"], iframe[src*="tawk.to"]');
        tawkElements.forEach(el => {
          if (el) {
            el.style.setProperty('position', 'fixed', 'important');
            el.style.setProperty('left', '30px', 'important');
            el.style.setProperty('bottom', '30px', 'important');
            el.style.setProperty('right', 'auto', 'important');
            el.style.setProperty('top', 'auto', 'important');
          }
        });
        
        window.Tawk_API.showWidget();
        
        // Force positioning MULTIPLE times after showing
        for (let i = 0; i < 10; i++) {
          setTimeout(() => {
            tawkElements.forEach(el => {
              if (el) {
                el.style.setProperty('position', 'fixed', 'important');
                el.style.setProperty('left', '30px', 'important');
                el.style.setProperty('bottom', '30px', 'important');
                el.style.setProperty('right', 'auto', 'important');
                el.style.setProperty('top', 'auto', 'important');
              }
            });
          }, i * 100);
        }
        
        // Call maximize repeatedly for first second to ensure full chat view opens
        let repeat = 0; 
        const ensureOpen = setInterval(() => {
          try { window.Tawk_API.maximize(); } catch(_) {}
          if (++repeat > 10) clearInterval(ensureOpen);
        }, 200);
        
        // Hide JUN'S AI chatbot
        const root = ensureShadowRoot();
        const bubble = root && root.getElementById('juns-ai-button');
        const box = root && root.getElementById('juns-ai-chatbox');
        
        if (bubble) {
          bubble.style.display = 'none';
          bubble.style.visibility = 'hidden';
          bubble.style.opacity = '0';
        }
        
        if (box) {
          box.style.display = 'none';
        }
        
        window.JUNS_AI_HIDDEN = true;
      } catch(_) {}
      break;
    }
    await new Promise(r => setTimeout(r, 100));
    tries++;
  }
  
  // Set up Tawk event listeners to show JUN'S AI when Tawk closes
  setupTawkEventListeners();
}

function setupTawkPositioningInChatbot() {
      try {
    // Add CSS to position Tawk widget to bottom-left - ULTRA AGGRESSIVE
        const style = document.createElement('style');
    style.id = 'tawk-positioning-chatbot';
        style.textContent = `
      /* Force bottom-left positioning - override EVERYTHING */
          .tawk-widget-container,
          [data-tawk-widget],
          #tawk-widget,
          iframe[src*="tawk"],
          div[id*="tawk"],
          div[class*="tawk"],
          div[style*="position: fixed"],
          div[style*="bottom"],
      div[style*="right"],
      div[style*="left"],
      div[style*="z-index"] {
            position: fixed !important;
        left: 30px !important;
        bottom: 30px !important;
        top: auto !important;
        transform: none !important;
        right: auto !important;
            z-index: 999999 !important;
            width: 60px !important;
            height: 60px !important;
          }
          
      /* Force ALL Tawk iframes to bottom-left */
      iframe[src*="tawk"] {
        position: fixed !important;
        left: 30px !important;
        bottom: 30px !important;
        right: auto !important;
            top: auto !important;
      }
      
          .tawk-widget-container .tawk-chat,
          [data-tawk-widget] .tawk-chat,
      #tawk-widget .tawk-chat {
        left: 30px !important;
        bottom: 100px !important;
        right: auto !important;
      }
      
          html body .tawk-widget-container,
          html body [data-tawk-widget],
          html body #tawk-widget,
          html body div[style*="position: fixed"],
      html body div[style*="bottom"],
      html body div[style*="right"] {
            position: fixed !important;
        left: 30px !important;
        bottom: 30px !important;
        top: auto !important;
        transform: none !important;
        right: auto !important;
          }
        `;
        
    const existingStyle = document.getElementById('tawk-positioning-chatbot');
        if (existingStyle) {
          existingStyle.remove();
        }
        
        document.head.appendChild(style);
        
    // Also directly modify any existing Tawk elements - FORCE bottom-left with !important
    function forceBottomLeft() {
      const tawkElements = document.querySelectorAll('[data-tawk-widget], #tawk-widget, iframe[src*="tawk"], iframe[src*="tawk.to"], div[id*="tawk"], div[class*="tawk"], div[style*="position: fixed"], body > div[style*="position: fixed"], body > iframe');
          tawkElements.forEach(el => {
            if (el) {
          // Use setProperty with 'important' flag for stronger override
          el.style.setProperty('position', 'fixed', 'important');
          el.style.setProperty('left', '30px', 'important');
          el.style.setProperty('bottom', '30px', 'important');
          el.style.setProperty('top', 'auto', 'important');
          el.style.setProperty('transform', 'none', 'important');
          el.style.setProperty('right', 'auto', 'important');
          el.style.setProperty('width', '60px', 'important');
          el.style.setProperty('height', '60px', 'important');
          el.style.setProperty('z-index', '999999', 'important');
        }
      });
    }
    
    // Run immediately and repeatedly - MORE FREQUENT
    forceBottomLeft();
    setTimeout(forceBottomLeft, 50);
    setTimeout(forceBottomLeft, 100);
    setTimeout(forceBottomLeft, 200);
    setTimeout(forceBottomLeft, 500);
    setTimeout(forceBottomLeft, 1000);
        
    // Use MutationObserver to catch when widget is added to DOM
    const observer = new MutationObserver(() => {
      forceBottomLeft();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Continuous monitoring to catch and reposition - check for right positioning
        let tawkMonitor = setInterval(() => {
      const tawkElements = document.querySelectorAll('#tawk-widget, [data-tawk-widget], iframe[src*="tawk"], iframe[src*="tawk.to"], div[id*="tawk"], div[class*="tawk"], body > div[style*="position: fixed"]');
          tawkElements.forEach(el => {
        if (el) {
          const computed = window.getComputedStyle(el);
          const rightValue = computed.right;
          const leftValue = computed.left;
          // If it's on the right side OR left not properly set, force it to bottom-left
          if ((rightValue !== 'auto' && rightValue !== '' && parseFloat(rightValue) > 0) || 
              leftValue === 'auto' || leftValue === '' || parseFloat(leftValue) < 20) {
            el.style.setProperty('position', 'fixed', 'important');
            el.style.setProperty('left', '30px', 'important');
            el.style.setProperty('bottom', '30px', 'important');
            el.style.setProperty('top', 'auto', 'important');
            el.style.setProperty('transform', 'none', 'important');
            el.style.setProperty('right', 'auto', 'important');
            el.style.setProperty('width', '60px', 'important');
            el.style.setProperty('height', '60px', 'important');
            el.style.setProperty('z-index', '999999', 'important');
            console.log('🔄 FORCED Tawk to bottom-left:', el);
          }
            }
          });
    }, 200); // Check every 200ms - VERY AGGRESSIVE
    
        setTimeout(() => {
          clearInterval(tawkMonitor);
      observer.disconnect();
    }, 120000); // Monitor for 2 minutes
      } catch(e) {
    console.log('Error positioning Tawk:', e);
      }
}

function setupTawkEventListeners() {
  console.log('🔧 Setting up Tawk event listeners...');
  
  // Method 1: Try Tawk API events
  if (window.Tawk_API) {
    console.log('📡 Tawk API found, setting up events...');
    
    // Set up event listeners when Tawk loads
    if (window.Tawk_API.setAttributes) {
      try {
        window.Tawk_API.setAttributes({
          'onChatMinimized': function() {
            console.log('📱 Tawk minimized - showing JUN\'S AI');
            showJunsAI();
          },
          'onChatHidden': function() {
            console.log('👁️ Tawk hidden - showing JUN\'S AI');
            showJunsAI();
          },
          'onChatEnded': function() {
            console.log('🔚 Tawk chat ended - showing JUN\'S AI');
            showJunsAI();
          }
        });
        console.log('✅ Tawk events configured');
      } catch(e) {
        console.log('❌ Failed to set Tawk attributes:', e);
      }
    }
  }
  
  // Method 2: Enhanced periodic checking with multiple selectors
  let checkCount = 0;
  const maxChecks = 150; // Check for 5 minutes (150 * 2 seconds)
  
  // Performance optimized: Use requestAnimationFrame and longer intervals
  let lastCheckTime = 0;
  const CHECK_INTERVAL = 8000; // Increased from 2s to 8s for better performance
  let checkIntervalId = null;
  
  function optimizedTawkCheck() {
    const now = Date.now();
    if (now - lastCheckTime < CHECK_INTERVAL) {
      checkIntervalId = requestAnimationFrame(optimizedTawkCheck);
      return;
    }
    lastCheckTime = now;
    
    if (window.JUNS_AI_HIDDEN) {
      checkCount++;
      console.log(`🔍 Checking Tawk visibility (${checkCount}/${maxChecks})...`);
      
      try {
        // Optimized: Use most common selector first, then fallback
        const tawkWidget = document.querySelector('#tawk-widget iframe');
        let tawkVisible = tawkWidget && tawkWidget.offsetParent !== null;
        
        // Only check other selectors if first one fails
        if (!tawkVisible) {
          const altWidget = document.querySelector('[data-tawk-widget], iframe[src*="tawk"]');
          tawkVisible = altWidget && altWidget.offsetParent !== null;
        }
        
        if (!tawkVisible) {
          console.log('👁️ Tawk widget not visible - showing JUN\'S AI');
          showJunsAI();
          return; // Exit function instead of clearing interval
        }
        
        // Fallback: show JUN'S AI after max checks
        if (checkCount >= maxChecks) {
          console.log('⏰ Max checks reached - showing JUN\'S AI as fallback');
          showJunsAI();
          return;
        }
        
      } catch(e) {
        console.log('❌ Error checking Tawk visibility:', e);
        // Show JUN'S AI on error after a few attempts
        if (checkCount > 10) {
          showJunsAI();
          return;
        }
      }
      
      // Continue checking if needed
      checkIntervalId = requestAnimationFrame(optimizedTawkCheck);
    } else {
      console.log('✅ JUN\'S AI not hidden - stopping checks');
    }
  }
  
  // Start optimized checking
  checkIntervalId = requestAnimationFrame(optimizedTawkCheck);
}

function showJunsAI() {
  console.log('🔄 Attempting to show JUN\'S AI...');
  try {
    // Remove Tawk positioning CSS to restore original position
    const tawkStyle = document.getElementById('tawk-positioning');
    if (tawkStyle) {
      tawkStyle.remove();
      console.log('✅ Tawk positioning CSS removed');
    }
    
    const root = ensureShadowRoot();
    if (!root) {
      console.log('❌ No shadow root found');
      return;
    }
    
    const bubble = root.getElementById('juns-ai-button');
    if (bubble) {
      bubble.style.display = 'block';
      bubble.style.visibility = 'visible';
      bubble.style.opacity = '1';
      window.JUNS_AI_HIDDEN = false;
      console.log('✅ JUN\'S AI bubble shown successfully');
    } else {
      console.log('❌ JUN\'S AI bubble element not found');
    }
  } catch(e) {
    console.log('❌ Error showing JUN\'S AI:', e);
  }
}

// Test functions for debugging (available in console)
window.testHideJunsAI = function() {
  console.log('🧪 Testing hide JUN\'S AI...');
  try {
    const root = ensureShadowRoot();
    const bubble = root && root.getElementById('juns-ai-button');
    if (bubble) {
      bubble.style.display = 'none';
      bubble.style.visibility = 'hidden';
      bubble.style.opacity = '0';
      window.JUNS_AI_HIDDEN = true;
      console.log('✅ JUN\'S AI hidden for testing');
    }
  } catch(e) {
    console.log('❌ Error hiding JUN\'S AI:', e);
  }
};

window.testShowJunsAI = function() {
  console.log('🧪 Testing show JUN\'S AI...');
  showJunsAI();
};

window.testPositionTawk = function() {
  console.log('🧪 Testing Tawk positioning...');
  try {
    // Add CSS to position Tawk widget
    const style = document.createElement('style');
    style.id = 'tawk-positioning-test';
    style.textContent = `
      /* ULTRA AGGRESSIVE Tawk positioning - override everything */
      .tawk-widget-container,
      [data-tawk-widget],
      #tawk-widget,
      iframe[src*="tawk"],
      div[id*="tawk"],
      div[class*="tawk"],
      div[style*="position: fixed"],
      div[style*="bottom"],
      div[style*="right"] {
        position: fixed !important;
        left: 30px !important;
        bottom: 30px !important;
        top: auto !important;
        transform: none !important;
        z-index: 999999 !important;
        width: 60px !important;
        height: 60px !important;
        right: auto !important;
      }
      
      /* Make Tawk button smaller and properly positioned */
      .tawk-widget-container .tawk-button,
      [data-tawk-widget] .tawk-button,
      #tawk-widget .tawk-button,
      iframe[src*="tawk"] + div,
      div[id*="tawk"] .tawk-button,
      div[class*="tawk"] .tawk-button,
      div[style*="position: fixed"] .tawk-button,
      div[style*="bottom"] .tawk-button {
        position: relative !important;
        left: 0 !important;
        right: auto !important;
        bottom: 0 !important;
        top: auto !important;
        transform: none !important;
        width: 60px !important;
        height: 60px !important;
        border-radius: 50% !important;
      }
      
      /* Make Tawk button icon smaller */
      .tawk-widget-container .tawk-button svg,
      [data-tawk-widget] .tawk-button svg,
      #tawk-widget .tawk-button svg,
      div[id*="tawk"] .tawk-button svg,
      div[class*="tawk"] .tawk-button svg,
      div[style*="position: fixed"] .tawk-button svg {
        width: 24px !important;
        height: 24px !important;
      }
      
      /* Ensure Tawk chat window opens in correct position */
      .tawk-widget-container .tawk-chat,
      [data-tawk-widget] .tawk-chat,
      #tawk-widget .tawk-chat,
      iframe[src*="tawk"] + div .tawk-chat {
        left: 30px !important;
        bottom: 100px !important;
        right: auto !important;
      }
      
      /* Override any theme positioning with maximum specificity */
      html body .tawk-widget-container,
      html body [data-tawk-widget],
      html body #tawk-widget,
      html body div[style*="position: fixed"],
      html body div[style*="bottom"] {
        position: fixed !important;
        left: 30px !important;
        bottom: 30px !important;
        top: auto !important;
        transform: none !important;
        right: auto !important;
      }
      
      /* Force override any inline styles */
      div[style*="position: fixed"][style*="bottom"] {
        position: fixed !important;
        left: 30px !important;
        bottom: 30px !important;
        top: auto !important;
        transform: none !important;
        right: auto !important;
      }
    `;
    
    // Remove existing test style if it exists
    const existingStyle = document.getElementById('tawk-positioning-test');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    // Add the new positioning style
    document.head.appendChild(style);
    console.log('✅ Tawk widget positioned to bottom-left for testing');
    
    // Also directly modify any existing Tawk elements
    const tawkElements = document.querySelectorAll('[data-tawk-widget], #tawk-widget, iframe[src*="tawk"], div[id*="tawk"], div[class*="tawk"], div[style*="position: fixed"]');
    tawkElements.forEach(el => {
      if (el) {
        el.style.position = 'fixed';
        el.style.left = '30px';
        el.style.bottom = '30px';
        el.style.top = 'auto';
        el.style.transform = 'none';
        el.style.right = 'auto';
        el.style.width = '60px';
        el.style.height = '60px';
        el.style.zIndex = '999999';
        console.log('✅ Directly positioned Tawk element for testing:', el);
      }
    });
  } catch(e) {
    console.log('❌ Error positioning Tawk:', e);
  }
};

function isSupportIntent(text) {
  const t = String(text).toLowerCase();
  // English variants
  const en = [
    /\b(customer\s*support|customer\s*service|help\s*desk|helpdesk|live\s*support)\b/i,
    /(talk|speak|chat|connect)\s*(to|with)?\s*(a|an)?\s*(human|person|agent|representative|rep|advisor|assistant)/i,
    /(contact|reach)\s*(support|agent|representative|rep)/i,
    /(need|want|get)\s*(help|assistance)\s*(from)?\s*(someone|a\s*person|agent)?/i,
    /\b(live\s*agent|live\s*chat)\b/i,
    /\b(escalate|transfer)\s*(me)?\s*(to)?\s*(agent|human|support)\b/i
  ];
  // French variants (basic)
  const fr = [
    /\b(service\s*client|support|assistance|aide)\b/i,
    /(parler|discuter|parlez|connecter)\s*(avec)?\s*(un|une)?\s*(humain|personne|agent|conseiller)/i,
    /(besoin|je\s*veux)\s*d'?aide|assistance/i
  ];
  return [...en, ...fr].some(r => r.test(t));
}

// Ensure stylist popup script is present, then resolve
const STYLIST_POPUP_VERSION = "2025-01-08-1";
function ensureStylistPopup() {
  return new Promise((resolve) => {
    if (window.JUNS && window.JUNS.stylist && typeof window.JUNS.stylist.open === 'function') return resolve(true);
    try {
      const base = ASSET_ORIGIN ? `${ASSET_ORIGIN}/stylist-popup.js` : '/stylist-popup.js';
      const url = `${base}?v=${STYLIST_POPUP_VERSION}`;
      const exist = Array.from(document.getElementsByTagName('script')).some(s => (s.src || '').includes('stylist-popup.js'));
      if (exist) {
        setTimeout(() => resolve(Boolean(window.JUNS && window.JUNS.stylist)), 300);
        return;
      }
      const s = document.createElement('script');
      s.async = true; s.src = url;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    } catch (error) {
      console.warn('[JUNS chatbot] Unable to ensure stylist popup script:', error);
      resolve(false);
    }
  });
}

function createMessage(content, isUser = false) {
  const message = document.createElement("div");
  message.className = `bubble ${isUser ? "user" : "ai"}`;
  if (isUser) {
    message.textContent = content;
  } else {
    // Allow basic formatting and clickable links from trusted server responses
    const html = String(content);
    // Render simple product card markup if present
    if (html.includes('<div class="product-grid"')) {
      message.innerHTML = html;
    } else {
      message.innerHTML = html.replace(/\n/g, '<br>');
    }
  }
  return message;
}

function initChat() {
  const root = ensureShadowRoot();
  // Idle prefetch of stylesheet so first open is fast but not blocking page load
  try {
    const prefetch = () => loadFullStylesOnce(root);
    if ('requestIdleCallback' in window) window.requestIdleCallback(prefetch, { timeout: 1200 });
    else setTimeout(prefetch, 1200);
  } catch(_) {}
  // Also pre-load Tawk silently so opening is instant later
  try {
    const preload = () => loadTawkOnce();
    if ('requestIdleCallback' in window) window.requestIdleCallback(preload, { timeout: 3000 });
    else setTimeout(preload, 3000);
  } catch(_) {}
  let chatContainer = root.getElementById && root.getElementById("juns-ai-chatbox");
  if (!chatContainer) {
    chatContainer = document.createElement("div");
    chatContainer.id = "juns-ai-chatbox";
    chatContainer.style.display = "none"; // start hidden, toggled by launcher
    const lang = detectLang();
    const T = I18N[lang];
    chatContainer.innerHTML = `
      <div class="chat-header">
        <div class="chat-title-line" aria-label="JUN'S AI">JUN’S AI</div>
        <button id="juns-close" aria-label="Close">×</button>
      </div>
      <div class="chat-messages chat-body" id="chatMessages"></div>
      <div class="chat-input">
        <textarea id="chatInput" placeholder="${T.inputPlaceholder}" rows="1" aria-label="${T.inputPlaceholder}"></textarea>
        <button id="juns-send" aria-label="Send">➤</button>
      </div>
      <div class="quick-actions" id="juns-quick-actions" style="display:flex;gap:8px;padding:6px 8px 10px;flex-wrap:wrap;border-top:1px solid #eee">
        <button data-action="recommend" style="background:#f5f5f5;border:1px solid #e5e5e5;border-radius:16px;padding:6px 10px;font-size:12px;cursor:pointer">${T.quick.recommend}</button>
        <button data-action="sizing" style="background:#f5f5f5;border:1px solid #e5e5e5;border-radius:16px;padding:6px 10px;font-size:12px;cursor:pointer">${T.quick.sizing}</button>
        <button data-action="delivery" style="background:#f5f5f5;border:1px solid #e5e5e5;border-radius:16px;padding:6px 10px;font-size:12px;cursor:pointer">${T.quick.delivery}</button>
        <button data-action="tracking" style="background:#f5f5f5;border:1px solid #e5e5e5;border-radius:16px;padding:6px 10px;font-size:12px;cursor:pointer">${T.quick.tracking}</button>
        <button data-action="complete" style="background:#f5f5f5;border:1px solid #e5e5e5;border-radius:16px;padding:6px 10px;font-size:12px;cursor:pointer">${T.quick.complete}</button>
      </div>
    `;
    root.appendChild(chatContainer);
  }

  const input = root.getElementById("chatInput");
  // chat-input-font-guard
  try {
    if (input) { input.style.fontSize = '16px'; input.style.webkitTextSizeAdjust = '100%'; }
    if (typeof document !== 'undefined' && document.documentElement) { document.documentElement.style.webkitTextSizeAdjust = '100%'; }
  } catch(_) {}
  const messages = root.getElementById("chatMessages");
  const sendBtn = root.getElementById("juns-send");
  const quickActions = root.getElementById("juns-quick-actions");

  // Avoid attaching duplicate listeners on repeated opens
  if (chatContainer.dataset.bound === '1') {
    return;
  }
  chatContainer.dataset.bound = '1';

  async function sendCurrentMessage() {
    if (!input.value.trim()) return;
    const userMessage = input.value.trim();
    await sendMessageText(userMessage);
  }

  async function sendMessageText(userMessage) {
    if (!userMessage || !userMessage.trim()) return;
    messages.appendChild(createMessage(userMessage, true));
    input.value = "";

    // Frontend shortcut: live agent intent -> open Tawk and return
    if (isSupportIntent(userMessage)) {
      const connecting = I18N[detectLang()].connecting;
      messages.appendChild(createMessage(connecting));
      messages.scrollTop = messages.scrollHeight;
      // Wait ~4s so the user sees the confirmation, then open Tawk
      setTimeout(() => {
        openLiveChat();
      }, 4000);
      return;
    }

    const loading = createMessage("...");
    messages.appendChild(loading);
    messages.scrollTop = messages.scrollHeight;

    try {
      // Ensure a persistent session id for better context
      let sessionId = localStorage.getItem("juns_session_id");
      if (!sessionId) {
        sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem("juns_session_id", sessionId);
      }

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          lang: detectLang(),
          storeUrl: window.location.origin,
          sessionId
        }),
      });
      const data = await res.json();
      loading.remove();
      messages.appendChild(createMessage(data.reply || "Sorry, I couldn't find that."));
      messages.scrollTop = messages.scrollHeight;
      
      // Check if we need to trigger live chat
      if (data.triggerLiveChat) {
        setTimeout(() => {
          openLiveChat();
        }, 2000); // Wait 2 seconds to show the message, then open live chat
      }
    } catch (err) {
      loading.remove();
      messages.appendChild(createMessage("❌ Error, try again."));
    }
  }

  // Auto-grow textarea up to 5 lines
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    const max = 5 * 20; // approx 5 lines
    input.style.height = Math.min(input.scrollHeight, max) + 'px';
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCurrentMessage();
    }
  });
  if (sendBtn) sendBtn.addEventListener("click", sendCurrentMessage);
  if (quickActions && !quickActions.dataset.bound) {
    quickActions.dataset.bound = '1';
    quickActions.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      if (action === 'recommend') {
        (async () => {
          const ok = await ensureStylistPopup();
          if (window.JUNS && window.JUNS.stylist && typeof window.JUNS.stylist.open === 'function') {
            window.JUNS.stylist.open();
          } else if (!ok) {
            // Fallback: navigate to recommendations page without params (respect FR path)
            const isFr = detectLang() === 'fr';
            var handle = (typeof window !== 'undefined' && window.JUNS_RECOMMENDATIONS_HANDLE) ? window.JUNS_RECOMMENDATIONS_HANDLE : 'event-dress-recommendations';
            window.location.href = (isFr ? '/fr' : '') + '/pages/' + handle;
          }
        })();
        return;
      }
      if (action === 'sizing') {
        const T = I18N[detectLang()];
        input.placeholder = T.sizingPlaceholder;
        input.focus();
        // Trigger backend only (no duplicate guidance bubble)
        sendMessageText('size help');
        return;
      }
      if (action === 'delivery') {
        const T = I18N[detectLang()];
        input.placeholder = T.deliveryPlaceholder;
        input.focus();
        const typed = (input.value || '').trim();
        sendMessageText(typed ? `shipping to ${typed}` : 'delivery time');
        return;
      }
      if (action === 'tracking') {
        input.placeholder = 'Tracking number...';
        input.focus();
        // Trigger backend prompt flow (no duplicate instructions)
        sendMessageText('track order');
        return;
      }
      if (action === 'complete') {
        input.placeholder = 'Optional: color preference...';
        input.focus();
        sendMessageText('complete my look');
        return;
      }
    });
  }

  // Handle keyboard overlap on mobile
  input.addEventListener('focus', () => {
    chatContainer.classList.add('kbd-open');
    setTimeout(() => { messages.scrollTop = messages.scrollHeight; }, 150);
  });
  input.addEventListener('blur', () => {
    chatContainer.classList.remove('kbd-open');
  });

  // visualViewport adjustment for iOS/Android keyboards
  if (window.visualViewport) {
    const handler = () => {
      const offset = Math.max(12, (window.visualViewport.height < window.innerHeight) ? 12 : 16);
      chatContainer.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${offset}px)`;
    };
    window.visualViewport.addEventListener('resize', handler, { passive: true });
  }
}

function createLauncher() {
  // Bubble launcher
  const root = ensureShadowRoot();
  if (root.getElementById && root.getElementById("juns-ai-button")) return;
  const btn = document.createElement("div");
  btn.id = "juns-ai-button";
  btn.innerHTML = `<div id="chat-circle"><div class="bubble-title"><span class="brand">JUN’S</span><span class="sub">AI</span></div></div>`;
  root.appendChild(btn);

  // Removed: showNudge function - was too pushy for customers

  btn.addEventListener("click", async () => {
    initChat();
    const box = root.getElementById("juns-ai-chatbox");
    const closeBtn = root.getElementById("juns-close");
    if (!box || box.style.display === "none") {
      await loadFullStylesOnce(root);
      box.style.display = "flex";
      // First-time greeting per browser/session
      try {
        const greeted = sessionStorage.getItem('juns_greeted');
        const messages = root.getElementById('chatMessages');
        if (!greeted && messages) {
          const greeting = I18N[detectLang()].greet;
          // Avoid duplicate greeting if already present
          const last = messages.lastElementChild;
          const already = last && (last.textContent||'').indexOf('JUN’') !== -1;
          if (!already) messages.appendChild(createMessage(greeting));
          messages.scrollTop = messages.scrollHeight;
          sessionStorage.setItem('juns_greeted','1');
        }
        sessionStorage.setItem('juns_chat_opened','1');
      } catch (error) {
        console.warn('[JUNS chatbot] Unable to persist greeting state:', error);
      }
    } else {
      box.style.display = "none";
    }
    if (closeBtn) {
      closeBtn.onclick = () => { box.style.display = "none"; };
    }
  });

  // Removed: 2-minute nudge was too pushy for customers
}

// Robust boot: initialize even if load already fired or theme delays events
(function bootJunsAI() {
  const boot = () => { try { createLauncher(); } catch(_) {} };
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 50);
  } else {
    window.addEventListener('load', () => setTimeout(boot, 50), { once: true });
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 50), { once: true });
  }
  // Safety: ensure the launcher remains visible shortly after boot across themes
  let attempts = 0;
  const vis = setInterval(() => {
    attempts++;
    try {
      const host = document.getElementById('juns-ai-root');
      const sh = host && host.shadowRoot;
      const bubble = sh && sh.getElementById('juns-ai-button');
      if (bubble) {
        bubble.style.display = 'block';
        bubble.style.visibility = 'visible';
        bubble.style.opacity = '1';
        bubble.style.zIndex = '2147483647';
        clearInterval(vis);
      }
    } catch(_) {}
    if (attempts > 40) clearInterval(vis); // ~20s max
  }, 500);
})();

} // Close the else block for preventing multiple loads
