FROM node:20-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./backend/
RUN npm install --prefix backend --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
