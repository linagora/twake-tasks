FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/
COPY packages/api-contract/package.json packages/api-contract/
RUN npm ci --workspace @twake-tasks/backend --include-workspace-root
COPY packages/api-contract packages/api-contract
RUN npm run build --workspace @twake-tasks/api-contract
COPY apps/backend apps/backend
RUN npm run build --workspace @twake-tasks/backend

FROM build AS deps
RUN npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY packages/api-contract/package.json packages/api-contract/
COPY --from=build /app/packages/api-contract/dist packages/api-contract/dist
COPY apps/backend/package.json apps/backend/
COPY apps/backend/drizzle apps/backend/drizzle
COPY --from=build /app/apps/backend/dist apps/backend/dist
WORKDIR /app/apps/backend
USER 1000:1000
EXPOSE 8080
CMD ["node", "dist/main.js"]
