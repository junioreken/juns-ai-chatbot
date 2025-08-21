FROM node:18-alpine

WORKDIR /app

# Install dependencies first (leverage Docker layer cache)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the rest of the app
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]


