FROM node:20-slim AS base
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS builder
RUN apt-get update && apt-get install -y python3 build-essential && rm -rf /var/lib/apt/lists/*
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV SKIP_POSTINSTALL=0
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
COPY shared-types ./shared-types
RUN npm ci --include=dev --workspace=backend --workspace=shared-types --include-workspace-root=false
COPY backend/tsconfig*.json backend/nest-cli.json ./backend/
COPY backend/src ./backend/src
COPY backend/prisma ./backend/prisma
RUN npm run build --workspace=shared-types && npm run build --workspace=backend
RUN mkdir -p /app/backend/node_modules

FROM base AS runner
WORKDIR /app/backend
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/shared-types /app/shared-types
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/package.json ./package.json
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/prisma ./prisma
RUN mkdir -p /app/uploads/patients /app/uploads/visits && ln -s /app/uploads /app/backend/uploads && chown -R node:node /app/uploads
COPY backend/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
USER node
EXPOSE 4000
ENV PORT=4000
ENTRYPOINT ["/app/backend/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
