FROM node:20-bookworm-slim
WORKDIR /app/googernew/backend
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev && mkdir -p /app/googernew && ln -s /app/shared /app/googernew/shared
COPY backend ./
COPY shared /app/shared
COPY public /app/googernew/public
ENV GOOGER_BACKEND_ROOT=/app/googernew/backend
EXPOSE 5000
CMD ["npm", "run", "start:cluster"]
