FROM node:22-alpine

WORKDIR /app

ENV ASTRO_TELEMETRY_DISABLED=1 \
    VAULT_PATH=/vault \
    OUT_DIR=/out

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN chmod +x /app/docker/entrypoint.sh

VOLUME ["/vault", "/out"]

ENTRYPOINT ["/app/docker/entrypoint.sh"]
