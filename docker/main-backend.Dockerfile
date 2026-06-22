FROM node:20-bookworm-slim
WORKDIR /app/googernew-main/backend
ENV NODE_ENV=production
COPY googernew-main/backend/package*.json ./
RUN npm ci --omit=dev
COPY googernew-main/backend ./
COPY shared /app/googernew-main/shared
EXPOSE 5000
CMD ["npm", "run", "start:cluster"]
