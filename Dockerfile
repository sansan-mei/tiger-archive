FROM node:24-alpine AS client-release
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts --no-audit --no-fund
COPY app-manifest.js battle-core.js battle-session.js network-session.js tank-model.js battle.js battle.css index.html battle.html manifest.webmanifest service-worker.js ./
COPY plugins ./plugins
COPY core ./core
COPY client ./client
COPY scripts ./scripts
ARG OBFUSCATE_CLIENT=true
RUN OBFUSCATE_CLIENT="$OBFUSCATE_CLIENT" npm run build:client

FROM node:24-alpine
ENV NODE_ENV=production PORT=8080 ASSET_MODE=release
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node app-manifest.js server.js room-server.js redis-store.js battle-core.js battle-session.js network-session.js tank-model.js battle.js battle.css index.html battle.html manifest.webmanifest service-worker.js ./
COPY --chown=node:node plugins ./plugins
COPY --chown=node:node core ./core
COPY --chown=node:node client ./client
COPY --from=client-release --chown=node:node /app/public-dist ./public-dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=10s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
