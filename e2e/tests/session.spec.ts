import { test, expect } from '@playwright/test';
import { ChatRoomPage } from '../helpers/page-objects';

test.describe('Session Management', () => {
  let chatRoomPage: ChatRoomPage;

  test.beforeEach(async ({ page }) => {
    chatRoomPage = new ChatRoomPage(page);
    await chatRoomPage.goto();
  });

  test('should persist session in localStorage after login', async ({ page }) => {
    const username = `sess_user_${Date.now()}`;
    const channel = `sess_chan_${Date.now()}`;
    const password = 'testpassword123';

    await chatRoomPage.login(username, channel, password);
    await expect(chatRoomPage.messageInput).toBeVisible({ timeout: 5000 });

    // Verify that the app stored an encrypted session in localStorage
    const session = await page.evaluate(() =>
      localStorage.getItem('terminal_chatroom_session')
    );
    expect(session).toBeTruthy();
  });

  test('should show chat interface after login (lock screen baseline)', async ({ page }) => {
    const username = `lock_user_${Date.now()}`;
    const channel = `lock_chan_${Date.now()}`;
    const password = 'testpassword123';

    await chatRoomPage.login(username, channel, password);

    // Verify the chat interface is visible (message input / chat area)
    await expect(chatRoomPage.messageInput).toBeVisible({ timeout: 5000 });
    await expect(chatRoomPage.logoutButton).toBeVisible();
  });

  test('should restore session from localStorage', async ({ page, context }) => {
    const username = `restore_user_${Date.now()}`;
    const channel = `restore_chan_${Date.now()}`;
    const password = 'testpassword123';

    // Login on the first page to create a session in localStorage
    await chatRoomPage.login(username, channel, password);
    await expect(chatRoomPage.messageInput).toBeVisible({ timeout: 5000 });

    // Confirm localStorage has the session
    const session = await page.evaluate(() =>
      localStorage.getItem('terminal_chatroom_session')
    );
    expect(session).toBeTruthy();

    // Open a NEW page in the SAME context (shares localStorage)
    // Do NOT logout on the first page — that would clear localStorage
    const page2 = await context.newPage();
    await page2.goto('/');

    // The app should detect the stored session and show the restore modal
    const restoreTitle = page2.locator('h2[class*="modalTitle"]');
    await expect(restoreTitle).toBeVisible({ timeout: 5000 });
    await expect(restoreTitle).toContainText('恢复上次的会话');

    await page2.close();
  });

  test('should logout and clear session', async ({ page }) => {
    const username = `logout_user_${Date.now()}`;
    const channel = `logout_chan_${Date.now()}`;
    const password = 'testpassword123';

    // Login
    await chatRoomPage.login(username, channel, password);
    await expect(chatRoomPage.messageInput).toBeVisible({ timeout: 5000 });

    // Verify localStorage has session
    const sessionBefore = await page.evaluate(() =>
      localStorage.getItem('terminal_chatroom_session')
    );
    expect(sessionBefore).toBeTruthy();

    // Logout
    await chatRoomPage.logout();

    // Verify login form is visible again
    await expect(chatRoomPage.usernameInput).toBeVisible({ timeout: 5000 });

    // Verify localStorage session is cleared
    const sessionAfter = await page.evaluate(() =>
      localStorage.getItem('terminal_chatroom_session')
    );
    expect(sessionAfter).toBeNull();
  });
});
