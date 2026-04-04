# @提及（At-Mention）功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在输入框中输入 `@` 时弹出在线用户下拉列表，选择后插入 `@用户名`，消息显示时高亮所有 `@提及`。

**Architecture:** 纯前端功能，无需修改 WebSocket 服务端。在 `page.tsx` 中增加提及检测状态和下拉列表 UI；修改 `renderMessageContent` 函数，对解密后的消息文本中的 `@用户名` 进行高亮渲染；新增 CSS 样式。

**Tech Stack:** React 18 (hooks), TypeScript, CSS Modules, Next.js 14

---

## 文件结��

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/app/page.tsx` | 修改 | 添加提及状态、检测逻辑、下拉 UI、消息渲染高亮 |
| `src/app/page.module.css` | 修改 | 添加 `.mentionDropdown`、`.mentionItem`、`.mentionHighlight`、`.mentionSelf` 样式 |

> 无需创建新文件，遵循现有单文件组件模式。

---

## Task 1: 添加 CSS 样���

**Files:**
- Modify: `src/app/page.module.css`

- [ ] **Step 1: 在 page.module.css 末尾追加提及相关样式**

```css
/* ===== @提及功能样式 ===== */

/* 输入区域的相对定位包装（用于定位下拉列表） */
.inputWrapper {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* 提及下拉列表 */
.mentionDropdown {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--input-bg);
  border: 1px solid #8b5cf6;
  box-shadow: 0 -4px 16px rgba(139, 92, 246, 0.2);
  z-index: 100;
  max-height: 200px;
  overflow-y: auto;
}

.mentionDropdownHeader {
  padding: 6px 12px;
  font-size: 11px;
  color: #64748b;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color);
}

/* 单个提及候选项 */
.mentionItem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-color);
  transition: background 0.15s ease;
}

.mentionItem:hover,
.mentionItemActive {
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
}

.mentionItem .onlineUserDot {
  width: 7px;
  height: 7px;
  min-width: 7px;
  background: #22c55e;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 消息中的 @提及高亮（他人提及） */
.mentionHighlight {
  color: #a78bfa;
  font-weight: 600;
  background: rgba(139, 92, 246, 0.12);
  padding: 0 3px;
  border-radius: 3px;
}

/* 消息中提及到自己时的高亮（更突出） */
.mentionSelf {
  color: #f59e0b;
  font-weight: 700;
  background: rgba(245, 158, 11, 0.15);
  padding: 0 3px;
  border-radius: 3px;
}
```

- [ ] **Step 2: 手动确认 CSS 语法无误（无括号不匹配）**

---

## Task 2: 添加提及状态和辅助函数

**Files:**
- Modify: `src/app/page.tsx` (state 区域和 helpers 区域)

- [ ] **Step 1: 在 `export default function Home()` 内，现有 state 声明之后添加提及相关 state 和 ref**

在 `const wsRef = useRef<WebSocket | null>(null);` 一行之后，追加：

```typescript
  // ===== @提及功能 state =====
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionDropdownVisible, setMentionDropdownVisible] = useState(false);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
```

- [ ] **Step 2: 在 `escapeHtml` 函数之后，添加两个提及辅助函数**

```typescript
/**
 * 从文本和光标位置提取当前正在输入的 @query。
 * 从光标向左扫描，若遇到 @ 则返回 @ 之后的内容，
 * 若遇到空格 / 换行则返回 null（说明 @ 已经结束）。
 */
function getMentionQuery(text: string, cursorPos: number): string | null {
  let i = cursorPos - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '@') {
      // @ 前面必须是字符串起始、空格或换行，防止误触发 email 地址
      if (i === 0 || text[i - 1] === ' ' || text[i - 1] === '\n') {
        return text.slice(i + 1, cursorPos);
      }
      return null;
    }
    if (ch === ' ' || ch === '\n') return null;
    i--;
  }
  return null;
}

/**
 * 将文本中 cursorPos 左侧的 @query 替换为 @username（带尾随空格）。
 */
function replaceMentionInText(
  text: string,
  cursorPos: number,
  query: string,
  username: string
): { newText: string; newCursor: number } {
  const atStart = cursorPos - query.length - 1; // @ 的位置
  const before = text.slice(0, atStart);
  const after = text.slice(cursorPos);
  const insertion = `@${username} `;
  return {
    newText: before + insertion + after,
    newCursor: before.length + insertion.length,
  };
}
```

- [ ] **Step 3: 在文件顶部 `import` 区域确认无需新增 import（所有用到的均已引入）**

---

## Task 3: 实现 textarea 的提及检测逻辑

**Files:**
- Modify: `src/app/page.tsx` (handleInputChange 新增，handleKeyPress 新建独立函数后替换内联 onKeyDown)

- [ ] **Step 1: 将现有 textarea 的 `onChange` 改为调用新函数 `handleInputChange`**

找到如下代码：
```typescript
onChange={(e) => setInputMessage(e.target.value)}
```
替换为：
```typescript
onChange={handleInputChange}
```

- [ ] **Step 2: 在 `handleSendMessage` 函数之前，添加 `handleInputChange` 函数**

```typescript
  // 处理输入框变化，检测 @提及
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputMessage(value);

    const cursor = e.target.selectionStart ?? value.length;
    const query = getMentionQuery(value, cursor);

    if (query !== null) {
      setMentionQuery(query);
      setMentionActiveIndex(0);
      setMentionDropdownVisible(true);
    } else {
      setMentionDropdownVisible(false);
      setMentionQuery('');
    }
  };
```

- [ ] **Step 3: 在 `handleSendMessage` 发送时关闭下拉列表**

在 `handleSendMessage` 函数体的开头添加一行：
```typescript
    setMentionDropdownVisible(false);
```

- [ ] **Step 4: 定义新的 `handleKeyPress` 函数（注意：聊天输入框没有独立的键盘处理函数，只有内联 onKeyDown，需新建）**

在 `selectMention` 函数定义（Step 5）之后，JSX 返回语句之前，添加：

```typescript
  // 聊天输入框键盘事件（含 @提及下拉导航）
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (mentionDropdownVisible) {
      const filtered = onlineUsers.filter(u =>
        u.toLowerCase().startsWith(mentionQuery.toLowerCase())
      );

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionActiveIndex(i => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionActiveIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filtered[mentionActiveIndex]) {
          selectMention(filtered[mentionActiveIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionDropdownVisible(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
```

- [ ] **Step 4b: 将 JSX 中聊天输入框的内联 `onKeyDown` 替换为调用 `handleKeyPress`**

找到（位于 chatInputArea 内的 textarea）：
```typescript
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
```
替换为：
```typescript
              onKeyDown={handleKeyPress}
```

- [ ] **Step 5: 在 `handleKeyPress` 之后，添加 `selectMention` 函数**

```typescript
  // 选中提及候选人，插入到输入框
  const selectMention = (selectedUsername: string) => {
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? inputMessage.length;
    const { newText, newCursor } = replaceMentionInText(
      inputMessage,
      cursor,
      mentionQuery,
      selectedUsername
    );
    setInputMessage(newText);
    setMentionDropdownVisible(false);
    setMentionQuery('');
    // 恢复焦点并设置光标位置
    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(newCursor, newCursor);
      }
    }, 0);
  };
```

---

## Task 4: 添加 textarea 的 ref 绑定

**Files:**
- Modify: `src/app/page.tsx` (JSX textarea 元素)

- [ ] **Step 1: 找到 JSX 中的 `<textarea` 元素，添加 `ref` 属性**

找到：
```typescript
            <textarea
              className={styles.chatInput}
              value={inputMessage}
```
替换为：
```typescript
            <textarea
              ref={textareaRef}
              className={styles.chatInput}
              value={inputMessage}
```

---

## Task 5: 添加提及下拉列表 UI

**Files:**
- Modify: `src/app/page.tsx` (chatInputArea JSX 区域)

- [ ] **Step 1: 找到 chatInputArea 内的 textarea 包裹结构，增加 inputWrapper 和下拉列表**

找到：
```typescript
          <div className={styles.chatInputArea}>
            <textarea
              ref={textareaRef}
```
替换为：
```typescript
          <div className={styles.chatInputArea}>
            <div className={styles.inputWrapper}>
              {mentionDropdownVisible && (() => {
                const filtered = onlineUsers.filter(u =>
                  u.toLowerCase().startsWith(mentionQuery.toLowerCase())
                );
                if (filtered.length === 0) return null;
                return (
                  <div className={styles.mentionDropdown}>
                    <div className={styles.mentionDropdownHeader}>
                      在线用户 · 按 ↑↓ 导航，Enter/Tab 确认，Esc 关闭
                    </div>
                    {filtered.map((user, idx) => (
                      <div
                        key={user}
                        className={`${styles.mentionItem} ${idx === mentionActiveIndex ? styles.mentionItemActive : ''}`}
                        onMouseDown={(e) => {
                          // 用 mousedown 而非 click，防止 textarea blur 先触发
                          e.preventDefault();
                          selectMention(user);
                        }}
                      >
                        <span className={styles.onlineUserDot} />
                        {user}
                      </div>
                    ))}
                  </div>
                );
              })()}
              <textarea
                ref={textareaRef}
```

- [ ] **Step 2: 找到 textarea 结束标签之后的结构，补上 inputWrapper 的闭合标签**

找到：
```typescript
              placeholder="输入消息... (Enter 发送，Shift+Enter 换行)，支持代码块"
              rows={2}
            />
            <div className={styles.buttonRow}>
```
替换为：
```typescript
              placeholder="输入消息... (Enter 发送，Shift+Enter 换行)，支持代码块，@ 提及用户"
              rows={2}
            />
            </div>{/* end inputWrapper */}
            <div className={styles.buttonRow}>
```

---

## Task 6: 消息渲染中高亮 @提及

**Files:**
- Modify: `src/app/page.tsx` (renderMessageContent 函数)

- [ ] **Step 1: 修改 `renderMessageContent` 函数，在纯文本部分加入 @提及高亮**

找到函数内处理纯文本的部分：
```typescript
      // 将纯文本中的换行符转换为 <br> 标签
      const lines = (part as string).split('\n');
      return lines.map((line, i) => (
        <span key={`${index}-${i}`}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ));
```
替换为：
```typescript
      // 将纯文本中的换行符转换为 <br>，并高亮 @提及
      const lines = (part as string).split('\n');
      return lines.map((line, i) => (
        <span key={`${index}-${i}`}>
          {renderLineWithMentions(line)}
          {i < lines.length - 1 && <br />}
        </span>
      ));
```

- [ ] **Step 2: 在 `renderMessageContent` 函数之前，添加 `renderLineWithMentions` 函数**

```typescript
  // 将单行文本中的 @用户名 替换为高亮 span
  const renderLineWithMentions = (line: string) => {
    const mentionRegex = /@([\w\u4e00-\u9fa5\-_.]+)/g;
    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = mentionRegex.exec(line)) !== null) {
      // 普通文本部分
      if (m.index > lastIndex) {
        result.push(line.slice(lastIndex, m.index));
      }
      const mentionedName = m[1];
      const isSelf = mentionedName === username;
      result.push(
        <span
          key={m.index}
          className={isSelf ? styles.mentionSelf : styles.mentionHighlight}
          title={isSelf ? '你被提及了' : `@${mentionedName}`}
        >
          @{mentionedName}
        </span>
      );
      lastIndex = m.index + m[0].length;
    }

    if (lastIndex < line.length) {
      result.push(line.slice(lastIndex));
    }

    return result.length > 0 ? result : line;
  };
```

---

## Task 7: 验证与收尾

- [ ] **Step 1: 启动开发服务器**

```bash
cd /Users/one/projects/terminal-chatroom
npm run dev
```

Expected: 服务器在 `http://localhost:3000` 启动，无编���错误。

- [ ] **Step 2: 打开两个浏览器标签页，分别以不同用户名加入同一频道**

验证在线用户列表中两个用户均出现。

- [ ] **Step 3: 在输入框中输入 `@`，验证下拉列表出现**

Expected: 显示所有在线用户的下拉列表（含绿色圆点）。

- [ ] **Step 4: 继续输入部分用户名，验证下拉列表实时过滤**

Expected: 只显示名字以已输入内容开头的用户。

- [ ] **Step 5: 用键盘 ↑↓ 导航下拉列表，按 Enter 或 Tab 选择**

Expected: `@用户名 ` 被插入到输入框光标位置，下拉列表关闭。

- [ ] **Step 6: 按 Esc 键验证下拉列表关闭**

Expected: 下拉列表消失，已输入的 `@query` 保留在输入框中。

- [ ] **Step 7: 发送含 `@用户名` 的消息，验证消息气泡中高亮**

Expected:
- 提及他人：`@用户名` 显示为紫色高亮（`.mentionHighlight`）
- 提及自己：`@用户名` 显示为黄色高亮（`.mentionSelf`）

- [ ] **Step 8: 用鼠标点击下拉候选项，验证也能正常选择**

Expected: 与键盘选择效果相同。

- [ ] **Step 9: 运行 lint 检查**

```bash
npm run lint
```

Expected: 无 lint 错误。

- [ ] **Step 10: 提交**

```bash
git add src/app/page.tsx src/app/page.module.css
git commit -m "feat: 添加 @提及��能 - 输入框下拉选择在线用户，消息高亮显示"
```

---

## 注意事项

1. **XSS 安全**：`onlineUsers` 中的用户名已在 `ws.onmessage` 中通过 `escapeHtml` 处理，`renderLineWithMentions` 中直接使用 React JSX 渲染（非 `dangerouslySetInnerHTML`），天然防 XSS。
2. **加密透明**：`@提及` 文本包含在消息明文中，随普通消息一起加密发送、解密后渲染，无需服务端感知。
3. **移动端**：下拉列表使用 `position: absolute` + `bottom: 100%`，在移动端输入区域弹出键盘时也能正常显示。
