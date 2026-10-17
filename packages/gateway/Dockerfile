# templates/ is rendered by the nginx entrypoint at start, so no secret is baked in.
FROM nginx:alpine AS dev
COPY nginx.dev.conf /etc/nginx/nginx.conf
COPY templates/ /etc/nginx/templates/

FROM nginx:alpine AS prod
COPY nginx.conf /etc/nginx/nginx.conf
COPY templates/ /etc/nginx/templates/
