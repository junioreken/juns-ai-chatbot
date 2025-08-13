const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Root route (homepage)
app.get('/', (req, res) => {
  res.send('JUN’S AI Chatbot is up and running 🚀');
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const chatRoutes = require('./routes/chat');
const orderRoutes = require('./routes/orders');
const recommendRoutes = require('./routes/recommend');

app.use('/api/chat', chatRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/recommend', recommendRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`JUN’S AI backend running on port ${PORT}`);
});
