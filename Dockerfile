# Stage 1: Build environment
FROM node:20-bookworm-slim AS builder

# Install Python and build tools for native dependencies (better-sqlite3, argon2)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install ALL dependencies (including dev for building)
COPY package*.json ./
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the TypeScript project
RUN npm run build

# Remove devDependencies to keep the final image lean
RUN npm prune --omit=dev

# Stage 2: Runtime environment
FROM node:20-bookworm-slim

WORKDIR /app

# Copy necessary files from the builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./

# Create data and uploads directories
RUN mkdir -p /app/data /app/uploads

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
# Tell FlareBase to store the SQLite database inside the mounted volume
ENV DB_PATH=/app/data/flarebase.db

# Expose the application port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
