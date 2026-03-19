// 加密工具 - 使用 Web Crypto API
// 密钥使用频道密码，聊天内容端到端加密

// 将字符串转换为 Uint8Array
function stringToBytes(str) {
  return new TextEncoder().encode(str);
}

// 将 Uint8Array 转换为字符串
function bytesToString(bytes) {
  return new TextDecoder().decode(bytes);
}

// 从密码派生密钥 (PBKDF2)
async function deriveKey(password, salt) {
  const passwordBytes = stringToBytes(password);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// 加密数据
async function encrypt(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    stringToBytes(text)
  );

  // 组合 salt + iv + encrypted data
  const encryptedBytes = new Uint8Array(encrypted);
  const combined = new Uint8Array(salt.length + iv.length + encryptedBytes.length);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(encryptedBytes, salt.length + iv.length);

  // 转换为 base64
  let binary = '';
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

// 解密数据
async function decrypt(encryptedData, password) {
  try {
    // 从 base64 解码
    const binary = atob(encryptedData);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }
    
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);
    
    const key = await deriveKey(password, salt);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encrypted
    );
    
    return bytesToString(new Uint8Array(decrypted));
  } catch (e) {
    throw new Error('解密失败，密码可能不正确');
  }
}

// 加密存储到 LocalStorage
async function encryptToStorage(key, data, password) {
  const jsonStr = JSON.stringify(data);
  const encrypted = await encrypt(jsonStr, password);
  localStorage.setItem(key, encrypted);
}

// 从 LocalStorage 解密读取
async function decryptFromStorage(key, password) {
  const encrypted = localStorage.getItem(key);
  if (!encrypted) return null;
  
  try {
    const decrypted = await decrypt(encrypted, password);
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.encrypt = encrypt;
  window.decrypt = decrypt;
}

export { encrypt, decrypt, encryptToStorage, decryptFromStorage };
