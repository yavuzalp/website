# AlgoArena grading proxy — thin Express service in front of a self-hosted
# Piston instance. This image is ONLY the proxy; Piston itself runs as a
# separate container/service (see docker-compose.yml locally, or a second
# Railway service in production — see README.md).
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY driver.js server.js problems-private.json ./

EXPOSE 3000
CMD ["node", "server.js"]
