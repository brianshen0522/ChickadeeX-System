# Build stage
FROM node:18-alpine as build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (include dev deps for Tailwind/PostCSS build)
RUN npm install

# Copy source code
COPY . .

# Accept and expose build-time environment for CRA
ARG REACT_APP_API_URL
ARG REACT_APP_KEYCLOAK_URL
ARG REACT_APP_KEYCLOAK_REALM
ARG REACT_APP_KEYCLOAK_CLIENT_ID
ARG REACT_APP_PUBLIC_PROTOCOL
ARG REACT_APP_PUBLIC_HOSTNAME
ARG REACT_APP_KEYCLOAK_PORT
ENV REACT_APP_API_URL=${REACT_APP_API_URL}
ENV REACT_APP_KEYCLOAK_URL=${REACT_APP_KEYCLOAK_URL}
ENV REACT_APP_KEYCLOAK_REALM=${REACT_APP_KEYCLOAK_REALM}
ENV REACT_APP_KEYCLOAK_CLIENT_ID=${REACT_APP_KEYCLOAK_CLIENT_ID}
ENV REACT_APP_PUBLIC_PROTOCOL=${REACT_APP_PUBLIC_PROTOCOL}
ENV REACT_APP_PUBLIC_HOSTNAME=${REACT_APP_PUBLIC_HOSTNAME}
ENV REACT_APP_KEYCLOAK_PORT=${REACT_APP_KEYCLOAK_PORT}

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built app
COPY --from=build /app/build /usr/share/nginx/html

# Add non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Change ownership
RUN chown -R nextjs:nodejs /usr/share/nginx/html
RUN chown -R nextjs:nodejs /var/cache/nginx
RUN chown -R nextjs:nodejs /var/log/nginx
RUN chown -R nextjs:nodejs /etc/nginx/conf.d
RUN touch /var/run/nginx.pid
RUN chown -R nextjs:nodejs /var/run/nginx.pid

USER nextjs

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
