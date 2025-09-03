const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// Import test recommend router (with mock data)
const testRecommendRouter = require('./routes/test-recommend');

// Mount test recommend route
app.use('/recommend', testRecommendRouter);

app.get('/', (req, res) => {
  res.send("✅ JUN'S AI Chatbot Server - Recommendations Only");
});

app.listen(PORT, () => {
  console.log(`🎉 Recommendations server is live on http://localhost:${PORT}`);
  console.log(`📈 Endpoint: GET /recommend?theme=wedding&budget=under-150`);
});
