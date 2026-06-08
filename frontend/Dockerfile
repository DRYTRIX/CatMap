# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
# Leave empty so the browser uses same-origin /api (proxied by nginx below).
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

# ---- Serve stage ----
FROM nginx:alpine
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Render provides $PORT; default to 80 locally. nginx templating substitutes these.
ENV PORT=80 \
    BACKEND_URL=http://localhost:8000 \
    BACKEND_HOST=localhost
EXPOSE 80
CMD ["sh", "-c", "envsubst '${PORT} ${BACKEND_URL} ${BACKEND_HOST}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
