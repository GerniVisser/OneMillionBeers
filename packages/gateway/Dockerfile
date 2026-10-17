# templates/ is rendered by the stock nginx entrypoint (envsubst) into
# /etc/nginx/conf.d/ at container start, which is how ADMIN_HTPASSWD becomes
# the password file for /admin without baking a secret into the image.
FROM nginx:alpine AS dev
COPY nginx.dev.conf /etc/nginx/nginx.conf
COPY templates/ /etc/nginx/templates/

FROM nginx:alpine AS prod
COPY nginx.conf /etc/nginx/nginx.conf
COPY templates/ /etc/nginx/templates/
