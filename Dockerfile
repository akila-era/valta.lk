# VALTA.LK storefront (Next.js). Build context: repo root.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY . .
# postinstall runs `prisma generate`, so the schema must be copied first
RUN npm ci
# The lockfile was generated on Windows and lacks Tailwind's Linux native binary (npm optional-deps bug)
RUN cd apps/web && npm install --no-save --no-package-lock --ignore-scripts @tailwindcss/oxide-linux-x64-gnu@4.3.3
# next.config reads ERP_IMAGE_HOSTS / HX_API_BASE at build time for image hosts
ARG ERP_IMAGE_HOSTS=""
ARG HX_API_BASE=""
ENV NEXT_TELEMETRY_DISABLED=1
RUN ERP_IMAGE_HOSTS="$ERP_IMAGE_HOSTS" HX_API_BASE="$HX_API_BASE" npm run build

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
