# JUN'S AI Chatbot - Shopify Integration Guide

## Overview
This guide will help you integrate the JUN'S AI Chatbot into your Shopify store. The chatbot will appear as a floating bubble on the bottom right of your website, offering bilingual support (English/French) and answering customer questions about your store.

## Prerequisites
- A Shopify store (JUN'S)
- Access to your Shopify theme files
- The chatbot server running (hosted on Railway or similar)

## Step 1: Deploy the Chatbot Server

### Option A: Deploy to Railway (Recommended)
1. Push your code to GitHub
2. Connect your GitHub repo to Railway
3. Set the following environment variables:
   ```
   OPENAI_API_KEY=your_openai_api_key
   SHOPIFY_DOMAIN=https://your-store.myshopify.com
   SHOPIFY_API_TOKEN=your_shopify_api_token
   PORT=3000
   ```

### Option B: Deploy to Heroku
1. Create a new Heroku app
2. Connect your GitHub repo
3. Set the same environment variables as above

## Step 2: Add Chatbot to Your Shopify Theme

### Method 1: Add to theme.liquid (Recommended)
1. Go to your Shopify admin → Online Store → Themes
2. Click "Actions" → "Edit code"
3. Open `layout/theme.liquid`
4. Find the `</body>` tag
5. Add this code just before `</body>`:

```html
<!-- JUN'S AI Chatbot -->
<script src="{{ 'juns-ai-chatbot.js' | asset_url }}" defer></script>
```

6. Upload the `shopify-integration.js` file to your `assets` folder
7. Rename it to `juns-ai-chatbot.js`

### Method 2: Add as a separate asset
1. Go to your Shopify admin → Online Store → Themes
2. Click "Actions" → "Edit code"
3. Go to "Assets" folder
4. Click "Add a new asset" → "Create a blank file"
5. Name it `juns-ai-chatbot.js`
6. Copy and paste the entire content from `shopify-integration.js`
7. Save the file
8. Open `layout/theme.liquid`
9. Add the script tag before `</body>` as shown in Method 1

## Step 3: Customize the Chatbot

### Change Colors and Theme
Edit the `CHATBOT_CONFIG` object in the JavaScript file:

```javascript
const CHATBOT_CONFIG = {
  apiUrl: 'https://your-railway-app.up.railway.app/chat',
  position: 'bottom-right', // Change position if needed
  delay: 3000, // Change delay before showing
  theme: {
    primaryColor: '#000000', // Your brand color
    secondaryColor: '#333333',
    textColor: '#ffffff',
    borderRadius: '20px'
  }
};
```

### Change Position
Available positions: `bottom-right`, `bottom-left`, `top-right`, `top-left`

### Change Delay
Set `delay` to control how long to wait before showing the chatbot (in milliseconds)

## Step 4: Test the Integration

1. Save your theme changes
2. Preview your store
3. The chatbot should appear as a floating bubble after the specified delay
4. Click on it to open the chat interface
5. Test the language selection and messaging

## Step 5: Configure Environment Variables

Make sure your chatbot server has these environment variables set:

```bash
# Required
OPENAI_API_KEY=sk-your-openai-api-key-here

# Optional (for enhanced Shopify integration)
SHOPIFY_DOMAIN=https://your-store.myshopify.com
SHOPIFY_API_TOKEN=your-shopify-private-app-token
```

## Troubleshooting

### Chatbot not appearing
- Check browser console for JavaScript errors
- Verify the script is loaded in your theme
- Check if the API URL is correct and accessible

### API errors
- Verify your OpenAI API key is valid
- Check if your Railway/Heroku app is running
- Test the `/health` endpoint of your chatbot server

### Styling issues
- Check if your theme CSS conflicts with chatbot styles
- Verify the z-index values are high enough
- Test on different screen sizes

## Advanced Customization

### Add to specific pages only
Modify the script to only show on certain pages:

```javascript
// Add this check in initJunsChatbot function
const allowedPages = ['/', '/products', '/collections'];
if (!allowedPages.includes(window.location.pathname)) {
  return; // Don't show chatbot on other pages
}
```

### Custom welcome messages
Edit the welcome messages in the `createLanguageSelector` function:

```javascript
const welcomeMsg = createMessage(
  selectedLanguage === 'en' 
    ? 'Welcome to JUN\'S! I\'m here to help with fashion advice.' 
    : 'Bienvenue chez JUN\'S! Je suis là pour vous aider avec des conseils mode.',
  false,
  true
);
```

### Add analytics tracking
Track chatbot usage by adding analytics calls:

```javascript
// In the sendMessage function
gtag('event', 'chatbot_message', {
  'event_category': 'engagement',
  'event_label': 'juns_ai_chatbot'
});
```

## Support

If you encounter issues:
1. Check the browser console for errors
2. Verify your environment variables are set correctly
3. Test the chatbot server endpoints directly
4. Check your Shopify theme for conflicts

## Security Notes

- The chatbot runs on the client side, so don't include sensitive information in the JavaScript
- Use environment variables for API keys and sensitive configuration
- The chatbot only sends messages to your server, not to third parties
- Consider rate limiting on your chatbot server to prevent abuse

## Performance Tips

- The chatbot loads asynchronously and doesn't block page rendering
- CSS and JavaScript are minified and optimized
- Images and heavy resources are loaded only when needed
- The chatbot respects user preferences and doesn't auto-play media
