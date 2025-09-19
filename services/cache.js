const redis = require('redis');

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    // In-memory fallback when Redis is not available
    this.memoryEnabled = false;
    this.memoryStore = new Map();
    this.memoryTimers = new Map();
    this.init();
  }

  async init() {
    try {
      // Only attempt Redis connection if REDIS_URL is provided
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        console.log('ℹ️ Redis is disabled (no REDIS_URL). Using in-memory cache fallback.');
        this.client = null;
        this.isConnected = false;
        this.memoryEnabled = true;
        return;
      }

      this.client = redis.createClient({ url: redisUrl });

      this.client.on('error', (err) => {
        console.error('❌ Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('✅ Redis Connected');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      console.error('❌ Redis Connection Failed:', error);
      this.isConnected = false;
    }
  }

  async get(key) {
    if (!this.isConnected || !this.client) {
      if (this.memoryEnabled) {
        return this.memoryStore.has(key) ? this.memoryStore.get(key) : null;
      }
      return null;
    }
    
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('❌ Cache Get Error:', error);
      return null;
    }
  }

  async set(key, value, ttl = 900) { // Default 15 minutes
    if (!this.isConnected || !this.client) {
      if (this.memoryEnabled) {
        this.memoryStore.set(key, value);
        if (this.memoryTimers.has(key)) clearTimeout(this.memoryTimers.get(key));
        const timer = setTimeout(() => {
          this.memoryStore.delete(key);
          this.memoryTimers.delete(key);
        }, ttl * 1000);
        this.memoryTimers.set(key, timer);
        return true;
      }
      return false;
    }
    
    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('❌ Cache Set Error:', error);
      return false;
    }
  }

  async del(key) {
    if (!this.isConnected || !this.client) {
      if (this.memoryEnabled) {
        if (this.memoryTimers.has(key)) clearTimeout(this.memoryTimers.get(key));
        this.memoryTimers.delete(key);
        return this.memoryStore.delete(key);
      }
      return false;
    }
    
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('❌ Cache Delete Error:', error);
      return false;
    }
  }

  async flush() {
    if (!this.isConnected || !this.client) {
      if (this.memoryEnabled) {
        this.memoryStore.clear();
        for (const t of this.memoryTimers.values()) clearTimeout(t);
        this.memoryTimers.clear();
        return true;
      }
      return false;
    }
    
    try {
      await this.client.flushDb();
      return true;
    } catch (error) {
      console.error('❌ Cache Flush Error:', error);
      return false;
    }
  }

  // Cache keys for different data types
  getProductCacheKey(limit = 10) {
    return `products:${limit}:${new Date().toDateString()}`;
  }

  getPoliciesCacheKey() {
    return `policies:${new Date().toDateString()}`;
  }

  getPagesCacheKey() {
    return `pages:${new Date().toDateString()}`;
  }

  getDiscountsCacheKey() {
    return `discounts:${new Date().toDateString()}`;
  }

  getOrderCacheKey(email) {
    return `order:${email}:${new Date().toDateString()}`;
  }

  getRecommendationCacheKey(theme) {
    return `recommendation:${theme}:${new Date().toDateString()}`;
  }
}

// Export singleton instance
module.exports = new CacheService();
