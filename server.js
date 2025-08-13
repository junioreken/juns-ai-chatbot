require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const chatRoutes = require('./routes/chat');
const orderRoutes = require('./routes/orders');
const recommendRoutes = require('./routes/recommend');

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/recommend', recommendRoutes);

// Health check route
app.get('/', (req, res) => {
  res.send("✅ JUN'S AI Chatbot is live.");
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
