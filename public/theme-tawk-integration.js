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
    // Add CSS to position Tawk widget to middle-right when closed
    const style = document.createElement('style');
    style.id = 'theme-tawk-positioning';
    style.textContent = `
      /* Position Tawk widget to middle-right, smaller size - override default positioning */
      .tawk-widget-container,
      [data-tawk-widget],
      #tawk-widget,
      iframe[src*="tawk"],
      div[id*="tawk"],
      div[class*="tawk"] {
        position: fixed !important;
        right: 30px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        z-index: 999999 !important;
        width: 60px !important;
        height: 60px !important;
        bottom: auto !important;
      }
      
      /* Make Tawk button smaller and properly positioned */
      .tawk-widget-container .tawk-button,
      [data-tawk-widget] .tawk-button,
      #tawk-widget .tawk-button,
      iframe[src*="tawk"] + div,
      div[id*="tawk"] .tawk-button,
      div[class*="tawk"] .tawk-button {
        position: relative !important;
        right: 0 !important;
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
      div[class*="tawk"] .tawk-button svg {
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
      
      /* Override any default positioning */
      body .tawk-widget-container,
      body [data-tawk-widget],
      body #tawk-widget {
        position: fixed !important;
        right: 30px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        bottom: auto !important;
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
