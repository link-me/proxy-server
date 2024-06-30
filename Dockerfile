FROM node:20-alpine
WORKDIR /app

# No dependencies, plain Node
COPY package.json .
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080
ENV TARGET_URL=https://httpbin.org
ENV CACHE_TTL_MS=5000
ENV RATE_LIMIT_WINDOW_MS=60000
ENV RATE_LIMIT_MAX=60
ENV CORS_ORIGIN=*
ENV ENABLE_GZIP=true

EXPOSE 8080
CMD ["node", "src/main.js"]