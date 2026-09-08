# syntax=docker/dockerfile:1

# --- deps ---
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Public build-time vars (override with --build-arg in CI)
ARG NEXT_PUBLIC_APP_URL=https://office365.cp.netrichtechnologies.com
ARG NEXT_PUBLIC_APP_DOMAIN=office365.cp.netrichtechnologies.com
ARG NEXT_PUBLIC_AZURE_AD_CLIENT_ID=
ARG NEXT_PUBLIC_AZURE_AD_AUTHORITY=https://login.microsoftonline.com/common
ARG NEXT_PUBLIC_CSP_API_URL=
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_DOMAIN=$NEXT_PUBLIC_APP_DOMAIN
ENV NEXT_PUBLIC_AZURE_AD_CLIENT_ID=$NEXT_PUBLIC_AZURE_AD_CLIENT_ID
ENV NEXT_PUBLIC_AZURE_AD_AUTHORITY=$NEXT_PUBLIC_AZURE_AD_AUTHORITY
ENV NEXT_PUBLIC_CSP_API_URL=$NEXT_PUBLIC_CSP_API_URL
RUN npm run build

# --- runner ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/.data \
  && chown -R nextjs:nodejs /app

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
VOLUME ["/app/.data"]
CMD ["node", "server.js"]
