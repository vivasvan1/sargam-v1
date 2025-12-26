# Base dependencies stage
FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Development stage (used for local dev with hot-reloading)
FROM oven/bun:1 AS development
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY . .
EXPOSE 5174
CMD ["bun", "run", "dev", "--host", "0.0.0.0", "--port", "5174"]

# Build stage (used to build production assets)
FROM base AS build
COPY . .
RUN bun run build

# Production stage (the final lightweight image)
FROM nginx:stable-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
