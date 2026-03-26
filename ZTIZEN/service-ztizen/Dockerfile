# ZTIZEN Service Dockerfile
# Simplified single-stage build (avoids Docker buildkit cache issues)

FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 ztizen

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy application code
COPY . .

# Set ownership
RUN chown -R ztizen:nodejs /app

# Switch to non-root user
USER ztizen

# Environment defaults (can be overridden in docker-compose)
ENV NODE_ENV=production
ENV PORT=5502

# Expose the correct port
EXPOSE 5502

# Health check using the correct port
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5502/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "src/index.js"]
