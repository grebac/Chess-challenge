# Service temps réel (Socket.io + chess.js). Racine du service Railway : /realtime
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Dépendances complètes (esbuild, typescript) pour compiler.
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Piège n°5 : on précompile avec esbuild, jamais de tsx/ts-node en production.
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

# Dépendances de production uniquement (les paquets restent externes dans le bundle).
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS runner
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
# Railway injecte PORT ; 4000 par défaut en local.
EXPOSE 4000
# `node` nu sur le fichier compilé : aucun transpileur à l'exécution.
CMD ["node", "dist/server.js"]
