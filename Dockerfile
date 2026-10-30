# 배포용 이미지 (Render). 백엔드가 API와 frontend/ 정적 화면을 한 주소로 같이 내려준다.
# onnxruntime-node·sharp 네이티브 바이너리가 glibc 기준이라 alpine이 아닌 bookworm-slim을 쓴다.

FROM node:22-bookworm-slim AS build
# prisma 엔진(schema-engine)은 openssl을 찾아 맞는 바이너리를 고른다. slim 이미지엔 없어서 넣는다
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY packages/shared/package.json packages/shared/
# postinstall(prisma generate)은 스키마가 있어야 해서 설치 때는 건너뛰고 아래에서 따로 돌린다.
# sharp·onnxruntime-node는 linux x64 바이너리가 패키지에 들어 있어 설치 스크립트 없이도 동작한다.
RUN npm ci --ignore-scripts
# backend·shared tsconfig가 루트 tsconfig.base.json을 extends한다 (prisma.config.ts 로드·tsc 빌드에 필요)
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY backend backend
RUN npm run db:generate -w backend && npm run build -w backend
# --ignore-scripts로 @prisma/engines postinstall이 빠져 migrate deploy에 쓸 schema-engine이 없다.
# 여기서 받아 두고, 리눅스용 바이너리가 없으면 빌드를 실패시킨다 (배포 후 CMD에서 터지는 것보다 낫다)
RUN node node_modules/@prisma/engines/scripts/postinstall.js \
  && ls node_modules/@prisma/engines/ | grep -q '^schema-engine-debian-openssl-3\.0\.x$' \
  || (echo "schema-engine(debian-openssl-3.0.x)이 없다" && ls -la node_modules/@prisma/engines/ && exit 1)

FROM node:22-bookworm-slim AS runtime
# prisma 엔진(schema-engine)은 openssl을 찾아 맞는 바이너리를 고른다. slim 이미지엔 없어서 넣는다
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
# 시드·관리자 만들기(tsx)와 migrate deploy(prisma CLI)를 Render 일회성 시작 명령(dockerCommand)으로 돌릴 수 있게 개발 의존성도 남긴다
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/backend/package.json /app/backend/prisma.config.ts /app/backend/tsconfig.json backend/
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/src backend/src
COPY --from=build /app/backend/prisma backend/prisma
COPY --from=build /app/backend/scripts backend/scripts
COPY --from=build /app/backend/models backend/models
COPY frontend frontend
WORKDIR /app/backend
# Render가 PORT를 넣어 준다. 로컬에서 그냥 돌릴 때 기본값
ENV PORT=8080
EXPOSE 8080
# 마이그레이션은 추가만 하는 방식이라 배포 때마다 deploy로 맞춘다 (reset·dev는 절대 쓰지 않는다)
# npx가 다른 버전을 내려받지 않게 설치된 prisma CLI를 직접 부른다 (WORKDIR /app/backend 기준)
CMD ["sh", "-c", "../node_modules/.bin/prisma migrate deploy && exec node dist/server.js"]
