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

# Production image: scratch (no OS, just binary + static files)
FROM scratch

# Copy only essential files
COPY --from=builder /app/server /server
COPY --from=builder /app/src/public /public

EXPOSE 3000
CMD ["/server"]
