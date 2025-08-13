const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

require('dotenv').config();
const cors = require('cors');

const chatRoutes = require('./routes/chat');
const orderRoutes = require('./routes/orders');
const recommendRoutes = require('./routes/recommend');

app.use(cors());
app.use(express.json());

// TEST ROUTE
app.get('/', (req, res) => {
  res.send('JUN’S AI Chatbot is up and running 🚀');
});

app.use('/api/chat', chatRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/recommend', recommendRoutes);

app.listen(PORT, () => {
  console.log(`JUN’S AI backend running on port ${PORT}`);
});
