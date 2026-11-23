FROM node:20-alpine

WORKDIR /app

# Copy package descriptors first for caching
COPY package*.json ./

# Install all dependencies including typescript
RUN npm install

# Copy application sources and pre-built files
COPY . .

# Compile TypeScript
RUN npm run build

# Default environment
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "dist/index.js"]
