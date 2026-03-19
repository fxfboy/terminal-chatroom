// 安全功能最终测试脚本
const WebSocket = require('ws');

const BASE_URL = 'ws://localhost:3000/ws';
let passed = 0, failed = 0;

function log(result, test, message) {
  console.log(`${result ? '✅' : '❌'} ${test}: ${message}`);
  result ? passed++ : failed++;
}

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// 创建连接
function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE_URL);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 5000);
  });
}

// 测试：加入频道并检查响应
async function testJoin(testName, username, channel, password, expectError, errorKeyword) {
  const ws = await connect();
  
  return new Promise((resolve) => {
    ws.send(JSON.stringify({ type: 'join', channel, username, password }));
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (expectError) {
        const ok = msg.type === 'error' && (!errorKeyword || msg.text.includes(errorKeyword));
        log(ok, testName, ok ? '正确拒绝' : '未拒绝: ' + msg.text);
      } else {
        const ok = msg.type === 'system' || msg.type === 'history';
        log(ok, testName, ok ? '成功' : '意外：' + msg.type);
      }
      ws.close();
      resolve();
    });
    
    setTimeout(() => {
      log(false, testName, '超时');
      ws.close();
      resolve();
    }, 5000);
  });
}

async function runTests() {
  console.log('\n🔐 Terminal Chatroom 安全功能测试\n');
  
  // 正常用户
  await testJoin('正常用户', '正常用户', 'test-' + Date.now(), 'pass123', false);
  await wait(200);
  
  // 超长用户名
  await testJoin('超长用户名 (100 字符)', 'a'.repeat(100), 'test', 'pass', true, '用户名');
  await wait(200);
  
  // 超长频道名
  await testJoin('超长频道名 (200 字符)', 'user', 'c'.repeat(200), 'pass', true, '频道名');
  await wait(200);
  
  // 超长密码
  await testJoin('超长密码 (200 字符)', 'user', 'test', 'p'.repeat(200), true, '密码');
  await wait(200);
  
  // 非法字符
  await testJoin('非法字符用户名', '<script>xss</script>', 'test', 'pass', true, '非法字符');
  await wait(200);
  
  // 测试超长消息
  const ws = await connect();
  await new Promise((resolve) => {
    let joined = false;
    ws.send(JSON.stringify({ type: 'join', channel: 'msg-test-' + Date.now(), username: 'user', password: 'pass' }));
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (!joined && (msg.type === 'system' || msg.type === 'history')) {
        joined = true;
        ws.send(JSON.stringify({ type: 'message', text: 'x'.repeat(5000) }));
      } else if (joined && msg.type === 'error' && msg.text.includes('长度')) {
        log(true, '超长消息 (5000 字符)', '正确拒绝');
        ws.close();
        resolve();
      } else if (joined && msg.type === 'message') {
        log(false, '超长消息 (5000 字符)', '被接受了!');
        ws.close();
        resolve();
      }
    });
    
    setTimeout(() => {
      log(false, '超长消息 (5000 字符)', '超时');
      ws.close();
      resolve();
    }, 5000);
  });
  
  console.log(`\n📊 结果：${passed} 通过，${failed} 失败\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
