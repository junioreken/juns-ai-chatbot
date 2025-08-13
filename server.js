require('dotenv').config();
const express = require('express');
const cors = require('cors');

const chatRoutes = require('./routes/chat');
const orderRoutes = require('./routes/orders');
const recommendRoutes = require('./routes/recommend');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/recommend', recommendRoutes);

// Health check
app.get('/', (req, res) => {
  res.send("✅ JUN'S AI Chatbot is up and running 🚀");
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ JUN'S AI backend running on port ${PORT}`);
});
