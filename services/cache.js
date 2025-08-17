const redis = require('redis');

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.init();
  }

  async init() {
    try {
      // Use Redis URL from environment or default to localhost
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
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
    if (!this.isConnected || !this.client) return null;
    
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('❌ Cache Get Error:', error);
      return null;
    }
  }

  async set(key, value, ttl = 900) { // Default 15 minutes
    if (!this.isConnected || !this.client) return false;
    
    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('❌ Cache Set Error:', error);
      return false;
    }
  }

  async del(key) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('❌ Cache Delete Error:', error);
      return false;
    }
  }

  async flush() {
    if (!this.isConnected || !this.client) return false;
    
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
