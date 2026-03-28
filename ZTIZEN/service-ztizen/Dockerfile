# ZTIZEN Service Dockerfile
# Workspace-aware build for pnpm monorepo

FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 ztizen

# Copy workspace package files first (for better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy service-specific package.json
COPY service-ztizen/package.json ./service-ztizen/

# Install dependencies for entire workspace
RUN pnpm install --frozen-lockfile --prod

# Copy service-ztizen application code
COPY service-ztizen ./service-ztizen

# Set working directory to service
WORKDIR /app/service-ztizen

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
