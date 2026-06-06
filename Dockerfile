# Multi-stage build for Floe API
FROM node:20-bookworm-slim AS deps

WORKDIR /app

# Copy root manifests
COPY package.json package-lock.json ./

# Copy all workspace manifests to allow npm ci to work
COPY apps/api/package.json apps/api/package.json
COPY apps/sdk/package.json apps/sdk/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/tatum/package.json apps/tatum/package.json

RUN npm ci

FROM deps AS build

# Copy all source
COPY . .

# Build the API (and shared code is implicitly copied)
RUN npm run build --workspace=apps/api
RUN npm prune --omit=dev --workspaces

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3001
ENV UPLOAD_TMP_DIR=/var/lib/floe/upload

WORKDIR /app

# Copy production artifacts
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api /app/apps/api
COPY --from=build /app/apps/shared /app/apps/shared

RUN mkdir -p /var/lib/floe/upload && chown -R node:node /var/lib/floe /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/api/dist/server.js"]
