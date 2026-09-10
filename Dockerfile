FROM node:24-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node app-manifest.js server.js room-server.js redis-store.js battle-core.js battle-session.js network-session.js tank-model.js battle.js battle.css index.html battle.html ./
COPY --chown=node:node plugins ./plugins
COPY --chown=node:node core ./core
COPY --chown=node:node client ./client
USER node
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
