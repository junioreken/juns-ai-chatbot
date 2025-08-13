const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

// Example base route
app.get('/', (req, res) => {
  res.send('✅ JUN\'s AI Chatbot is LIVE!');
});

// Import routes
const chatRoutes = require('./routes/chat');
const ordersRoutes = require('./routes/orders');
const recommendRoutes = require('./routes/recommend');

app.use('/chat', chatRoutes);
app.use('/orders', ordersRoutes);
app.use('/recommend', recommendRoutes);

app.listen(port, () => {
  console.log(`✅ JUN’S AI Chatbot running on port ${port}`);
});
