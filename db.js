const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'chat.db');
const db = new Database(dbPath);

// 初始化数据库表
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,
    username TEXT NOT NULL,
    text TEXT NOT NULL,
    time TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);
`);

module.exports = {
  // 保存消息
  saveMessage: (channel, username, text, time) => {
    const stmt = db.prepare('INSERT INTO messages (channel, username, text, time) VALUES (?, ?, ?, ?)');
    return stmt.run(channel, username, text, time);
  },

  // 获取频道历史消息
  getHistory: (channel, limit = 100) => {
    const stmt = db.prepare('SELECT * FROM (SELECT * FROM messages WHERE channel = ? ORDER BY id DESC LIMIT ?) ORDER BY id ASC');
    return stmt.all(channel, limit);
  },

  // 清理旧消息（保留最近200条）
  cleanupOldMessages: (channel, keepCount = 200) => {
    const stmt = db.prepare(`
      DELETE FROM messages 
      WHERE channel = ? 
      AND id NOT IN (
        SELECT id FROM messages 
        WHERE channel = ? 
        ORDER BY id DESC 
        LIMIT ?
      )
    `);
    return stmt.run(channel, channel, keepCount);
  }
};
