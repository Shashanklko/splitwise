# Stage 1: Build the React Application
FROM node:20-alpine AS build

# Set working directory inside build container
WORKDIR /app

# Copy dependency configs
COPY package.json package-lock.json ./

# Install npm packages
RUN npm ci

# Copy all source files
COPY . .

# Build production assets
RUN npm run build

# Stage 2: Serve compiled React assets using Nginx
FROM nginx:stable-alpine

# Remove default nginx site
RUN rm -rf /etc/nginx/conf.d/*

# Copy custom reverse proxy config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy static assets from build stage to nginx document root
COPY --from=build /app/dist /usr/share/nginx/html

# Expose server port
EXPOSE 80

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
