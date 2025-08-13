const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

// === ADD THIS ROUTE ===
app.get('/', (req, res) => {
  res.send('JUN’S AI Chatbot is up and running 🚀');
});

// (keep your existing routes like /chat, etc.)

app.listen(PORT, () => {
  console.log(`JUN’S AI backend running on port ${PORT}`);
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const chatRoutes = require('./routes/chat');
const orderRoutes = require('./routes/orders');
const recommendRoutes = require('./routes/recommend');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/chat', chatRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/recommend', recommendRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`JUN'S AI backend running on port ${PORT}`);
});
