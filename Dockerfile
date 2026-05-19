FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
# Use the official npm registry and cache mounts for faster installs.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
# Copy only runtime artifacts. Do NOT copy .env into the image.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Ensure non-root runtime: make `node` own the app and switch user.
RUN chown -R node:node /app
USER node
ENV NODE_ENV=production

EXPOSE 3000
CMD ["npm", "start"]
