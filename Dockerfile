# Ultra-minimal Docker image with ARM64 support (~15MB)
FROM oven/bun:1.1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./
COPY src ./src
COPY tsconfig.json ./

# Install production dependencies
RUN bun install --frozen-lockfile --production

# Build optimized binary 
RUN bun build src/server.ts --outfile server --target bun --minify --sourcemap=none && \
    chmod +x /app/server

# Ultra-minimal production with distroless (C runtime only)
FROM gcr.io/distroless/cc-debian12:nonroot

WORKDIR /app

# Copy binary and static files
COPY --from=builder --chown=nonroot:nonroot /app/server /app/server  
COPY --from=builder --chown=nonroot:nonroot /app/src/public /app/public

EXPOSE 3000
CMD ["/app/server"]
