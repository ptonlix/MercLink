FROM node:24.18.1-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate

FROM base AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json next.config.ts ./
COPY src ./src
# next build typechecks src/**/*.test.ts. oauth.test.ts imports tests/support.
COPY tests ./tests
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build
# 放在 next build 之后，避免 standalone 追踪把渲染脚本带进 runner。
COPY scripts/render-starter.mjs ./scripts/render-starter.mjs
# MERCLINK_PURCHASE 只赋给这两次命令，不写入镜像 ENV 或 ARG。同一镜像要同时带上买入关闭和开启。
RUN set -eu \
  && MERCLINK_PURCHASE=0 node scripts/render-starter.mjs > /tmp/starter-0.json \
  && MERCLINK_PURCHASE=1 node scripts/render-starter.mjs > /tmp/starter-1.json \
  && node -e 'const fs=require("node:fs");const names=["index.html","products/index.html","products/item.html","account/buyer.html","account/merchant.html","pay/result.html"];function load(file){const parsed=JSON.parse(fs.readFileSync(file,"utf8"));if(parsed===null||typeof parsed!=="object"||Array.isArray(parsed)){throw new Error("starter fragments are not an object");}for(const name of names){const value=parsed[name];if(typeof value!=="string"||value.length===0){throw new Error("starter fragment missing: "+name);}}return parsed;}fs.writeFileSync("storefront-starter.json",JSON.stringify({"0":load("/tmp/starter-0.json"),"1":load("/tmp/starter-1.json")}));'

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/src/db/migrations ./src/db/migrations
# 没有已接受的发布时，下载会打包工作目录下的 storefront。standalone 追踪不包括它。
COPY storefront ./storefront
# 起始页片段和样式也不走追踪。渲染脚本留在构建阶段。
COPY --from=build /app/storefront-starter.json ./storefront-starter.json
COPY --from=build /app/src/app/globals.css ./src/app/globals.css
COPY --from=build /app/src/public-discovery/public.css ./src/public-discovery/public.css
COPY --from=build /app/src/app/authorize/authorize.css ./src/app/authorize/authorize.css
EXPOSE 3000
CMD ["node", "server.js"]
