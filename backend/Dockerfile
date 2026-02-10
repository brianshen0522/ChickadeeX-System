FROM node:18.20-alpine3.19

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs \
 && adduser -S nodejs -u 1001 -G nodejs

RUN apk add --no-cache postgresql-client

COPY --chown=nodejs:nodejs package*.json ./
RUN npm install --production

COPY --chown=nodejs:nodejs . .

# Create runtime directories
RUN mkdir -p uploads logs

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

CMD ["npm", "start"]

