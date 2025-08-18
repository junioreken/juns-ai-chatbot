FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]

