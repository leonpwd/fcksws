# Ultra-minimal Docker image (101kB) optimized for nginx reverse proxy
FROM oven/bun:1.1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./
COPY src ./src
COPY tsconfig.json ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Build single optimized binary
RUN bun build src/server.ts --outfile server --target bun --minify --sourcemap=none

# IMPORTANT: Set executable permissions in builder stage
RUN chmod +x /app/server

# Production image: scratch (no OS, just binary + static files)
FROM scratch

# Copy with explicit permissions
COPY --from=builder --chmod=755 /app/server /server
COPY --from=builder /app/src/public /public

EXPOSE 3000
CMD ["/server"]
