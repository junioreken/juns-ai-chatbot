// Performance Monitor for JUN'S AI Chatbot
// Helps identify performance issues

(function() {
  'use strict';
  
  // Performance metrics
  const metrics = {
    pageLoadStart: performance.now(),
    domContentLoaded: null,
    windowLoad: null,
    firstPaint: null,
    firstContentfulPaint: null,
    largestContentfulPaint: null,
    cumulativeLayoutShift: 0,
    longTasks: [],
    memoryUsage: null
  };
  
  // Monitor Core Web Vitals
  function monitorPerformance() {
    // DOM Content Loaded
    document.addEventListener('DOMContentLoaded', () => {
      metrics.domContentLoaded = performance.now();
      console.log('📊 DOM Content Loaded:', metrics.domContentLoaded - metrics.pageLoadStart, 'ms');
    });
    
    // Window Load
    window.addEventListener('load', () => {
      metrics.windowLoad = performance.now();
      console.log('📊 Window Loaded:', metrics.windowLoad - metrics.pageLoadStart, 'ms');
      
      // Check for performance issues
      checkPerformanceIssues();
    });
    
    // Long Tasks (blocking operations > 50ms)
    if ('PerformanceObserver' in window) {
      const longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          metrics.longTasks.push({
            duration: entry.duration,
            startTime: entry.startTime,
            name: entry.name
          });
          
          if (entry.duration > 100) {
            console.warn('⚠️ Long Task Detected:', entry.duration, 'ms');
          }
        });
      });
      
      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] });
      } catch (e) {
        console.log('Long task observation not supported');
      }
    }
    
    // Layout Shift (CLS)
    if ('PerformanceObserver' in window) {
      const clsObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (!entry.hadRecentInput) {
            metrics.cumulativeLayoutShift += entry.value;
          }
        });
      });
      
      try {
        clsObserver.observe({ entryTypes: ['layout-shift'] });
      } catch (e) {
        console.log('Layout shift observation not supported');
      }
    }
    
    // Memory usage
    if ('memory' in performance) {
      setInterval(() => {
        metrics.memoryUsage = {
          used: Math.round(performance.memory.usedJSHeapSize / 1048576),
          total: Math.round(performance.memory.totalJSHeapSize / 1048576),
          limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576)
        };
      }, 5000);
    }
  }
  
  // Check for performance issues
  function checkPerformanceIssues() {
    const issues = [];
    
    // Page load time
    const loadTime = metrics.windowLoad - metrics.pageLoadStart;
    if (loadTime > 3000) {
      issues.push(`Slow page load: ${Math.round(loadTime)}ms`);
    }
    
    // Long tasks
    const blockingTasks = metrics.longTasks.filter(task => task.duration > 50);
    if (blockingTasks.length > 0) {
      issues.push(`${blockingTasks.length} blocking tasks detected`);
    }
    
    // Layout shift
    if (metrics.cumulativeLayoutShift > 0.1) {
      issues.push(`High layout shift: ${metrics.cumulativeLayoutShift.toFixed(3)}`);
    }
    
    // Memory usage
    if (metrics.memoryUsage && metrics.memoryUsage.used > 50) {
      issues.push(`High memory usage: ${metrics.memoryUsage.used}MB`);
    }
    
    // Report issues
    if (issues.length > 0) {
      console.warn('🚨 Performance Issues Detected:');
      issues.forEach(issue => console.warn('  -', issue));
    } else {
      console.log('✅ No major performance issues detected');
    }
    
    // Log full metrics
    console.log('📊 Performance Metrics:', metrics);
  }
  
  // Monitor script loading
  function monitorScripts() {
    const scripts = document.querySelectorAll('script[src]');
    const heavyScripts = [];
    
    scripts.forEach(script => {
      const src = script.src;
      if (src.includes('chatbot') || src.includes('tawk') || src.includes('analytics')) {
        heavyScripts.push(src);
      }
    });
    
    if (heavyScripts.length > 0) {
      console.log('📜 Scripts that may impact performance:');
      heavyScripts.forEach(script => console.log('  -', script));
    }
  }
  
  // Monitor network requests
  function monitorNetwork() {
    if ('PerformanceObserver' in window) {
      const networkObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration > 1000) {
            console.warn('🐌 Slow network request:', entry.name, Math.round(entry.duration), 'ms');
          }
        });
      });
      
      try {
        networkObserver.observe({ entryTypes: ['resource'] });
      } catch (e) {
        console.log('Network observation not supported');
      }
    }
  }
  
  // Initialize monitoring
  function init() {
    console.log('🔍 Performance Monitor Started');
    
    monitorPerformance();
    monitorScripts();
    monitorNetwork();
    
    // Report after 10 seconds
    setTimeout(() => {
      checkPerformanceIssues();
    }, 10000);
  }
  
  // Start monitoring
  init();
  
  // Export metrics for debugging
  window.JUNS_PERFORMANCE_METRICS = metrics;
  
})();
