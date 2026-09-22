FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install --workspace @learnpath/web --include-workspace-root

COPY apps/web apps/web
EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace", "@learnpath/web"]

