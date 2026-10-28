# 배포용 이미지 (Railway). 백엔드가 API와 frontend/ 정적 화면을 한 주소로 같이 내려준다.
# onnxruntime-node·sharp 네이티브 바이너리가 glibc 기준이라 alpine이 아닌 bookworm-slim을 쓴다.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY packages/shared/package.json packages/shared/
# postinstall(prisma generate)은 스키마가 있어야 해서 설치 때는 건너뛰고 아래에서 따로 돌린다.
# sharp·onnxruntime-node는 linux x64 바이너리가 패키지에 들어 있어 설치 스크립트 없이도 동작한다.
RUN npm ci --ignore-scripts
COPY packages/shared packages/shared
COPY backend backend
RUN npm run db:generate -w backend && npm run build -w backend

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# 시드·관리자 만들기(tsx)와 migrate deploy(prisma CLI)를 railway ssh로 돌릴 수 있게 개발 의존성도 남긴다
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/backend/package.json /app/backend/prisma.config.ts /app/backend/tsconfig.json backend/
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/src backend/src
COPY --from=build /app/backend/prisma backend/prisma
COPY --from=build /app/backend/scripts backend/scripts
COPY --from=build /app/backend/models backend/models
COPY frontend frontend
WORKDIR /app/backend
# Railway가 PORT를 넣어 준다. 로컬에서 그냥 돌릴 때 기본값
ENV PORT=8080
EXPOSE 8080
# 마이그레이션은 추가만 하는 방식이라 배포 때마다 deploy로 맞춘다 (reset·dev는 절대 쓰지 않는다)
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/server.js"]
