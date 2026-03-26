# Ultra-minimal Docker with proper ARM64 support (~25MB)
FROM oven/bun:1.1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./
COPY src ./src
COPY tsconfig.json ./

# Install production dependencies
RUN bun install --frozen-lockfile --production

# Build for bun runtime (NOT standalone binary)
RUN bun build src/server.ts --outdir dist --target bun --minify --sourcemap=none

# Minimal production with distroless + bun runtime
FROM gcr.io/distroless/base-debian12:nonroot

WORKDIR /app

# Copy bun binary from builder
COPY --from=builder /usr/local/bin/bun /usr/local/bin/bun

# Copy built app
COPY --from=builder --chown=nonroot:nonroot /app/dist ./dist
COPY --from=builder --chown=nonroot:nonroot /app/src/public ./src/public

EXPOSE 3000

# Use bun runtime instead of standalone binary
CMD ["/usr/local/bin/bun", "run", "dist/server.js"]
