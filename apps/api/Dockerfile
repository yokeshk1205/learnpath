FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* tsconfig.base.json ./
COPY config config
COPY apps/api/package.json apps/api/package.json
RUN npm install --workspace @learnpath/api --include-workspace-root

COPY apps/api apps/api
RUN npm run build --workspace @learnpath/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
COPY config config
COPY apps/api/package.json apps/api/package.json
RUN npm install --omit=dev --workspace @learnpath/api --include-workspace-root && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist

EXPOSE 4000
CMD ["npm", "run", "start", "--workspace", "@learnpath/api"]
