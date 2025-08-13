require('dotenv').config();
const express = require('express');
const cors = require('cors');

const chatRoutes = require('./routes/chat');
const orderRoutes = require('./routes/orders');
const recommendRoutes = require('./routes/recommend');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Route handlers
app.use('/api/chat', chatRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/recommend', recommendRoutes);

app.get('/', (req, res) => {
  res.send("🚀 JUN'S AI Chatbot is running!");
});

app.listen(PORT, () => {
  console.log(`✅ JUN’S AI Chatbot running on port ${PORT}`);
});
