# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
# Vite bakes VITE_* at build time; runtime env-config.js is the source of truth in Docker.
ARG VITE_API_BASE=""
ARG VITE_GA_MEASUREMENT_ID=""
ARG VITE_SENTRY_DSN=""
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build

# ---- Serve stage ----
FROM nginx:alpine
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Render provides $PORT; default to 80 locally. nginx templating substitutes these.
ENV PORT=80 \
    BACKEND_URL=http://localhost:8000 \
    BACKEND_HOST=localhost \
    VITE_GA_MEASUREMENT_ID="" \
    VITE_SENTRY_DSN=""
EXPOSE 80
CMD ["sh", "-c", "printf 'window.__CATMAP_ENV__={gaMeasurementId:\"%s\",sentryDsn:\"%s\"};\\n' \"${VITE_GA_MEASUREMENT_ID}\" \"${VITE_SENTRY_DSN}\" > /usr/share/nginx/html/env-config.js && envsubst '${PORT} ${BACKEND_URL} ${BACKEND_HOST}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
