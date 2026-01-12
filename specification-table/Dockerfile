FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# IMPORTANT: prisma client
RUN npx prisma generate --schema=./prisma/schema.prisma

RUN npm run build

CMD ["npm", "run", "docker-start"]
