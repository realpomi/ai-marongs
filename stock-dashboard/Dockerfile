# Build stage - use Node for Vite compatibility
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies with npm (more stable for Vite builds)
RUN npm install

# Copy source code
COPY . .

# Sync SvelteKit and build
RUN npm run prepare && npm run build

# Production stage - use Bun for runtime
FROM oven/bun:1-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install curl for healthchecks and manual API calls
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 sveltekit

# Copy built application
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./

# Install production dependencies only
RUN bun install --production

# Create data directory for token storage
RUN mkdir -p /app/data && chown -R sveltekit:nodejs /app/data

# Change ownership
RUN chown -R sveltekit:nodejs /app

USER sveltekit

EXPOSE 3000

ENV HOST=0.0.0.0
ENV PORT=3000

CMD ["bun", "run", "./build/index.js"]
