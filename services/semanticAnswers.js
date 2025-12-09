const { OpenAI } = require('openai');
const natural = require('natural');
const knowledgeBase = require('../data/knowledge-base');

const DEFAULT_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';

class SemanticAnswersService {
  constructor() {
    this.openai = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;

    this.entries = knowledgeBase.map((entry) => ({
      ...entry,
      normalizedTags: this.#normalizeArray(entry.tags),
      normalizedKeywords: this.#normalizeArray(entry.keywords),
      embedding: Array.isArray(entry.embedding) ? entry.embedding : null,
      vector: null,
      embeddingPromise: null
    }));

    this.tokenizer = new natural.WordTokenizer();
  }

  #normalizeArray(list = []) {
    return (Array.isArray(list) ? list : [])
      .map((value) => String(value || '').toLowerCase().trim())
      .filter(Boolean);
  }

  async #embedText(text) {
    const safeText = text || '';
    if (this.openai) {
      if (!safeText.trim()) return null;
      const response = await this.openai.embeddings.create({
        model: DEFAULT_EMBED_MODEL,
        input: safeText
      });
      return response.data?.[0]?.embedding || null;
    }
    return this.#buildLocalVector(safeText);
  }

  #buildLocalVector(text) {
    const tokens = this.tokenizer.tokenize(String(text || '').toLowerCase());
    const map = new Map();
    for (const token of tokens) {
      if (!token.trim()) continue;
      map.set(token, (map.get(token) || 0) + 1);
    }
    let norm = 0;
    for (const val of map.values()) {
      norm += val * val;
    }
    return { map, norm: Math.sqrt(norm) || 1 };
  }

  async #getEntryVector(entry) {
    if (this.openai) {
      if (entry.embedding) return entry.embedding;
      if (!entry.embeddingPromise) {
        entry.embeddingPromise = this.#embedText(entry.question?.en || entry.answer?.en || '');
      }
      entry.embedding = await entry.embeddingPromise;
      return entry.embedding;
    }
    if (entry.vector) return entry.vector;
    entry.vector = this.#buildLocalVector(entry.question?.en || entry.answer?.en || '');
    return entry.vector;
  }

  async #getMessageVector(message) {
    if (this.openai) {
      return this.#embedText(message);
    }
    return this.#buildLocalVector(message);
  }

  #cosineSimilarity(a, b) {
    if (!a || !b) return 0;
    const bothArrays = Array.isArray(a) && Array.isArray(b);
    if (bothArrays) {
      let dot = 0;
      const len = Math.min(a.length, b.length);
      for (let i = 0; i < len; i += 1) {
        dot += (a[i] || 0) * (b[i] || 0);
      }
      const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0)) || 1;
      const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0)) || 1;
      return dot / (normA * normB);
    }

    if (a.map && b.map) {
      let dot = 0;
      for (const [token, val] of a.map.entries()) {
        const other = b.map.get(token);
        if (other) {
          dot += val * other;
        }
      }
      return dot / ((a.norm || 1) * (b.norm || 1));
    }

    return 0;
  }

  async findBestAnswer(message, { lang = 'en', tags = [], minScore } = {}) {
    if (!message) return null;

    const normalizedLang = lang === 'fr' ? 'fr' : 'en';
    const normalizedTags = this.#normalizeArray(tags);
    const messageVector = await this.#getMessageVector(message);
    const threshold = typeof minScore === 'number'
      ? minScore
      : (this.openai ? 0.78 : 0.62);

    const scored = [];
    for (const entry of this.entries) {
      const entryVector = await this.#getEntryVector(entry);
      const similarity = this.#cosineSimilarity(messageVector, entryVector);
      scored.push({ entry, similarity });
    }

    scored.sort((a, b) => b.similarity - a.similarity);

    for (const { entry, similarity } of scored) {
      if (similarity < threshold) {
        continue;
      }

      const entryTags = entry.normalizedTags || [];
      let passesTagFilter = true;
      if (normalizedTags.length > 0) {
        passesTagFilter = normalizedTags.some((tag) => entryTags.includes(tag));
      }

      if (!passesTagFilter) {
        continue;
      }

      return {
        id: entry.id,
        tags: entry.tags,
        score: similarity,
        answer: entry.answer?.[normalizedLang] || entry.answer?.en,
        question: entry.question?.[normalizedLang] || entry.question?.en
      };
    }

    return null;
  }
}

module.exports = new SemanticAnswersService();
