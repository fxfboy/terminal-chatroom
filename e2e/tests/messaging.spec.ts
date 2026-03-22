import { test, expect } from '@playwright/test';
import { ChatRoomPage } from '../helpers/page-objects';

test.describe('Messaging Flow', () => {
  let chatRoomPage: ChatRoomPage;

  test.beforeEach(async ({ page }) => {
    chatRoomPage = new ChatRoomPage(page);
    await chatRoomPage.goto();

    // Login
    const username = `test_user_${Date.now()}`;
    const channel = `test_channel_${Date.now()}`;
    const password = 'testpassword123';
    await chatRoomPage.login(username, channel, password);
    
    // Wait for chat interface
    await expect(chatRoomPage.messageInput).toBeVisible({ timeout: 5000 });
  });

  test('should display chat interface', async ({ page }) => {
    await expect(chatRoomPage.messageInput).toBeVisible();
    await expect(chatRoomPage.sendButton).toBeVisible();
    await expect(chatRoomPage.logoutButton).toBeVisible();
  });

  test('should send a message', async ({ page }) => {
    const testMessage = `Hello from E2E test! ${Date.now()}`;
    
    // Wait for WebSocket to connect
    await page.waitForTimeout(2000);
    
    await chatRoomPage.sendMessage(testMessage);
    
    // Wait for message to appear in the DOM
    await page.waitForSelector(`text=${testMessage}`, { timeout: 5000 });
    
    // Verify message count increased
    const messageCount = await chatRoomPage.getMessageCount();
    expect(messageCount).toBeGreaterThan(0);
  });

  test('should send multiple messages', async ({ page }) => {
    const messages = [
      `First message ${Date.now()}`,
      `Second message ${Date.now()}`,
      `Third message ${Date.now()}`
    ];
    
    // Wait for WebSocket to connect
    await page.waitForTimeout(2000);
    
    for (const msg of messages) {
      await chatRoomPage.sendMessage(msg);
      await page.waitForSelector(`text=${msg}`, { timeout: 5000 });
      // Delay between messages for WebSocket processing
      await page.waitForTimeout(800);
    }
    
    // Extra time for all messages to render
    await page.waitForTimeout(500);
    
    const messageCount = await chatRoomPage.getMessageCount();
    expect(messageCount).toBeGreaterThanOrEqual(messages.length);
  });

  test('should handle empty message', async ({ page }) => {
    // Wait for system messages to settle
    await page.waitForTimeout(2000);

    const initialCount = await chatRoomPage.getMessageCount();

    // Try to send empty message
    await chatRoomPage.messageInput.fill('');
    await chatRoomPage.sendButton.click();

    // Wait a bit
    await page.waitForTimeout(1000);

    // Message count should not increase
    const finalCount = await chatRoomPage.getMessageCount();
    expect(finalCount).toBe(initialCount);
  });

  test('should display online users section', async ({ page }) => {
    // Check if online users title exists
    const onlineUsersTitle = page.getByText('在线用户');
    await expect(onlineUsersTitle).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    await chatRoomPage.logout();
    
    // Wait for login form to reappear
    await expect(chatRoomPage.usernameInput).toBeVisible({ timeout: 5000 });
    await expect(chatRoomPage.logoutButton).not.toBeVisible();
  });
});
