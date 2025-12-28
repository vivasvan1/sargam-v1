# Base dependencies stage
FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json ./

# Install dependencies with bun first
RUN bun install

# Development stage (used for local dev with hot-reloading)
FROM oven/bun:1 AS development
WORKDIR /app
# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# Copy package files for dependency installation
COPY package.json bun.lock* ./
# Copy the rest of the app
COPY . .
EXPOSE 5174
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "run", "dev"]

# Build stage (used to build production assets)
FROM base AS build
COPY . .
RUN bun run build

# Production stage (the final lightweight image)
FROM nginx:stable-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
