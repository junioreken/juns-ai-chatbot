#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 JUN\'S AI Chatbot Environment Setup\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
const envExists = fs.existsSync(envPath);

if (envExists) {
  console.log('✅ .env file already exists');
  console.log('📝 Current environment variables:');
  
  // Load and display current env vars
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  
  lines.forEach(line => {
    const [key] = line.split('=');
    console.log(`   - ${key}`);
  });
} else {
  console.log('📝 Creating .env file...');
  
  const envTemplate = `# JUN'S AI Chatbot Environment Configuration
# Copy this file and fill in your actual values

# OpenAI Configuration (Required for AI features)
OPENAI_API_KEY=your_openai_api_key_here

# Shopify Configuration (Required for product data)
SHOPIFY_DOMAIN=your-shopify-store.myshopify.com
SHOPIFY_API_TOKEN=your_shopify_api_token_here

# Redis Configuration (Optional - for caching)
REDIS_URL=redis://localhost:6379

# Server Configuration
PORT=3000
NODE_ENV=development
`;

  fs.writeFileSync(envPath, envTemplate);
  console.log('✅ .env file created');
}

console.log('\n📋 Setup Instructions:');
console.log('1. Get your OpenAI API key from: https://platform.openai.com/api-keys');
console.log('2. Get your Shopify API token from your Shopify admin');
console.log('3. Edit the .env file with your actual values');
console.log('4. Run: npm start');

console.log('\n🚀 Quick Start (without OpenAI):');
console.log('1. Run: node test-server.js');
console.log('2. Open: http://localhost:3001');
console.log('3. Test outfit recommendations!');

console.log('\n💡 The outfit recommendation fixes are already integrated!');
console.log('   - "recommend me outfit" will show product recommendations');
console.log('   - "show me outfits" will display outfit suggestions');
console.log('   - All outfit-related phrases are now properly handled');
