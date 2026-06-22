FROM node:20-bookworm-slim
WORKDIR /app/googernew/backend
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend ./
COPY shared /app/shared
EXPOSE 5000
CMD ["npm", "run", "start:cluster"]
