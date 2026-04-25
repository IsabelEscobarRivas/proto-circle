# Production image — Next.js + better-sqlite3 (use a host with a persistent volume for data/)
FROM node:20-bookworm-slim AS base
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

EXPOSE 3000
ENV HOSTNAME=0.0.0.0
# Render/Railway/Fly set PORT; `next start` reads process.env.PORT
CMD ["npm", "start"]
