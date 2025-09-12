FROM node:18-alpine

WORKDIR /app

# Install dependencies first (leverage Docker layer cache)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy source code
COPY server.js ./
COPY routes/ ./routes/
COPY services/ ./services/
COPY public/ ./public/

# Copy configuration files
COPY railway.json ./
COPY .nixpacks ./

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["npm", "start"]


