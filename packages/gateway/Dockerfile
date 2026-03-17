FROM nginx:alpine AS dev
COPY nginx.dev.conf /etc/nginx/nginx.conf

FROM nginx:alpine AS prod
COPY nginx.conf /etc/nginx/nginx.conf
