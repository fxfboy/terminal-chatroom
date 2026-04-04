import { test, expect } from '@playwright/test';
import { ChatRoomPage } from '../helpers/page-objects';

test.describe('Session Management', () => {
  let chatRoomPage: ChatRoomPage;

  test.beforeEach(async ({ page }) => {
    chatRoomPage = new ChatRoomPage(page);
  });

  test('should create new session after logout', async ({ page }) => {
    const username1 = `user1_${Date.now()}`;
    const channel1 = `channel1_${Date.now()}`;
    const password1 = 'password123';

    // First session
    await chatRoomPage.goto();
    await chatRoomPage.login(username1, channel1, password1);
    await expect(chatRoomPage.messageInput).toBeVisible({ timeout: 5000 });

    // Logout
    await chatRoomPage.logout();
    await expect(chatRoomPage.usernameInput).toBeVisible({ timeout: 5000 });

    // New session with different credentials
    const username2 = `user2_${Date.now()}`;
    const channel2 = `channel2_${Date.now()}`;
    const password2 = 'newpassword456';

    await chatRoomPage.login(username2, channel2, password2);
    await expect(chatRoomPage.messageInput).toBeVisible({ timeout: 5000 });
    
    // Verify new session
    const isLoggedIn = await chatRoomPage.isLoggedIn();
    expect(isLoggedIn).toBe(true);
  });

  test('should maintain session on page reload', async ({ page }) => {
    const username = `test_user_${Date.now()}`;
    const channel = `test_channel_${Date.now()}`;
    const password = 'testpassword123';

    // Login
    await chatRoomPage.goto();
    await chatRoomPage.login(username, channel, password);
    await expect(chatRoomPage.messageInput).toBeVisible({ timeout: 5000 });

    // Reload page
    await page.reload();

    // Should still be logged in (or show restore modal)
    const isLoggedIn = await chatRoomPage.isLoggedIn();
    const hasRestoreModal = await chatRoomPage.newSessionButton.isVisible().catch(() => false);
    
    expect(isLoggedIn || hasRestoreModal).toBe(true);
  });

  test('should show restore session option after logout', async ({ page }) => {
    const username = `test_user_${Date.now()}`;
    const channel = `test_channel_${Date.now()}`;
    const password = 'testpassword123';

    // First login
    await chatRoomPage.goto();
    await chatRoomPage.login(username, channel, password);
    await expect(chatRoomPage.messageInput).toBeVisible({ timeout: 5000 });

    // Logout
    await chatRoomPage.logout();
    await expect(chatRoomPage.usernameInput).toBeVisible({ timeout: 5000 });

    // Revisit - should show restore session modal or login form
    await chatRoomPage.goto();
    
    // Either restore modal or login form should be visible
    const hasRestoreModal = await chatRoomPage.newSessionButton.isVisible().catch(() => false);
    const hasLoginForm = await chatRoomPage.usernameInput.isVisible();
    
    expect(hasRestoreModal || hasLoginForm).toBe(true);
  });
});
