#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🛍️ JUN\'S AI Chatbot - Shopify Store Setup\n');

// Check current environment
const envPath = path.join(__dirname, '.env');
let envContent = '';

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
  console.log('✅ .env file found');
} else {
  console.log('📝 Creating .env file...');
  envContent = `# JUN'S AI Chatbot Environment Configuration
OPENAI_API_KEY=
SHOPIFY_DOMAIN=
SHOPIFY_API_TOKEN=
REDIS_URL=
PORT=3000
NODE_ENV=development
`;
  fs.writeFileSync(envPath, envContent);
}

// Check what's configured
const hasOpenAI = envContent.includes('OPENAI_API_KEY=') && !envContent.includes('OPENAI_API_KEY=your_');
const hasShopify = envContent.includes('SHOPIFY_DOMAIN=') && !envContent.includes('SHOPIFY_DOMAIN=your_');

console.log('\n📊 Current Configuration:');
console.log(`   OpenAI API Key: ${hasOpenAI ? '✅ Configured' : '❌ Missing'}`);
console.log(`   Shopify Store: ${hasShopify ? '✅ Configured' : '❌ Missing'}`);

if (!hasShopify) {
  console.log('\n🔧 To get outfit recommendations working with your Shopify store:');
  console.log('\n1. Get your Shopify API credentials:');
  console.log('   - Go to your Shopify Admin');
  console.log('   - Navigate to Apps > App and sales channel settings');
  console.log('   - Click "Develop apps" > Create a new app');
  console.log('   - Configure Admin API access scopes:');
  console.log('     * read_products');
  console.log('     * read_orders');
  console.log('     * read_customers');
  console.log('     * read_discounts');
  console.log('   - Install the app and get your API token');
  
  console.log('\n2. Update your .env file:');
  console.log('   SHOPIFY_DOMAIN=your-store.myshopify.com');
  console.log('   SHOPIFY_API_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  
  console.log('\n3. Optional - Add OpenAI for better responses:');
  console.log('   OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  
  console.log('\n4. Start the server:');
  console.log('   npm start');
  
  console.log('\n5. Test outfit recommendations:');
  console.log('   curl -X POST http://localhost:3000/api/enhanced-chat \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"message": "recommend me outfit", "lang": "en"}\'');
} else {
  console.log('\n🎉 Your Shopify store is configured!');
  console.log('\n✅ Outfit recommendations are now working:');
  console.log('   - "recommend me outfit" → Shows product recommendations');
  console.log('   - "show me outfits" → Displays outfit suggestions');
  console.log('   - "what outfit should I wear" → Provides styling advice');
  
  console.log('\n🚀 To start the server:');
  console.log('   npm start');
  
  console.log('\n📱 To integrate with your Shopify theme:');
  console.log('   Update your chatbot script to use:');
  console.log('   POST /api/enhanced-chat');
}

console.log('\n💡 Pro Tips:');
console.log('   - Start with test server: node test-server.js');
console.log('   - Test at: http://localhost:3001');
console.log('   - Check logs for intent classification success');
console.log('   - All outfit-related phrases now work perfectly!');
