// 自定义 Next.js 服务器，同时处理 WebSocket
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const db = require('./db');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// 存储频道信息: { channelName: { password, users: Set, messageHistory: [] } }
const channels = new Map();

// 存储用户连接: ws -> { channel, username }
const users = new Map();

function broadcastToChannel(channel, data, excludeWs) {
  const channelData = channels.get(channel);
  if (!channelData) return;

  const message = JSON.stringify(data);

  channelData.users.forEach((client) => {
    if (client !== excludeWs && client.readyState === 1) { // 1 = WebSocket.OPEN
      client.send(message);
    }
  });
}

// 广播在线用户列表
function broadcastUserList(channel) {
  const channelData = channels.get(channel);
  if (!channelData) return;

  const userList = [];
  channelData.users.forEach((ws) => {
    const user = users.get(ws);
    if (user) userList.push(user.username);
  });

  broadcastToChannel(channel, {
    type: 'system',
    text: `当前在线: ${userList.length} 人`,
    users: userList,
    time: new Date().toLocaleTimeString()
  });
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // 创建 WebSocket 服务器
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url, true);
    
    // 只处理 /ws 路径的 WebSocket 连接
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  // Ping/Pong 保活机制：每 30 秒向所有客户端发送 ping
  const PING_INTERVAL = 30000;
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        // 上一次 ping 没有收到 pong，断开连接
        console.log('客户端无响应，断开连接');
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, PING_INTERVAL);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  wss.on('connection', (ws) => {
    console.log('新的客户端连接');

    // 标记连接为活跃
    ws.isAlive = true;

    // 收到客户端的 pong 回复，标记为活跃
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        switch (data.type) {
          case 'join':
            handleJoin(ws, data);
            break;
          case 'message':
            handleMessage(ws, data);
            break;
          case 'leave':
            handleLeave(ws);
            break;
        }
      } catch (e) {
        console.error('处理消息失败:', e);
      }
    });

    ws.on('close', () => {
      handleLeave(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket 错误:', error);
    });
  });

  function handleJoin(ws, data) {
    const { channel, username, password } = data;

    let channelData = channels.get(channel);

    if (!channelData) {
      channelData = {
        password,
        users: new Set(),
        messageHistory: []
      };
      channels.set(channel, channelData);
      console.log(`创建新频道: ${channel}`);
    } else {
      if (channelData.password !== password) {
        ws.send(JSON.stringify({
          type: 'error',
          text: '频道密码错误'
        }));
        return;
      }
    }

    channelData.users.add(ws);
    users.set(ws, { channel, username });

    ws.send(JSON.stringify({
      type: 'system',
      text: `已加入频道: ${channel}`,
      time: new Date().toLocaleTimeString()
    }));

    // 从数据库获取历史消息
    const dbHistory = db.getHistory(channel, 50);
    const history = dbHistory.map(row => ({
      type: 'message',
      id: row.id.toString(),
      username: row.username,
      text: row.text,
      time: row.time
    }));
    
    // 同步到内存
    channelData.messageHistory = history;

    ws.send(JSON.stringify({
      type: 'history',
      messages: history
    }));

    broadcastToChannel(channel, {
      type: 'system',
      text: `${username} 加入了频道`,
      time: new Date().toLocaleTimeString()
    }, ws);

    // 广播更新后的用户列表
    broadcastUserList(channel);

    console.log(`用户 ${username} 加入频道 ${channel}`);
  }

  function handleMessage(ws, data) {
    const user = users.get(ws);
    if (!user) return;

    const channelData = channels.get(user.channel);
    if (!channelData) return;

    const messageData = {
      type: 'message',
      id: Date.now().toString(),
      username: user.username,
      text: data.text,
      time: data.time || new Date().toLocaleTimeString()
    };

    channelData.messageHistory.push(messageData);

    if (channelData.messageHistory.length > 200) {
      channelData.messageHistory = channelData.messageHistory.slice(-200);
    }

    // 保存到数据库
    db.saveMessage(user.channel, user.username, data.text, messageData.time);
    // 清理旧消息
    db.cleanupOldMessages(user.channel, 200);

    broadcastToChannel(user.channel, messageData, null);
  }

  function handleLeave(ws) {
    const user = users.get(ws);
    if (!user) return;

    const { channel, username } = user;
    const channelData = channels.get(channel);

    if (channelData) {
      channelData.users.delete(ws);

      if (channelData.users.size === 0) {
        channels.delete(channel);
        console.log(`频道 ${channel} 已删除 (无人使用)`);
      } else {
        broadcastToChannel(channel, {
          type: 'system',
          text: `${username} 离开了频道`,
          time: new Date().toLocaleTimeString()
        }, null);

        // 广播更新后的用户列表
        broadcastUserList(channel);
      }
    }

    users.delete(ws);
    console.log(`用户 ${username} 离开频道 ${channel}`);
  }

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket available at ws://${hostname}:${port}/ws`);
  });
});
