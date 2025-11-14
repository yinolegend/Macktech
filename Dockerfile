FROM node:20-alpine

WORKDIR /app
COPY backend/package.json ./
RUN npm install --production
COPY backend ./backend

# Create data directory
RUN mkdir -p /app/data

WORKDIR /app/backend

# Run as non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000

CMD ["node", "server.js"]
