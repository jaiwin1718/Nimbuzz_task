# Production image for the Nimbuz POC sample app.
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install exact dependency versions from the lockfile, production only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY src ./src
COPY public ./public

# Run as the image's built-in non-root user.
USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
