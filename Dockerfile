FROM node:20-alpine

RUN apk add --no-cache python3 make g++ tzdata

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src
COPY views ./views
COPY public ./public

ENV NODE_ENV=production
ENV PORT=5500
ENV DATA_DIR=/data
ENV TZ=Asia/Bangkok

VOLUME ["/data"]
EXPOSE 5500

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5500/healthz || exit 1

CMD ["node", "src/server.js"]
