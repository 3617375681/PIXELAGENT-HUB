# Static dashboard + nginx reverse proxy to Records API.
# Build context is pixelagent-hub/ (see docker-compose.yml): the dashboard imports src/studio/shared.
FROM node:22-alpine AS build
WORKDIR /app/dashboard
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/ ./
COPY src/studio/shared /app/src/studio/shared
RUN npm run build

FROM nginx:stable-alpine
COPY --from=build /app/dashboard/dist/public /usr/share/nginx/html
COPY dashboard/nginx.docker.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
