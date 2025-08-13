// === Load environment variables ===
require('dotenv').config();

// === Import required modules ===
const express = require('express');
const cors = require('cors');

// === Initialize app ===
const app = express();

// === Middleware ===
app.use(cors());
app.use(express.json());

// === Test route (to verify deployment) ===
app.get('/', (req, res) => {
  res.send("🚀 JUN'S AI Chatbot is up and running!");
});

// === Import routes ===
const chatRoutes = require('./routes/chat');
const orderRoutes = require('./routes/orders');
const recommendRoutes = require('./routes/recommend');

// === Register routes ===
app.use('/api/chat', chatRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/recommend', recommendRoutes);

// === Port setup (VERY IMPORTANT for Railway) ===
const PORT = process.env.PORT || 3000;

// === Start server ===
app.listen(PORT, () => {
  console.log(`JUN'S AI backend running on port ${PORT}`);
});
