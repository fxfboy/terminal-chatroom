import { test, expect } from '@playwright/test';
import { ChatRoomPage } from '../helpers/page-objects';

test.describe('Login Flow', () => {
  let chatRoomPage: ChatRoomPage;

  test.beforeEach(async ({ page }) => {
    chatRoomPage = new ChatRoomPage(page);
    await chatRoomPage.goto();
  });

  test('should display login form with title', async ({ page }) => {
    // Verify the login title shows "TERMINAL CHATROOM"
    const loginTitle = page.locator('[class*="loginTitle"]');
    await expect(loginTitle).toBeVisible();
    await expect(loginTitle).toContainText('TERMINAL CHATROOM');

    // Verify form inputs are visible
    await expect(chatRoomPage.usernameInput).toBeVisible();
    await expect(chatRoomPage.channelInput).toBeVisible();
    await expect(chatRoomPage.passwordInput).toBeVisible();
    await expect(chatRoomPage.joinButton).toBeVisible();
  });

  test('should show validation errors for empty fields', async ({ page }) => {
    // Submit with all fields empty — should show username error
    await chatRoomPage.joinButton.click();
    await expect(chatRoomPage.errorMessage).toBeVisible();
    await expect(chatRoomPage.errorMessage).toContainText('请输入用户名');

    // Fill username only, submit — should show channel error
    await chatRoomPage.usernameInput.fill('testuser');
    await chatRoomPage.joinButton.click();
    await expect(chatRoomPage.errorMessage).toBeVisible();
    await expect(chatRoomPage.errorMessage).toContainText('请输入频道名称');

    // Fill username and channel, submit — should show password error
    await chatRoomPage.channelInput.fill('testchannel');
    await chatRoomPage.joinButton.click();
    await expect(chatRoomPage.errorMessage).toBeVisible();
    await expect(chatRoomPage.errorMessage).toContainText('请输入频道密码');
  });

  test('should successfully login and show channel in title', async ({ page }) => {
    const username = `test_user_${Date.now()}`;
    const channel = `test_channel_${Date.now()}`;
    const password = 'testpassword123';

    await chatRoomPage.login(username, channel, password);

    // Wait for chat interface to appear
    await expect(chatRoomPage.messageInput).toBeVisible({ timeout: 5000 });
    await expect(chatRoomPage.logoutButton).toBeVisible();

    // Verify the channel name appears in the terminal title
    const terminalTitle = page.locator('span[class*="terminalTitle"]');
    await expect(terminalTitle).toBeVisible();
    await expect(terminalTitle).toContainText(channel);
  });

  test('should show error for wrong password', async ({ page, browser }) => {
    const channel = `wrong_pw_channel_${Date.now()}`;
    const correctPassword = 'correctPassword123';
    const wrongPassword = 'wrongPassword456';

    // Step 1: Login User1 to create the channel (keep them connected so channel persists)
    await chatRoomPage.login('user1', channel, correctPassword);
    await expect(chatRoomPage.messageInput).toBeVisible({ timeout: 5000 });

    // Step 2: Open a fresh browser context for User2 (avoids shared localStorage)
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    const chatRoomPage2 = new ChatRoomPage(page2);
    await chatRoomPage2.goto();
    await chatRoomPage2.login('user2', channel, wrongPassword);

    // Step 3: Wait for the error message from the WebSocket (async)
    // The server sends back {type: 'error', text: '频道密码错误'},
    // then the frontend sets isLoggedIn=false and shows the error on the login page.
    await expect(chatRoomPage2.errorMessage).toBeVisible({ timeout: 10000 });
    const errorText = await chatRoomPage2.getErrorMessage();
    expect(errorText).toContain('密码');

    await page2.close();
    await context2.close();
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
