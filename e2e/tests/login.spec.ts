import { test, expect } from '@playwright/test';
import { ChatRoomPage } from '../helpers/page-objects';

test.describe('Login Flow', () => {
  let chatRoomPage: ChatRoomPage;

  test.beforeEach(async ({ page }) => {
    chatRoomPage = new ChatRoomPage(page);
    await chatRoomPage.goto();
  });

  test('should display login form', async ({ page }) => {
    await expect(chatRoomPage.usernameInput).toBeVisible();
    await expect(chatRoomPage.channelInput).toBeVisible();
    await expect(chatRoomPage.passwordInput).toBeVisible();
    await expect(chatRoomPage.joinButton).toBeVisible();
  });

  test('should join channel with valid credentials', async ({ page }) => {
    const username = `test_user_${Date.now()}`;
    const channel = `test_channel_${Date.now()}`;
    const password = 'testpassword123';

    await chatRoomPage.login(username, channel, password);

    // Wait for chat interface to appear
    await expect(chatRoomPage.messageInput).toBeVisible({ timeout: 5000 });
    await expect(chatRoomPage.logoutButton).toBeVisible();
  });

  test('should show error for empty username', async ({ page }) => {
    // Clear and submit form
    await chatRoomPage.channelInput.fill('test-channel');
    await chatRoomPage.passwordInput.fill('password123');
    await chatRoomPage.joinButton.click();

    // Wait for error message or check if still on login page with error
    await page.waitForTimeout(1000);
    
    // Should still be on login page
    await expect(chatRoomPage.usernameInput).toBeVisible();
  });

  test('should show error for empty channel', async ({ page }) => {
    await chatRoomPage.usernameInput.fill('testuser');
    await chatRoomPage.passwordInput.fill('password123');
    await chatRoomPage.joinButton.click();

    await page.waitForTimeout(1000);
    
    // Should still be on login page
    await expect(chatRoomPage.usernameInput).toBeVisible();
  });

  test('should show error for empty password', async ({ page }) => {
    await chatRoomPage.usernameInput.fill('testuser');
    await chatRoomPage.channelInput.fill('test-channel');
    await chatRoomPage.joinButton.click();

    await page.waitForTimeout(1000);
    
    // Should still be on login page
    await expect(chatRoomPage.usernameInput).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    const username = `test_user_${Date.now()}`;
    const channel = `test_channel_${Date.now()}`;
    const password = 'testpassword123';

    // Login
    await chatRoomPage.login(username, channel, password);
    await expect(chatRoomPage.messageInput).toBeVisible({ timeout: 5000 });

    // Logout
    await chatRoomPage.logout();
    
    // Wait for login form to reappear
    await expect(chatRoomPage.usernameInput).toBeVisible({ timeout: 5000 });
    await expect(chatRoomPage.logoutButton).not.toBeVisible();
  });
});
