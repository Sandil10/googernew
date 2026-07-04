FROM node:20-bookworm-slim AS deps
WORKDIR /app/googeradminpanel
COPY googeradminpanel/package*.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app/googeradminpanel
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/googeradminpanel/node_modules ./node_modules
COPY googeradminpanel ./
COPY shared /app/shared
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app/googeradminpanel
ENV NODE_ENV=production
ENV SERVE_NEXT=true
ENV PORT=3002
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/googeradminpanel ./
COPY --from=builder /app/shared /app/shared
EXPOSE 3002
CMD ["npm", "run", "start:prod"]
