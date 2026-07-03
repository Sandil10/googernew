FROM node:20-bookworm-slim AS deps
WORKDIR /app/googernew
COPY package*.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app/googernew
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/googernew/node_modules ./node_modules
COPY . ./
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app/googernew
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
COPY --from=builder /app/googernew ./
EXPOSE 3000
CMD ["npm", "run", "start:3000"]
