# E2E Testing with Playwright

本目录包含 terminal-chatroom 项目的端到端 (E2E) 测试。

## 目录结构

```
e2e/
├── README.md           # 本文件
├── tsconfig.json       # TypeScript 配置
├── helpers/            # 测试辅助工具
│   ├── crypto.ts       # 随机数据生成
│   ├── websocket.ts    # WebSocket 辅助（预留）
│   └── page-objects.ts # Page Object 模式实现
└── tests/              # 测试文件
    ├── login.spec.ts       # 登录流程测试
    ├── messaging.spec.ts   # 消息功能测试
    └── session.spec.ts     # 会话管理测试
```

## 运行测试

### 运行所有测试
```bash
npm run test:e2e
```

### 运行测试并生成 HTML 报告
```bash
npx playwright test --reporter=html
npx playwright show-report
```

### 以调试模式运行
```bash
npm run test:e2e:debug
```

### 以 UI 模式运行
```bash
npm run test:e2e:ui
```

### 运行特定测试文件
```bash
npx playwright test e2e/tests/login.spec.ts
```

### 运行特定测试（通过名称过滤）
```bash
npx playwright test -g "should send a message"
```

## 测试说明

### Login Flow (login.spec.ts)
- 显示登录表单
- 使用有效凭据加入频道
- 验证空用户名/频道/密码的错误提示
- 登出功能

### Messaging Flow (messaging.spec.ts)
- 显示聊天界面
- 发送单条消息
- 发送多条消息
- 处理空消息
- 显示在线用户
- 登出功能

### Session Management (session.spec.ts)
- 登出后创建新会话
- 页面刷新后会话保持
- 显示恢复会话选项

## Page Objects

测试使用 Page Object 模式，封装在 `helpers/page-objects.ts` 中：

- `ChatRoomPage` - 主页面（包含登录和聊天功能）

## 注意事项

1. 测试会自动启动开发服务器（通过 playwright.config.ts 中的 webServer 配置）
2. 测试使用 Chromium 浏览器
3. 每个测试使用唯一的用户名和频道名，避免冲突
4. WebSocket 连接需要时间建立，测试中包含了适当的等待时间
