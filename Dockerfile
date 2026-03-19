# Terminal Chatroom Dockerfile
# 多阶段构建优化镜像大小

# ========== 构建阶段 ==========
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装所有依赖（包括 devDependencies）
RUN npm ci

# 复制源代码
COPY . .

# 构建 Next.js
RUN npm run build

# ========== 生产阶段 ==========
FROM node:20-alpine AS production

WORKDIR /app

# 安装 SQLite 依赖（better-sqlite3 需要编译）
RUN apk add --no-cache python3 make g++

# 复制 package 文件
COPY package*.json ./

# 只安装生产依赖
RUN npm ci --only=production && npm cache clean --force

# 从构建阶段复制构建产物
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./
COPY --from=builder /app/db.js ./
COPY --from=builder /app/src ./src

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 3000 3001

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV WS_PORT=3001
ENV DB_PATH=/app/data/chat.db

# 启动应用
CMD ["node", "server.js"]
