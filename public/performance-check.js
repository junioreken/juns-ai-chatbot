// Simple Performance Check for JUN'S AI Chatbot
// Add this script to your page to monitor performance improvements

(function() {
  'use strict';
  
  console.log('🔍 JUN\'S AI Performance Monitor Started');
  
  // Track page load performance
  const startTime = performance.now();
  let domReady = false;
  let windowLoaded = false;
  
  // DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    domReady = true;
    const domTime = performance.now() - startTime;
    console.log(`📊 DOM Ready: ${Math.round(domTime)}ms`);
  });
  
  // Window loaded
  window.addEventListener('load', () => {
    windowLoaded = true;
    const loadTime = performance.now() - startTime;
    console.log(`📊 Window Loaded: ${Math.round(loadTime)}ms`);
    
    // Check for performance issues
    setTimeout(() => {
      checkPerformance();
    }, 2000);
  });
  
  // Monitor long tasks
  if ('PerformanceObserver' in window) {
    const longTaskObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.duration > 100) {
          console.warn(`⚠️ Long Task Detected: ${Math.round(entry.duration)}ms`);
        }
      });
    });
    
    try {
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      console.log('Long task observation not supported');
    }
  }
  
  // Check performance after page is stable
  function checkPerformance() {
    const loadTime = performance.now() - startTime;
    
    console.log('📊 Performance Summary:');
    console.log(`  - Total Load Time: ${Math.round(loadTime)}ms`);
    
    // Check memory usage
    if ('memory' in performance) {
      const memory = performance.memory;
      console.log(`  - Memory Used: ${Math.round(memory.usedJSHeapSize / 1048576)}MB`);
      console.log(`  - Memory Total: ${Math.round(memory.totalJSHeapSize / 1048576)}MB`);
    }
    
    // Check for chatbot elements
    const chatbotElements = document.querySelectorAll('[id*="juns"], [id*="chat"], [id*="tawk"]');
    console.log(`  - Chatbot Elements: ${chatbotElements.length}`);
    
    // Performance recommendations
    if (loadTime > 3000) {
      console.warn('⚠️ Slow page load detected. Consider:');
      console.warn('  - Using defer attribute on scripts');
      console.warn('  - Reducing script size');
      console.warn('  - Optimizing images and videos');
    } else {
      console.log('✅ Good page load performance!');
    }
    
    if (chatbotElements.length > 10) {
      console.warn('⚠️ Many chatbot elements detected. Consider optimizing DOM structure.');
    }
  }
  
  // Monitor script loading
  const scripts = document.querySelectorAll('script[src]');
  const chatbotScripts = Array.from(scripts).filter(s => 
    s.src.includes('chatbot') || s.src.includes('tawk')
  );
  
  if (chatbotScripts.length > 0) {
    console.log('📜 Chatbot Scripts Found:');
    chatbotScripts.forEach(script => {
      console.log(`  - ${script.src}`);
    });
  }
  
})();
