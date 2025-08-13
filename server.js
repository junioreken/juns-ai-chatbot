require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// === Middleware ===
app.use(cors());
app.use(express.json());

// === ROUTES ===
app.get('/', (req, res) => {
  res.send('JUN’S AI Chatbot is up and running 🚀');
});

const chatRoutes = require('./routes/chat');
const orderRoutes = require('./routes/orders');
const recommendRoutes = require('./routes/recommend');

app.use('/api/chat', chatRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/recommend', recommendRoutes);

// === START SERVER ===
app.listen(PORT, () => {
  console.log(`JUN’S AI backend running on port ${PORT}`);
});
