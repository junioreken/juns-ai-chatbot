<script>
(function () {
  window.JUNS = window.JUNS || {};
  var loaded = false, loading = false, queue = [];

  function ensureTawk(cb) {
    if (loaded && window.Tawk_API) { cb(); return; }
    queue.push(cb);
    if (loading) return;
    loading = true;

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    var s1 = document.createElement('script'),
        s0 = document.getElementsByTagName('script')[0];
    s1.async = true;
    /* Replace with your own property ID if needed */
    s1.src = 'https://embed.tawk.to/68a6b4e77ebce11927981c0e/1j35j5a9d';
    s1.charset = 'UTF-8';
    s1.setAttribute('crossorigin', '*');
    s1.onload = function () {
      loaded = true;
      try { 
        Tawk_API.hideWidget(); 
        // Set up positioning when Tawk loads
        setupTawkPositioning();
      } catch (e) {}
      var f; while ((f = queue.shift())) { try { f(); } catch (e) {} }
    };
    (s0 && s0.parentNode ? s0.parentNode : document.head).insertBefore(s1, s0 || null);
  }

  function setupTawkPositioning() {
    // Add CSS to position Tawk widget to middle-right when closed - ULTRA AGGRESSIVE
    const style = document.createElement('style');
    style.id = 'theme-tawk-positioning';
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
        right: 30px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        z-index: 999999 !important;
        width: 60px !important;
        height: 60px !important;
        bottom: auto !important;
        left: auto !important;
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
        right: 0 !important;
        bottom: 0 !important;
        top: auto !important;
        transform: none !important;
        width: 60px !important;
        height: 60px !important;
        border-radius: 50% !important;
        left: auto !important;
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
        right: 30px !important;
        bottom: 80px !important;
      }
      
      /* Override any theme positioning with maximum specificity */
      html body .tawk-widget-container,
      html body [data-tawk-widget],
      html body #tawk-widget,
      html body div[style*="position: fixed"],
      html body div[style*="bottom"] {
        position: fixed !important;
        right: 30px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        bottom: auto !important;
        left: auto !important;
      }
      
      /* Force override any inline styles */
      div[style*="position: fixed"][style*="bottom"] {
        position: fixed !important;
        right: 30px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        bottom: auto !important;
        left: auto !important;
      }
    `;
    
    // Remove existing positioning style if it exists
    const existingStyle = document.getElementById('theme-tawk-positioning');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    // Add the new positioning style
    document.head.appendChild(style);
    console.log('✅ Theme Tawk widget positioned to center-right');
    
    // Also directly modify any existing Tawk elements immediately
    setTimeout(() => {
      const tawkElements = document.querySelectorAll('[data-tawk-widget], #tawk-widget, iframe[src*="tawk"], div[id*="tawk"], div[class*="tawk"], div[style*="position: fixed"]');
      tawkElements.forEach(el => {
        if (el) {
          el.style.position = 'fixed';
          el.style.right = '30px';
          el.style.top = '50%';
          el.style.transform = 'translateY(-50%)';
          el.style.bottom = 'auto';
          el.style.left = 'auto';
          el.style.width = '60px';
          el.style.height = '60px';
          el.style.zIndex = '999999';
          console.log('✅ Directly positioned Tawk element:', el);
        }
      });
    }, 1000);
    
    // Set up continuous monitoring to catch Tawk widget whenever it appears
    let tawkMonitor = setInterval(() => {
      const tawkElements = document.querySelectorAll('[data-tawk-widget], #tawk-widget, iframe[src*="tawk"], div[id*="tawk"], div[class*="tawk"], div[style*="position: fixed"]');
      tawkElements.forEach(el => {
        if (el && (el.style.bottom || el.style.right === '20px' || el.style.right === '10px')) {
          el.style.position = 'fixed';
          el.style.right = '30px';
          el.style.top = '50%';
          el.style.transform = 'translateY(-50%)';
          el.style.bottom = 'auto';
          el.style.left = 'auto';
          el.style.width = '60px';
          el.style.height = '60px';
          el.style.zIndex = '999999';
          console.log('🔄 Continuously repositioned Tawk element:', el);
        }
      });
    }, 500); // Check every 500ms
    
    // Stop monitoring after 30 seconds
    setTimeout(() => {
      clearInterval(tawkMonitor);
      console.log('⏹️ Stopped Tawk monitoring');
    }, 30000);
  }

  window.JUNS.support = {
    open: function () {
      // Close GPT chatbot UI (optional)
      try {
        var host = document.getElementById('juns-ai-root');
        var shadow = host && host.shadowRoot;
        var box = shadow && shadow.getElementById('juns-ai-chatbox');
        if (box) box.style.display = 'none';
      } catch (e) {}

      ensureTawk(function () {
        try { 
          Tawk_API.showWidget(); 
          Tawk_API.maximize(); 
        } catch (e) {}
      });
    },
    hide: function () {
      try { if (window.Tawk_API) Tawk_API.hideWidget(); } catch (e) {}
    }
  };
})();
</script>
