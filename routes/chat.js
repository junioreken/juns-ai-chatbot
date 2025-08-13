const express = require('express');
const router = express.Router();
const { askOpenAI } = require('../services/openai');

router.post('/', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    const reply = await askOpenAI(message);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: 'AI Error' });
  }
});

module.exports = router;