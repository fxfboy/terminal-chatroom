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

// ========== 安全配置 ==========
const SECURITY_CONFIG = {
  // 输入长度限制
  maxUsernameLength: 50,
  maxChannelLength: 50,
  maxPasswordLength: 100,
  maxMessageLength: 100000, // 单条消息最大 100KB
  
  // 频率限制
  maxMessagesPerMinute: 30, // 每分钟最多 30 条消息
  maxConnectionsPerMinute: 10, // 每分钟最多 10 次连接
  maxJoinAttemptsPerMinute: 5, // 每分钟最多 5 次加入尝试
  
  // 封禁配置
  banDurationMs: 30 * 60 * 1000, // 封禁 30 分钟
};

// 存储频道信息
const channels = new Map();

// 存储用户连接: ws -> { channel, username, ip }
const users = new Map();

// 频率限制跟踪
const rateLimits = new Map(); // ip -> { messages: [], connections: [], joinAttempts: [] }

// 封禁列表: ip -> { until: timestamp, reason: string }
const banList = new Map();

// 获取客户端 IP
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

// 检查是否被封禁
function isBanned(ip) {
  const ban = banList.get(ip);
  if (!ban) return false;
  
  if (Date.now() > ban.until) {
    banList.delete(ip);
    return false;
  }
  return true;
}

// 添加封禁
function banIP(ip, reason = '违反规则', durationMs = SECURITY_CONFIG.banDurationMs) {
  banList.set(ip, {
    until: Date.now() + durationMs,
    reason
  });
  console.log(`封禁 IP: ${ip}, 原因：${reason}, 时长：${durationMs / 1000}秒`);
}

// 清理过期的封禁
function cleanupBans() {
  const now = Date.now();
  for (const [ip, ban] of banList.entries()) {
    if (now > ban.until) {
      banList.delete(ip);
    }
  }
}

// 每分钟清理一次过期封禁
setInterval(cleanupBans, 60000);

// 检查频率限制
function checkRateLimit(ip, type) {
  const now = Date.now();
  const windowMs = 60000; // 1 分钟窗口
  
  if (!rateLimits.has(ip)) {
    rateLimits.set(ip, { messages: [], connections: [], joinAttempts: [] });
  }
  
  const limits = rateLimits.get(ip);
  const arr = limits[type];
  
  // 清理过期记录
  while (arr.length > 0 && arr[0] < now - windowMs) {
    arr.shift();
  }
  
  // 检查是否超限
  const maxCount = type === 'messages' ? SECURITY_CONFIG.maxMessagesPerMinute :
                   type === 'connections' ? SECURITY_CONFIG.maxConnectionsPerMinute :
                   SECURITY_CONFIG.maxJoinAttemptsPerMinute;
  
  if (arr.length >= maxCount) {
    return false;
  }
  
  arr.push(now);
  return true;
}

// 清理过期的频率限制记录
setInterval(() => {
  const now = Date.now();
  const windowMs = 60000;
  for (const [ip, limits] of rateLimits.entries()) {
    for (const key of ['messages', 'connections', 'joinAttempts']) {
      limits[key] = limits[key].filter(t => t > now - windowMs);
    }
    // 如果所有记录都过期了，删除这个 IP 的记录
    if (limits.messages.length === 0 && limits.connections.length === 0 && limits.joinAttempts.length === 0) {
      rateLimits.delete(ip);
    }
  }
}, 60000);

// ========== 输入验证 ==========
function validateInput(data) {
  const errors = [];
  
  // 验证用户名
  if (!data.username || typeof data.username !== 'string') {
    errors.push('用户名不能为空');
  } else if (data.username.length > SECURITY_CONFIG.maxUsernameLength) {
    errors.push(`用户名不能超过${SECURITY_CONFIG.maxUsernameLength}字符`);
  } else if (!/^[\w\u4e00-\u9fa5\-_.\s]+$/.test(data.username)) {
    errors.push('用户名包含非法字符');
  }
  
  // 验证频道名
  if (!data.channel || typeof data.channel !== 'string') {
    errors.push('频道名不能为空');
  } else if (data.channel.length > SECURITY_CONFIG.maxChannelLength) {
    errors.push(`频道名不能超过${SECURITY_CONFIG.maxChannelLength}字符`);
  } else if (!/^[\w\u4e00-\u9fa5\-_]+$/.test(data.channel)) {
    errors.push('频道名包含非法字符');
  }
  
  // 验证密码
  if (!data.password || typeof data.password !== 'string') {
    errors.push('密码不能为空');
  } else if (data.password.length > SECURITY_CONFIG.maxPasswordLength) {
    errors.push(`密码不能超过${SECURITY_CONFIG.maxPasswordLength}字符`);
  }
  
  return errors;
}

// 验证消息内容
function validateMessage(text) {
  if (!text || typeof text !== 'string') {
    return '消息内容不能为空';
  }
  if (text.length > SECURITY_CONFIG.maxMessageLength) {
    return `消息长度不能超过${SECURITY_CONFIG.maxMessageLength}字符`;
  }
  return null;
}

// ========== 广播函数 ==========
function broadcastToChannel(channel, data, excludeWs) {
  const channelData = channels.get(channel);
  if (!channelData) return;

  const message = JSON.stringify(data);

  channelData.users.forEach((client) => {
    if (client !== excludeWs && client.readyState === 1) {
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
    text: `当前在线：${userList.length} 人`,
    users: userList,
    time: new Date().toLocaleTimeString()
  });
}

// 踢出用户
function kickUser(ws, reason = '被管理员踢出') {
  const user = users.get(ws);
  if (!user) return;
  
  ws.send(JSON.stringify({
    type: 'error',
    text: reason
  }));
  
  ws.close();
  handleLeave(ws);
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
    const ip = getClientIP(req);
    
    // 只处理 /ws 路径的 WebSocket 连接
    if (pathname === '/ws') {
      // 检查是否被封禁
      if (isBanned(ip)) {
        const ban = banList.get(ip);
        const remaining = Math.ceil((ban.until - Date.now()) / 1000);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.end(`IP 被封禁，剩余时间：${remaining}秒`);
        return;
      }
      
      // 检查连接频率限制
      if (!checkRateLimit(ip, 'connections')) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        socket.end('连接过于频繁，请稍后再试');
        return;
      }
      
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  // Ping/Pong 保活机制
  const PING_INTERVAL = 30000;
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
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

  wss.on('connection', (ws, req) => {
    const ip = getClientIP(req);
    console.log(`新的客户端连接 IP: ${ip}`);

    ws.isAlive = true;
    ws.ip = ip; // 保存 IP 用于封禁

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        // 检查消息频率限制
        if (data.type === 'message' && !checkRateLimit(ip, 'messages')) {
          ws.send(JSON.stringify({
            type: 'error',
            text: '发送消息过于频繁，请稍后再试'
          }));
          return;
        }

        switch (data.type) {
          case 'join':
            handleJoin(ws, data, ip);
            break;
          case 'message':
            handleMessage(ws, data);
            break;
          case 'leave':
            handleLeave(ws);
            break;
          case 'kick':
            // 仅用于测试，实际应该需要管理员权限
            handleKick(ws, data);
            break;
          case 'ban':
            // 仅用于测试，实际应该需要管理员权限
            handleBan(ws, data);
            break;
        }
      } catch (e) {
        console.error('处理消息失败:', e);
        ws.send(JSON.stringify({
          type: 'error',
          text: '无效的消息格式'
        }));
      }
    });

    ws.on('close', () => {
      handleLeave(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket 错误:', error);
    });
  });

  function handleJoin(ws, data, ip) {
    // 检查加入频率限制
    if (!checkRateLimit(ip, 'joinAttempts')) {
      ws.send(JSON.stringify({
        type: 'error',
        text: '加入尝试过于频繁，请稍后再试'
      }));
      return;
    }

    // 输入验证
    const errors = validateInput(data);
    if (errors.length > 0) {
      ws.send(JSON.stringify({
        type: 'error',
        text: errors.join('; ')
      }));
      return;
    }

    const { channel, username, password } = data;

    let channelData = channels.get(channel);

    if (!channelData) {
      channelData = {
        password,
        users: new Set(),
        messageHistory: []
      };
      channels.set(channel, channelData);
      console.log(`创建新频道：${channel}`);
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
    users.set(ws, { channel, username, ip });

    ws.send(JSON.stringify({
      type: 'system',
      text: `已加入频道：${channel}`,
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

    broadcastUserList(channel);

    console.log(`用户 ${username} 加入频道 ${channel}`);
  }

  function handleMessage(ws, data) {
    const user = users.get(ws);
    if (!user) return;

    const channelData = channels.get(user.channel);
    if (!channelData) return;

    // 验证消息内容
    const error = validateMessage(data.text);
    if (error) {
      ws.send(JSON.stringify({
        type: 'error',
        text: error
      }));
      return;
    }

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

        broadcastUserList(channel);
      }
    }

    users.delete(ws);
    console.log(`用户 ${username} 离开频道 ${channel}`);
  }

  // 踢出用户（测试用）
  function handleKick(ws, data) {
    const user = users.get(ws);
    if (!user) return;
    
    // 这里应该检查管理员权限，暂时简化处理
    const targetUsername = data.targetUsername;
    const channelData = channels.get(user.channel);
    
    if (!channelData) return;
    
    for (const client of channelData.users) {
      const targetUser = users.get(client);
      if (targetUser && targetUser.username === targetUsername) {
        kickUser(client, '被管理员踢出');
        broadcastToChannel(user.channel, {
          type: 'system',
          text: `${targetUsername} 已被踢出`,
          time: new Date().toLocaleTimeString()
        }, null);
        break;
      }
    }
  }

  // 封禁 IP（测试用）
  function handleBan(ws, data) {
    const user = users.get(ws);
    if (!user) return;
    
    const targetIp = data.targetIp;
    const reason = data.reason || '违反规则';
    
    if (targetIp) {
      banIP(targetIp, reason);
      
      // 断开该 IP 的所有连接
      for (const [client, clientUser] of users.entries()) {
        if (clientUser.ip === targetIp) {
          kickUser(client, `IP 被封禁：${reason}`);
        }
      }
      
      ws.send(JSON.stringify({
        type: 'system',
        text: `已封禁 IP: ${targetIp}`,
        time: new Date().toLocaleTimeString()
      }));
    }
  }

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket available at ws://${hostname}:${port}/ws`);
    console.log(`> 安全配置：消息限制${SECURITY_CONFIG.maxMessageLength}字符，频率限制${SECURITY_CONFIG.maxMessagesPerMinute}条/分钟`);
  });
});
