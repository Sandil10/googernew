FROM node:20-bookworm-slim AS deps
WORKDIR /app/googernew-main
COPY googernew-main/package*.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app/googernew-main
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/googernew-main/node_modules ./node_modules
COPY googernew-main ./
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app/googernew-main
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
COPY --from=builder /app/googernew-main ./
EXPOSE 3000
CMD ["npm", "run", "start:3000"]
