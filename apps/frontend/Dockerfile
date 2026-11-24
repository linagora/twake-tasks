FROM --platform=$BUILDPLATFORM node:24-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/frontend/package.json apps/frontend/
COPY packages/api-contract/package.json packages/api-contract/
RUN npm ci --workspace @twake-tasks/frontend --include-workspace-root --no-audit --no-fund
COPY packages/api-contract packages/api-contract
RUN npm run build --workspace @twake-tasks/api-contract
COPY apps/frontend apps/frontend
RUN npm run build --workspace @twake-tasks/frontend
# The debug ids let Sentry pair an event's frames with the maps of the very bundle
# that threw, whatever the release.
RUN npx --yes @sentry/cli@2.58.6 sourcemaps inject apps/frontend/dist

# The release workflow exports this stage to upload the source maps to Sentry.
FROM scratch AS sourcemaps
COPY --from=build /app/apps/frontend/dist /

FROM build AS site
RUN find apps/frontend/dist -name '*.map' -delete

FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e
RUN rm /etc/nginx/conf.d/default.conf
COPY apps/frontend/docker/nginx.conf /etc/nginx/nginx.conf
COPY --chmod=755 apps/frontend/docker/40-twake-tasks-runtime.sh /docker-entrypoint.d/
COPY --from=site /app/apps/frontend/dist /usr/share/nginx/html
RUN /docker-entrypoint.d/40-twake-tasks-runtime.sh \
 && nginx -t -q \
 && rm -rf /tmp/nginx /tmp/nginx.pid
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
CMD ["nginx", "-g", "daemon off;"]
