# Dockerfile
FROM node:22.23.5-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN GENERATE_OPENAPI=true npm run build

EXPOSE 3008
CMD ["node", "dist/main.js"]