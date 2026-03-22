import WebSocket from 'ws';

export interface WSMessage {
  type: string;
  [key: string]: any;
}

export class TestWebSocket {
  private ws: WebSocket | null = null;
  private messageHandlers: ((data: WSMessage) => void)[] = [];

  async connect(url: string = 'ws://localhost:3000/ws'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
      this.ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        this.messageHandlers.forEach((h) => h(parsed));
      });
    });
  }

  send(msg: WSMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }

  waitForMessage(expectedType: string, trigger?: () => void, timeout: number = 5000): Promise<WSMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
        reject(new Error(`Timeout waiting for ${expectedType}`));
      }, timeout);
      const handler = (data: WSMessage) => {
        if (data.type === expectedType) {
          clearTimeout(timer);
          this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
          resolve(data);
        }
      };
      this.messageHandlers.push(handler);
      if (trigger) trigger();
    });
  }

  async join(channel: string, username: string, password: string): Promise<WSMessage> {
    return this.waitForMessage('system', () => {
      this.send({ type: 'join', channel, username, password });
    });
  }

  onMessage(handler: (data: WSMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  close(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'leave' });
    }
    this.ws?.close();
    this.messageHandlers = [];
  }
}
