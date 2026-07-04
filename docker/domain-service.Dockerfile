FROM node:20-bookworm-slim
WORKDIR /app/googernew/backend
ENV NODE_ENV=production
ARG SERVICE_ENTRY
ENV SERVICE_ENTRY=${SERVICE_ENTRY}
COPY backend/package*.json ./
RUN npm ci --omit=dev \
    && mkdir -p /app/googernew \
    && ln -s /app/googernew/backend/node_modules /app/googernew/node_modules \
    && ln -s /app/shared /app/googernew/shared
COPY backend ./
COPY shared /app/shared
COPY microservices /app/googernew/microservices
ENV GOOGER_BACKEND_ROOT=/app/googernew/backend
CMD ["sh", "-lc", "node ${SERVICE_ENTRY}"]
