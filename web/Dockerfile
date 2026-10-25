# Service web (Payload v3 + Next.js). Racine du service Railway : /web
FROM node:22-alpine AS base
RUN corepack enable pnpm
WORKDIR /app

FROM base AS deps
RUN apk add --no-cache libc6-compat
# Piège n°3 : le lockfile est copié et utilisé tel quel (--frozen-lockfile).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Piège n°6 : aucun secret au build. Les pages sont dynamiques et n'appellent pas getPayload()
# pendant `next build` ; DATABASE_URI, PAYLOAD_SECRET, REALTIME_* ne sont lus qu'à l'exécution.
RUN pnpm run build

FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
RUN mkdir .next && chown nextjs:nodejs .next
# Le build "standalone" de Next produit son propre server.js : c'est lui qu'on lance (aucun serveur custom ici).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
