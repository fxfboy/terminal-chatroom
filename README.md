# Terminal Chatroom 🖥️

终端风格的加密聊天室

## 功能特点

- 🎨 终端/CRT 风格界面（黑底绿字）
- 🔐 端到端加密聊天 (AES-GCM + PBKDF2)
- 📁 私有频道 (需要密码才能加入)
- 💾 Session 自动恢复
- 🚪 用户加入/离开通知

## 技术栈

- Next.js 14 (App Router)
- TypeScript
- Web Crypto API (加密)
- WebSocket (实时通信)

## 快速开始

### 方式一：本地运行

#### 1. 安装依赖

```bash
cd terminal-chatroom
npm install
```

#### 2. 启动应用

```bash
# 开发模式（热重载）
npm run dev

# 或生产模式
npm run build
npm run start
```

#### 3. 打开浏览器

访问 http://localhost:3000

### 方式二：Docker 运行

#### 使用 Docker Compose（推荐）

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 停止并删除数据卷（谨慎使用）
docker-compose down -v
```

#### 使用纯 Docker

```bash
# 构建镜像
docker build -t terminal-chatroom .

# 运行容器
docker run -d \
  --name terminal-chatroom \
  -p 3000:3000 \
  -p 3001:3001 \
  -v chat-data:/app/data \
  -e NODE_ENV=production \
  terminal-chatroom

# 停止并删除容器
docker stop terminal-chatroom && docker rm terminal-chatroom
```

启动后访问 http://localhost:3000

### Docker 端口说明

- **3000**: HTTP 服务端口
- **3001**: WebSocket 通信端口

数据通过 `chat-data` 卷持久化，删除容器不会丢失聊天记录。

## 使用流程

### 首次加入

1. 输入用户名
2. 输入频道名称（不存在则自动创建）
3. 输入频道密码
4. 点击"加入频道"

### 恢复 Session

下次打开时，会询问是否恢复上次的 session，输入频道密码即可恢复。

## 加密说明

- 密码使用 PBKDF2 (100,000 次迭代) 派生 AES-256-GCM 密钥
- 所有消息在客户端加密后发送，服务器只转发密文
- LocalStorage 中的 session 数据也使用相同方式加密

## 项目结构

```
terminal-chatroom/
├── src/
│   ├── app/
│   │   ├── page.tsx        # 主页面 (登录 + 聊天室)
│   │   ├── page.module.css # 样式
│   │   ├── layout.tsx     # 布局
│   │   └── globals.css    # 全局样式
│   └── utils/
│       └── crypto.js       # 加密工具
├── server.js              # WebSocket 服务器
├── package.json
└── tsconfig.json
```

## 注意事项

- 频道密码是加密密钥，请妥善保管
- 服务器不存储任何明文消息
- Session 数据保存在浏览器 LocalStorage 中
