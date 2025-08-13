// server.js

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Health check route (important for Railway)
app.get('/', (req, res) => {
  res.send("✅ JUN'S AI Chatbot is up and running!");
});

// Routes
const chatRoutes = require('./routes/chat');
const orderRoutes = require('./routes/orders');
const recommendRoutes = require('./routes/recommend');

app.use('/api/chat', chatRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/recommend', recommendRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`✅ JUN’S AI Chatbot running on port ${PORT}`);
});

