# Ultra-minimal Alpine with just Bun dependencies (~25MB)
FROM oven/bun:1.1-alpine AS builder

WORKDIR /app
COPY package.json bun.lockb* ./
COPY src ./src
COPY tsconfig.json ./

# Install and build
RUN bun install --frozen-lockfile --production && \
    bun build src/server.ts --outdir dist --target bun --minify --sourcemap=none

# Minimal Alpine with only Bun runtime dependencies
FROM alpine:3.19

# Install minimal dependencies for Bun binary
RUN apk add --no-cache ca-certificates libgcc libstdc++ && \
    adduser -D bunuser

WORKDIR /app
RUN chown bunuser:bunuser /app

# Copy Bun binary and app
COPY --from=builder /usr/local/bin/bun /usr/local/bin/bun
COPY --from=builder --chown=bunuser:bunuser /app/dist ./dist
COPY --from=builder --chown=bunuser:bunuser /app/src/public ./src/public

USER bunuser
EXPOSE 3000

CMD ["/usr/local/bin/bun", "run", "dist/server.js"]
