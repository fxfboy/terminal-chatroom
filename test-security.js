// 安全功能测试脚本 - 优化版
const WebSocket = require('ws');

const BASE_URL = 'ws://localhost:3000/ws';

// 测试计数器
let passed = 0;
let failed = 0;

function log(result, test, message) {
  const status = result ? '✅' : '❌';
  console.log(`${status} ${test}: ${message}`);
  if (result) passed++;
  else failed++;
}

// 创建连接并测试
function createConnection() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE_URL);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    setTimeout(() => reject(new Error('连接超时')), 5000);
  });
}

// 测试 1: 超长用户名
async function testLongUsername() {
  const ws = await createConnection();
  
  return new Promise((resolve) => {
    const longUsername = 'a'.repeat(100);
    
    ws.send(JSON.stringify({
      type: 'join',
      channel: 'test1-' + Date.now(),
      username: longUsername,
      password: 'test123'
    }));
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      const rejected = msg.type === 'error' && msg.text.includes('用户名');
      log(rejected, '超长用户名测试', rejected ? '正确拒绝' : '未拒绝');
      ws.close();
      resolve(rejected);
    });
  });
}

// 测试 2: 超长频道名
async function testLongChannelName() {
  const ws = await createConnection();
  
  return new Promise((resolve) => {
    const longChannel = 'channel-'.repeat(20);
    
    ws.send(JSON.stringify({
      type: 'join',
      channel: longChannel,
      username: 'testuser',
      password: 'test123'
    }));
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      const rejected = msg.type === 'error' && msg.text.includes('频道名');
      log(rejected, '超长频道名测试', rejected ? '正确拒绝' : '未拒绝');
      ws.close();
      resolve(rejected);
    });
  });
}

// 测试 3: 超长密码
async function testLongPassword() {
  const ws = await createConnection();
  
  return new Promise((resolve) => {
    const longPassword = 'p'.repeat(200);
    
    ws.send(JSON.stringify({
      type: 'join',
      channel: 'test3-' + Date.now(),
      username: 'testuser',
      password: longPassword
    }));
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      const rejected = msg.type === 'error' && msg.text.includes('密码');
      log(rejected, '超长密码测试', rejected ? '正确拒绝' : '未拒绝');
      ws.close();
      resolve(rejected);
    });
  });
}

// 测试 4: 超长消息
async function testLongMessage() {
  const ws = await createConnection();
  
  return new Promise((resolve) => {
    let joined = false;
    
    ws.send(JSON.stringify({
      type: 'join',
      channel: 'test4-' + Date.now(),
      username: 'testuser',
      password: 'test123'
    }));
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      
      if (!joined && (msg.type === 'system' || msg.type === 'history')) {
        joined = true;
        const longMessage = 'x'.repeat(5000);
        ws.send(JSON.stringify({
          type: 'message',
          text: longMessage
        }));
      } else if (joined && msg.type === 'error') {
        const rejected = msg.text.includes('消息长度') || msg.text.includes('超过');
        log(rejected, '超长消息测试', rejected ? '正确拒绝' : '未拒绝');
        ws.close();
        resolve(rejected);
      } else if (joined && msg.type === 'message') {
        // 消息被接受了（不应该）
        log(false, '超长消息测试', '超长消息被接受');
        ws.close();
        resolve(false);
      }
    });
    
    setTimeout(() => {
      if (!joined) {
        log(false, '超长消息测试', '超时');
        ws.close();
        resolve(false);
      }
    }, 5000);
  });
}

// 测试 5: 非法字符用户名
async function testInvalidUsername() {
  const ws = await createConnection();
  
  return new Promise((resolve) => {
    const invalidUsername = '<script>alert("xss")</script>';
    let tested = false;
    
    ws.send(JSON.stringify({
      type: 'join',
      channel: 'test5-' + Date.now(),
      username: invalidUsername,
      password: 'test123'
    }));
    
    ws.on('message', (data) => {
      if (tested) return;
      tested = true;
      
      const msg = JSON.parse(data.toString());
      // 如果是 error 且包含非法字符，或者根本不是 system/history（说明被拒绝了）
      const rejected = msg.type === 'error' && msg.text.includes('非法字符');
      log(rejected, '非法字符用户名测试', rejected ? '正确拒绝' : 'Error: ' + msg.text);
      ws.close();
      resolve(rejected);
    });
    
    setTimeout(() => {
      if (!tested) {
        log(false, '非法字符用户名测试', '超时');
        ws.close();
        resolve(false);
      }
    }, 5000);
  });
}

// 测试 6: 正常用户
async function testNormalUser() {
  const ws = await createConnection();
  
  return new Promise((resolve) => {
    ws.send(JSON.stringify({
      type: 'join',
      channel: 'normal-' + Date.now(),
      username: '正常用户',
      password: 'pass123'
    }));
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'system' || msg.type === 'history') {
        log(true, '正常用户测试', '加入成功');
        ws.close();
        resolve(true);
      } else if (msg.type === 'error') {
        log(false, '正常用户测试', '意外错误：' + msg.text);
        ws.close();
        resolve(false);
      }
    });
    
    setTimeout(() => {
      log(false, '正常用户测试', '超时');
      ws.close();
      resolve(false);
    }, 5000);
  });
}

// 运行所有测试
async function runTests() {
  console.log('\n🔐 开始安全功能测试...\n');
  
  try {
    // 先测正常用户和非法字符（避免频率限制影响）
    await testNormalUser();
    await new Promise(r => setTimeout(r, 500));
    
    await testInvalidUsername();
    await new Promise(r => setTimeout(r, 500));
    
    // 再测安全限制
    await testLongUsername();
    await new Promise(r => setTimeout(r, 300));
    
    await testLongChannelName();
    await new Promise(r => setTimeout(r, 300));
    
    await testLongPassword();
    await new Promise(r => setTimeout(r, 300));
    
    await testLongMessage();
  } catch (e) {
    console.error('测试出错:', e.message);
  }
  
  console.log(`\n📊 测试结果：${passed} 通过，${failed} 失败\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
