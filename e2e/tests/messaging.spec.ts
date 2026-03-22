import { test, expect, BrowserContext, Page } from '@playwright/test';
import { ChatRoomPage } from '../helpers/page-objects';

// Force single worker for this file to avoid rate limiting
// (server limits to 5 joins per minute per IP)
test.describe.configure({ mode: 'serial' });

test.describe('Messaging', () => {
  const PASSWORD = 'test-password-123';
  const CHANNEL = `msg-test-${Date.now()}`;

  let context1: BrowserContext;
  let context2: BrowserContext;
  let page1: Page;
  let page2: Page;
  let chat1: ChatRoomPage;
  let chat2: ChatRoomPage;

  test.beforeAll(async ({ browser }) => {
    context1 = await browser.newContext();
    context2 = await browser.newContext();
    page1 = await context1.newPage();
    page2 = await context2.newPage();

    chat1 = new ChatRoomPage(page1);
    chat2 = new ChatRoomPage(page2);

    // Login User1
    await chat1.goto();
    await chat1.login('Alice', CHANNEL, PASSWORD);
    await expect(chat1.messageInput).toBeVisible({ timeout: 10000 });
    // Wait for WebSocket to connect and receive initial system messages
    await expect(page1.locator('[class*="chatMessages"]')).toContainText('已加入频道', { timeout: 10000 });

    // Login User2
    await chat2.goto();
    await chat2.login('Bob', CHANNEL, PASSWORD);
    await expect(chat2.messageInput).toBeVisible({ timeout: 10000 });
    // Wait for WebSocket to connect and receive initial system messages
    await expect(page2.locator('[class*="chatMessages"]')).toContainText('已加入频道', { timeout: 10000 });

    // Wait for both users to appear in User2's online list
    // (confirms WebSocket bidirectional communication is working)
    await expect(chat2.onlineUsersList).toContainText('Bob', { timeout: 15000 });
    await expect(chat2.onlineUsersList).toContainText('Alice', { timeout: 15000 });
  });

  test.afterAll(async () => {
    await context1?.close();
    await context2?.close();
  });

  test('should send and receive encrypted messages between users', async () => {
    // User1 sends a message
    const testMessage = `Hello from Alice ${Date.now()}`;
    await chat1.sendMessage(testMessage);

    // User2 should see the message (decrypted automatically since same password)
    await chat2.waitForMessage(testMessage, 15000);

    // Verify the message also appears in User1's own view (server broadcasts to all)
    await chat1.waitForMessage(testMessage, 15000);
  });

  test('should show correct sender for messages', async () => {
    // User1 sends a message
    const testMessage = `Sender test ${Date.now()}`;
    await chat1.sendMessage(testMessage);

    // Wait for message to appear on User2's view
    await chat2.waitForMessage(testMessage, 15000);

    // On User2's view, find the message and verify the sender name
    const messageWithContent = page2.locator('[class*="message"]').filter({ hasText: testMessage });
    const senderLabel = messageWithContent.locator('[class*="messageUser"]');
    await expect(senderLabel).toContainText('Alice');
  });

  test('should display user join/leave system messages', async () => {
    // The "Bob 加入了频道" system message should have been broadcast to Alice
    // when Bob joined the channel in beforeAll.
    // System messages render as: <div class="messageSystem"><span class="messageText">...</span></div>
    const joinMessage = page1.locator('[class*="messageSystem"]').filter({ hasText: 'Bob 加入了频道' }).first();
    await expect(joinMessage).toBeVisible({ timeout: 15000 });
  });

  test('should show online user count', async () => {
    // Verify that both usernames appear in the online users list on User1's page
    await expect(chat1.onlineUsersList).toContainText('Alice', { timeout: 15000 });
    await expect(chat1.onlineUsersList).toContainText('Bob', { timeout: 15000 });

    // Verify the same on User2's page
    await expect(chat2.onlineUsersList).toContainText('Alice', { timeout: 15000 });
    await expect(chat2.onlineUsersList).toContainText('Bob', { timeout: 15000 });
  });

  test('should handle code blocks in messages', async () => {
    // User1 sends a message containing a code block
    const codeContent = 'console.log("hello");';
    const codeMessage = '```\n' + codeContent + '\n```';
    await chat1.sendMessage(codeMessage);

    // Wait for the code block to render on User2's view
    // Use pre[class*="codeBlock"] to match the rendered <pre> element specifically
    // (avoids matching the codeBlockBtn button)
    const codeBlock = page2.locator('pre[class*="codeBlock"]');
    await expect(codeBlock.first()).toBeVisible({ timeout: 15000 });

    // Verify the code content is visible inside the code block
    await expect(codeBlock.first()).toContainText(codeContent);
  });
});
