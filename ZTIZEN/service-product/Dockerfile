# Product Service Dockerfile
# Simplified single-stage build (avoids Docker buildkit cache issues)

FROM node:20-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 product

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy application code
COPY . .

# Set ownership
RUN chown -R product:nodejs /app

# Switch to non-root user
USER product

# Environment defaults (can be overridden in docker-compose)
ENV NODE_ENV=production
ENV PORT=5503

# Expose the correct port
EXPOSE 5503

# Health check using the correct port
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5503/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "src/index.js"]
