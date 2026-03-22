import { Page, Locator } from '@playwright/test';

/**
 * Page Object for Terminal Chatroom (single page app)
 */
export class ChatRoomPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly channelInput: Locator;
  readonly passwordInput: Locator;
  readonly joinButton: Locator;
  readonly errorMessage: Locator;
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly messageList: Locator;
  readonly logoutButton: Locator;
  readonly onlineUsersList: Locator;
  readonly restoreModal: Locator;
  readonly newSessionButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // Login form - use exact placeholder text (unique per input, works with CSS Modules)
    this.usernameInput = page.locator('input[placeholder="请输入你的用户名"]');
    this.channelInput = page.locator('input[placeholder="输入频道名称，不存在则创建"]');
    this.passwordInput = page.locator('input[placeholder="输入频道密码"]');
    this.joinButton = page.getByRole('button', { name: /加入频道/ });
    this.errorMessage = page.locator('[class*="error"]');

    // Chat interface
    this.messageInput = page.locator('textarea[placeholder*="输入消息"]');
    this.sendButton = page.locator('button[class*="sendBtn"]');
    this.messageList = page.locator('[class*="chatMessages"]');
    this.logoutButton = page.getByRole('button', { name: /登出/ });
    this.onlineUsersList = page.locator('[class*="onlineUsersList"]');

    // Restore session modal
    this.restoreModal = page.locator('[class*="modal"]');
    this.newSessionButton = page.getByRole('button', { name: /新建会话/ });
  }

  async goto() {
    await this.page.goto('/');
  }

  async login(username: string, channel: string, password: string) {
    await this.usernameInput.fill(username);
    await this.channelInput.fill(channel);
    await this.passwordInput.fill(password);
    await this.joinButton.click();
  }

  async skipRestoreSession() {
    // Click "新建会话" to skip restoring previous session
    await this.newSessionButton.click();
  }

  async getErrorMessage(): Promise<string | null> {
    const error = await this.errorMessage.textContent();
    return error?.trim() || null;
  }

  async sendMessage(message: string) {
    await this.messageInput.fill(message);
    await this.sendButton.click();
  }

  async getMessageCount(): Promise<number> {
    const messages = this.messageList.locator('[class*="message"]');
    return await messages.count();
  }

  async getLastMessage(): Promise<string | null> {
    const messages = this.messageList.locator('[class*="message"]');
    const lastMessage = messages.last();
    return await lastMessage.textContent();
  }

  async waitForMessage(content: string, timeout: number = 5000): Promise<void> {
    await this.page.waitForSelector(`[class*="message"]:has-text("${content}")`, {
      timeout,
    });
  }

  async logout() {
    await this.logoutButton.click();
  }

  async isLoggedIn(): Promise<boolean> {
    // Check if logout button is visible (means logged in)
    return await this.logoutButton.isVisible();
  }
}
