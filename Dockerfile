
# Stage 1: Build the TypeScript application
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install all dependencies (including dev dependencies).
COPY package.json package-lock.json ./
RUN npm ci

# Copy project files needed for building and migrations.
COPY tsconfig.json ./
COPY src ./src
COPY drizzle ./drizzle

# Compile TypeScript into JavaScript.
RUN npm run build

# Stage 2: Production runtime
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript from the builder stage.
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
