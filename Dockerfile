# syntax=docker/dockerfile:1

# ---- build: compile the 3D client (vite -> client/dist) ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: Node 24 runs the TypeScript server directly (type stripping) ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/game.db \
    STATIC_DIR=client/dist
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY shared ./shared
COPY server ./server
COPY --from=build /app/client/dist ./client/dist
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server/src/index.ts"]
