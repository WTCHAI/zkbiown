# ZTIZEN Frontend Dockerfile
# Production-ready multi-stage build with nginx

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# ============================================
# Stage 2: Build
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build arguments for API URLs (can be overridden at build time)
ARG VITE_ZTIZEN_API_URL=http://localhost:5502
ARG VITE_PRODUCT_API_URL=http://localhost:5503

# Set environment variables for build
ENV VITE_ZTIZEN_API_URL=$VITE_ZTIZEN_API_URL
ENV VITE_PRODUCT_API_URL=$VITE_PRODUCT_API_URL

# Build the application
RUN pnpm build

# ============================================
# Stage 3: Production (nginx)
# ============================================
FROM nginx:alpine AS runner

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy public assets (models, circuits, etc.)
# These are large files that should be served directly
COPY --from=builder /app/public /usr/share/nginx/html

# Create non-root user for security (nginx runs as nginx user by default)
# But we need to ensure proper permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
