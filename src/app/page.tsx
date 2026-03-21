'use client';

import { useState, useEffect, useRef } from 'react';
import { encryptToStorage, decryptFromStorage } from '@/utils/crypto';
import styles from './page.module.css';

interface ChatUser {
  username: string;
  channel: string;
  password: string;
}

interface Message {
  id: string;
  type: 'user' | 'system' | 'error';
  username?: string;
  text: string;
  time: string;
}

const STORAGE_KEY = 'terminal_chatroom_session';

// 锁屏超时时间：5 分钟（毫秒）
const LOCK_TIMEOUT = 5 * 60 * 1000;

// HTML 转义，防止 XSS
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTime12Hour(date: Date = new Date()): string {
  let hours = date.getHours() % 12;
  if (hours === 0) hours = 12;
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export default function Home() {
  const [showModal, setShowModal] = useState(false);
  const [savedSession, setSavedSession] = useState<ChatUser | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [username, setUsername] = useState('');
  const [channel, setChannel] = useState('');
  const [password, setPassword] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [wsStatus, setWsStatus] = useState('connecting');
  const [isSending, setIsSending] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lockTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLoggingOut = useRef(false);

  // 检查是否有保存的 session
  useEffect(() => {
    const encryptedSession = localStorage.getItem(STORAGE_KEY);
    if (encryptedSession) {
      setShowModal(true);
    }
  }, []);

  // 锁屏功能：检测用户活动，超时后自动锁屏
  useEffect(() => {
    if (!isLoggedIn || isLocked) return;

    // 重置锁屏定时器
    const resetLockTimer = () => {
      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current);
      }
      lockTimerRef.current = setTimeout(() => {
        setIsLocked(true);
        setPassword(''); // 清空密码输入框
        addSystemMessage('长时间未操作，已自动锁屏');
      }, LOCK_TIMEOUT);
    };

    // 初始启动定时器
    resetLockTimer();

    // 监听用户活动事件
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, resetLockTimer);
    });

    return () => {
      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current);
      }
      events.forEach(event => {
        window.removeEventListener(event, resetLockTimer);
      });
    };
  }, [isLoggedIn, isLocked]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // WebSocket 连接
  useEffect(() => {
    if (!isLoggedIn) return;

    let reconnectTimer: NodeJS.Timeout | null = null;
    let ws: WebSocket | null = null;

    const connect = () => {
      // 先关闭旧连接，防止重复连接导致消息重复
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.onclose = null;  // 防止触发重连逻辑
        wsRef.current.close();
        wsRef.current = null;
      }

      // 使用 wss:// 协议 + 当前域名 + /ws 路径
      // 通过 Next.js 自定义服务器代理 WebSocket
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        addSystemMessage('已重新连接');
        // 加入频道
        ws?.send(JSON.stringify({
          type: 'join',
          channel,
          username,
          password
        }));
      };

      // 处理服务器的 ping
      (ws as any).onpong = () => {
        console.log('收到服务器 pong');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'message') {
            // 解密消息
            decryptMessage(data);
          } else if (data.type === 'system') {
            addSystemMessage(escapeHtml(data.text));
            // 更新在线用户列表
            if (data.users) {
              setOnlineUsers(data.users.map((u: string) => escapeHtml(u)));
            }
          } else if (data.type === 'error') {
            addErrorMessage(escapeHtml(data.text));
            // 如果是密码错误，退回到登录页并显示错误提示
            if (data.text === '频道密码错误') {
              setIsLoggedIn(false);
              setShowModal(false);
              setError('频道密码错误，请检查密码后重试');
            }
          } else if (data.type === 'history') {
            // 解密历史消息
            data.messages.forEach((msg: any) => decryptMessage(msg));
          }
        } catch (e) {
          console.error('解析消息失败:', e);
        }
      };

      ws.onerror = () => {
        setWsStatus('error');
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        if (isLoggingOut.current) {
          isLoggingOut.current = false;
          return;
        }
        addSystemMessage('连接断开，正在重连...');
        // 5秒后自动重连
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [isLoggedIn, channel, username, password]);

  // 解密消息
  const decryptMessage = async (data: any) => {
    try {
      const { decrypt } = await import('@/utils/crypto');
      const decryptedText = await decrypt(data.text, password);
      const safeUsername = escapeHtml(data.username || '');
      const isSelf = data.username === username;
      setMessages(prev => [...prev, {
        id: data.id || Date.now().toString(),
        type: 'user',
        username: isSelf ? safeUsername + ' (你)' : safeUsername,
        text: decryptedText,
        time: data.time || formatTime12Hour()
      }]);
    } catch {
      // 如果解密失败，可能是其他频道的消息或格式问题
      console.error('解密消息失败');
    }
  };

  const addSystemMessage = (text: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      type: 'system',
      text,
      time: formatTime12Hour()
    }]);
  };

  const addErrorMessage = (text: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      type: 'error',
      text,
      time: formatTime12Hour()
    }]);
  };

  // 渲染消息内容，支持代码块
  const renderMessageContent = (text: string) => {
    // 检测代码块
    const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      // 添加非代码部分
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      // 添加代码块
      parts.push({
        type: 'code',
        language: match[1],
        content: match[2]
      });
      lastIndex = match.index + match[0].length;
    }

    // 添加剩余部分
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    if (parts.length === 0) {
      return text;
    }

    return parts.map((part, index) => {
      if (typeof part === 'object' && part.type === 'code') {
        return (
          <pre key={index} className={styles.codeBlock}>
            <button
              className={styles.copyBtn}
              onClick={(e) => {
                const btn = e.currentTarget;
                navigator.clipboard.writeText(part.content).then(() => {
                  btn.textContent = '✅';
                  setTimeout(() => { btn.textContent = '📋'; }, 1500);
                });
              }}
            >
              📋
            </button>
            <code>{part.content}</code>
          </pre>
        );
      }
      // 将纯文本中的换行符转换为 <br> 标签
      const lines = (part as string).split('\n');
      return lines.map((line, i) => (
        <span key={`${index}-${i}`}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ));
    });
  };

  // 恢复 session
  const handleRestoreSession = async () => {
    setIsLoading(true);
    try {
      const { decryptFromStorage } = await import('@/utils/crypto');
      const session = await decryptFromStorage(STORAGE_KEY, password);
      if (session) {
        setUsername(session.username);
        setChannel(session.channel);
        setPassword(password);
        setIsLoggedIn(true);
        setShowModal(false);
      } else {
        setError('密码不正确，无法恢复会话');
      }
    } catch {
      setError('密码不正确，无法恢复会话');
    }
    setIsLoading(false);
  };

  // 解锁屏幕
  const handleUnlock = async () => {
    setIsLoading(true);
    try {
      const { decryptFromStorage } = await import('@/utils/crypto');
      const session = await decryptFromStorage(STORAGE_KEY, password);
      if (session && session.password === password) {
        setIsLocked(false);
        setError('');
        addSystemMessage('已解锁屏幕');
      } else {
        setError('密码不正确');
      }
    } catch {
      setError('密码不正确');
    }
    setIsLoading(false);
  };

  // 锁屏界面键盘事件
  const handleLockKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleUnlock();
    }
  };

  // 开始新的 session
  const handleNewSession = () => {
    setShowModal(false);
    setSavedSession(null);
    setPassword('');
  };

  // 登录表单键盘事件
  const handleLoginKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLogin();
    }
  };

  // 登录
  const handleLogin = async () => {
    setError('');
    setIsLoading(true);

    if (!username.trim()) {
      setError('请输入用户名');
      setIsLoading(false);
      return;
    }
    if (!channel.trim()) {
      setError('请输入频道名称');
      setIsLoading(false);
      return;
    }
    if (!password.trim()) {
      setError('请输入频道密码');
      setIsLoading(false);
      return;
    }

    // 保存到 LocalStorage (加密)
    const userData: ChatUser = { username, channel, password };
    await encryptToStorage(STORAGE_KEY, userData, password);

    setIsLoggedIn(true);
    setIsLoading(false);
    // 不需要立即显示，服务器广播回来时会显示
  };

  // 发送消息
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !wsRef.current || isSending) return;

    setIsSending(true);
    try {
      const { encrypt } = await import('@/utils/crypto');
      const encryptedText = await encrypt(inputMessage, password);

      wsRef.current.send(JSON.stringify({
        type: 'message',
        text: encryptedText,
        username,
        channel,
        time: formatTime12Hour()
      }));

      // 不需要立即显示，服务器广播回来时会显示
      setInputMessage('');
    } catch (e) {
      addErrorMessage('发送失败');
    } finally {
      setIsSending(false);
    }
  };

  // 键盘事件
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 登出
  const handleLogout = () => {
    isLoggingOut.current = true;
    // 发送离开消息给服务器
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'leave' }));
      wsRef.current.close();
    }
    // 清理状态
    localStorage.removeItem(STORAGE_KEY);
    setIsLoggedIn(false);
    setIsLocked(false);
    setUsername('');
    setChannel('');
    setPassword('');
    setMessages([]);
    setWsStatus('disconnected');
    // 清理锁屏定时器
    if (lockTimerRef.current) {
      clearTimeout(lockTimerRef.current);
    }
  };

  // 如果未登录，显示登录表单
  if (!isLoggedIn) {
    // 如果有保存的会话，优先显示恢复会话弹窗
    if (showModal) {
      return (
        <main className={styles.container}>
          <div className={styles.modalOverlay}>
            <div className={styles.modal}>
              <h2 className={styles.modalTitle}>恢复上次的会话?</h2>
              <p className={styles.hint}>请输入之前使用的频道密码来恢复</p>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>频道密码</label>
                <input
                  type="password"
                  className={styles.formInput}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入密码恢复会话"
                />
              </div>
              {error && <p className={styles.error}>{error}</p>}
              <div className={styles.modalButtons}>
                <button className={styles.btn} onClick={handleNewSession} disabled={isLoading}>
                  新建会话
                </button>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleRestoreSession} disabled={isLoading}>
                  {isLoading ? '恢复中...' : '恢复'}
                </button>
              </div>
            </div>
          </div>
        </main>
      );
    }

    // 否则显示登录表单
    return (
      <main className={styles.container}>
        <div className={styles.loginContainer}>
          <div className={styles.loginBox}>
            <h1 className={styles.loginTitle}>&gt; TERMINAL CHATROOM_</h1>

            <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>用户名 *</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入你的用户名"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>频道名称 *</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="输入频道名称，不存在则创建"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>频道密码 *</label>
                <input
                  type="password"
                  className={styles.formInput}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入频道密码"
                />
                <p className={styles.hint}>密码将用于加密聊天内容，请妥善保管</p>
              </div>

              {error && <p className={styles.error}>{error}</p>}

              <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={isLoading}>
                {isLoading ? '加入中...' : '> 加入频道'}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  // 聊天室界面
  // 如果已锁屏，显示锁屏界面
  if (isLocked) {
    return (
      <main className={styles.container}>
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>🔒 屏幕已锁定</h2>
            <p className={styles.hint}>长时间未操作，请输入频道密码解锁</p>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>频道密码</label>
              <input
                type="password"
                className={styles.formInput}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleLockKeyPress}
                placeholder="输入密码解锁屏幕"
                autoFocus
              />
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.modalButtons}>
              <button className={styles.btn} onClick={handleLogout} disabled={isLoading}>
                退出登录
              </button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleUnlock} disabled={isLoading}>
                {isLoading ? '解锁中...' : '解锁'}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <div className={styles.terminalHeader}>
        <span className={styles.terminalTitle}>&gt; {channel}_</span>
        <span className={styles.terminalStatus}>
          [{wsStatus}] {username}@localhost
        </span>
        <button className={styles.btn} onClick={handleLogout} style={{ padding: '5px 10px', width: 'auto' }}>
          登出
        </button>
      </div>

      <div className={styles.chatContainer}>
        <div className={styles.onlineUsers}>
          <div className={styles.onlineUsersTitle}>在线用户</div>
          <div className={styles.onlineUsersList}>
            {onlineUsers.map((user, index) => (
              <div key={index} className={styles.onlineUserItem}>
                <span className={styles.onlineUserDot}></span>
                <span className={styles.username} title={user}>{user}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.chatMain}>
          <div className={styles.chatMessages}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.message} ${msg.type === 'system' ? styles.messageSystem : ''} ${msg.type === 'error' ? styles.messageError : ''} ${msg.username?.includes('(你)') || msg.username === username ? styles.self : styles.other}`}
              >
                {msg.type === 'user' ? (
                <>
                  <div className={styles.messageHeader}>
                    <span className={styles.messageUser}><span className={styles.username} title={msg.username}>{msg.username}</span>:</span>
                    <span className={styles.messageTime}>[{msg.time}]</span>
                  </div>
                  <span className={styles.messageContent}>{renderMessageContent(msg.text)}</span>
                </>
                ) : (
                  <span className={styles.messageText}>{msg.text}</span>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className={styles.chatInputArea}>
            <textarea
              className={styles.chatInput}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="输入消息... (Enter 发送，Shift+Enter 换行)，支持代码块"
              rows={2}
            />
            <div className={styles.buttonRow}>
              <button 
                className={styles.codeBlockBtn} 
                onClick={() => {
                  const prefix = inputMessage ? '\n' : '';
                  setInputMessage(prev => prev + prefix + '```\n\n```');
                }}
                title="插入代码块"
              >
                <code>&lt;/&gt;</code>
              </button>
              <button className={styles.sendBtn} onClick={handleSendMessage} disabled={isSending}>
                &gt; 发送
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
