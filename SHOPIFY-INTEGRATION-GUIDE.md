# 🛍️ JUN'S AI Chatbot - Shopify Integration Guide

## ✅ **Outfit Recommendations Now Fixed!**

Your AI chatbot now properly understands and responds to outfit requests like:
- "recommend me outfit" 
- "show me outfits"
- "what outfit should I wear"
- "outfit ideas"
- "fashion help"

## 🚀 **Quick Start (3 Options)**

### **Option 1: Test Without OpenAI (Immediate)**
```bash
# Start test server with outfit recommendations
node test-server.js

# Open browser to test
# http://localhost:3001
```

### **Option 2: Full Setup with OpenAI**
```bash
# 1. Run setup script
node setup-env.js

# 2. Edit .env file with your credentials
# OPENAI_API_KEY=your_key_here
# SHOPIFY_DOMAIN=your-store.myshopify.com
# SHOPIFY_API_TOKEN=your_token_here

# 3. Start main server
npm start
```

### **Option 3: Deploy to Railway (Production)**
```bash
# 1. Push to GitHub
git push origin main

# 2. Deploy to Railway with environment variables:
# - OPENAI_API_KEY
# - SHOPIFY_DOMAIN  
# - SHOPIFY_API_TOKEN
# - REDIS_URL (optional)
```

## 🔧 **Shopify Store Integration**

### **1. Get Shopify API Credentials**

1. **Go to your Shopify Admin**
2. **Navigate to Apps > App and sales channel settings**
3. **Click "Develop apps"**
4. **Create a new app** or use existing
5. **Configure Admin API access scopes:**
   - `read_products`
   - `read_orders`
   - `read_customers`
   - `read_discounts`
6. **Install the app and get:**
   - **API Token** (Admin API access token)
   - **Store Domain** (your-store.myshopify.com)

### **2. Update Environment Variables**

```bash
# Edit .env file
SHOPIFY_DOMAIN=your-store.myshopify.com
SHOPIFY_API_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### **3. Test with Real Products**

```bash
# Start server
npm start

# Test outfit recommendations with real Shopify products
curl -X POST http://localhost:3000/api/enhanced-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "recommend me outfit", "lang": "en"}'
```

## 🎯 **What's Fixed**

### **Before (Broken)**
- "recommend me outfit" → Asked for measurements
- "show me outfits" → Asked for measurements  
- Generic responses without product suggestions

### **After (Fixed)**
- "recommend me outfit" → Shows actual outfit recommendations
- "show me outfits" → Displays product grid with outfits
- "what outfit should I wear" → Provides styling advice
- All outfit requests properly routed to product discovery

## 📱 **Frontend Integration**

### **Update Your Chatbot Script**

Replace your current chatbot script with:

```javascript
// In your Shopify theme's chatbot script
const chatbotConfig = {
  apiUrl: 'https://your-railway-app.railway.app/api/enhanced-chat',
  // or for local testing: 'http://localhost:3000/api/enhanced-chat'
};

// Send messages to the enhanced endpoint
async function sendMessage(message) {
  const response = await fetch(chatbotConfig.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message,
      name: customerName,
      email: customerEmail,
      lang: 'en',
      storeUrl: window.location.origin
    })
  });
  
  const data = await response.json();
  return data.reply; // This will now include outfit recommendations!
}
```

## 🧪 **Testing Your Integration**

### **Test Phrases to Try:**
1. "recommend me outfit"
2. "show me outfits" 
3. "what outfit should I wear"
4. "outfit ideas"
5. "fashion help"
6. "what should I wear for a party"
7. "help me find a dress"

### **Expected Results:**
- ✅ Product recommendations with images
- ✅ Specific outfit suggestions
- ✅ No more sizing help responses
- ✅ Contextual fashion advice

## 🔍 **Debugging**

### **Check Server Logs:**
```bash
# Look for these success messages:
🎯 Intent: product_inquiry (95.0%)
✅ Using real Shopify products from your-store.myshopify.com
```

### **Test API Directly:**
```bash
# Test the enhanced chat endpoint
curl -X POST http://localhost:3000/api/enhanced-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "recommend me outfit"}' \
  | jq '.reply'
```

## 🚀 **Deployment Checklist**

- [ ] Environment variables configured
- [ ] Shopify API credentials added
- [ ] OpenAI API key added (optional)
- [ ] Server starts without errors
- [ ] Outfit recommendations working
- [ ] Frontend chatbot updated
- [ ] Tested with real products

## 💡 **Pro Tips**

1. **Start with test server** to verify outfit recommendations work
2. **Add OpenAI API key** for more intelligent responses
3. **Use real Shopify products** for accurate recommendations
4. **Test all outfit-related phrases** to ensure proper routing
5. **Monitor server logs** for intent classification success

Your outfit recommendation system is now fully functional! 🎉
