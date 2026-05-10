export type SendMessageInput = {
  target: string;
  text: string;
};

export interface MessageProvider {
  readonly name: string;
  send(input: SendMessageInput): Promise<{ messageId: string }>;
}

/** Mock message provider — returns fake message IDs. */
export class MockMessageProvider implements MessageProvider {
  name = 'mock';
  async send(_input: SendMessageInput): Promise<{ messageId: string }> {
    return { messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
}

/** Slack incoming webhook provider. Requires SLACK_WEBHOOK_URL env var. */
export class SlackWebhookProvider implements MessageProvider {
  name = 'slack';
  private webhookUrl: string;

  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL || '';
    if (!this.webhookUrl) {
      throw new Error('SLACK_WEBHOOK_URL not set');
    }
  }

  async send(input: SendMessageInput): Promise<{ messageId: string }> {
    const resp = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input.text, channel: input.target }),
    });

    if (!resp.ok) {
      throw new Error(`Slack webhook error (${resp.status}): ${await resp.text().catch(() => '')}`);
    }

    return { messageId: `slack-${Date.now()}` };
  }
}

/** Discord webhook provider. Requires DISCORD_WEBHOOK_URL env var. */
export class DiscordWebhookProvider implements MessageProvider {
  name = 'discord';
  private webhookUrl: string;

  constructor() {
    this.webhookUrl = process.env.DISCORD_WEBHOOK_URL || '';
    if (!this.webhookUrl) {
      throw new Error('DISCORD_WEBHOOK_URL not set');
    }
  }

  async send(input: SendMessageInput): Promise<{ messageId: string }> {
    const resp = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: input.text }),
    });

    if (!resp.ok) {
      throw new Error(`Discord webhook error (${resp.status}): ${await resp.text().catch(() => '')}`);
    }

    return { messageId: `discord-${Date.now()}` };
  }
}

/** Creates the appropriate message provider based on environment config. */
export function createMessageProvider(): MessageProvider {
  const provider = (process.env.MESSAGE_PROVIDER || '').toLowerCase();
  if (provider === 'slack') return new SlackWebhookProvider();
  if (provider === 'discord') return new DiscordWebhookProvider();
  if (process.env.SLACK_WEBHOOK_URL) return new SlackWebhookProvider();
  if (process.env.DISCORD_WEBHOOK_URL) return new DiscordWebhookProvider();
  return new MockMessageProvider();
}

/** @deprecated Use MockMessageProvider or createMessageProvider() instead. */
export const mockSendMessage = (input: SendMessageInput) =>
  new MockMessageProvider().send(input);
