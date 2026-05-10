export interface FeishuProvider {
  readonly name: string;
  createTask(title: string, assignee: string): Promise<{ taskId: string }>;
  createCalendarEvent(subject: string): Promise<{ eventId: string }>;
  createBitableRecord(table: string): Promise<{ recordId: string }>;
}

/** Mock Feishu provider — returns fake IDs for development and testing. */
export class MockFeishuProvider implements FeishuProvider {
  name = 'mock';
  async createTask(title: string, assignee: string): Promise<{ taskId: string }> {
    return { taskId: `task-${Date.now()}-${assignee}-${title.length}` };
  }
  async createCalendarEvent(subject: string): Promise<{ eventId: string }> {
    return { eventId: `cal-${Date.now()}-${subject.length}` };
  }
  async createBitableRecord(table: string): Promise<{ recordId: string }> {
    return { recordId: `bitable-${Date.now()}-${table.length}` };
  }
}

/** Real Feishu/Lark API provider. Requires FEISHU_APP_ID and FEISHU_APP_SECRET env vars. */
export class RealFeishuProvider implements FeishuProvider {
  name = 'feishu';
  private appId: string;
  private appSecret: string;
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.appId = process.env.FEISHU_APP_ID || '';
    this.appSecret = process.env.FEISHU_APP_SECRET || '';
    this.baseUrl = process.env.FEISHU_BASE_URL || 'https://open.feishu.cn/open-apis';
    if (!this.appId || !this.appSecret) {
      throw new Error('FEISHU_APP_ID and FEISHU_APP_SECRET are required for real Feishu provider');
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }
    const resp = await fetch(`${this.baseUrl}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
    });

    if (!resp.ok) {
      throw new Error(`Feishu auth error (${resp.status}): ${await resp.text().catch(() => '')}`);
    }

    const data = await resp.json();
    this.accessToken = data.tenant_access_token;
    this.tokenExpiry = Date.now() + (data.expire - 300) * 1000; // 5 min buffer
    return this.accessToken!;
  }

  private async apiPost(path: string, body: Record<string, unknown>): Promise<any> {
    const token = await this.getAccessToken();
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      throw new Error(`Feishu API error (${resp.status}) ${path}: ${await resp.text().catch(() => '')}`);
    }

    return resp.json();
  }

  async createTask(title: string, assignee: string): Promise<{ taskId: string }> {
    const data = await this.apiPost('/task/v1/tasks', {
      summary: title,
      description: `Assigned to ${assignee}`,
    });
    return { taskId: data.data?.id || `feishu-task-${Date.now()}` };
  }

  async createCalendarEvent(subject: string): Promise<{ eventId: string }> {
    const data = await this.apiPost('/calendar/v4/calendars/primary/events', {
      summary: subject,
      start_time: { timestamp: String(Math.floor(Date.now() / 1000)) },
      end_time: { timestamp: String(Math.floor(Date.now() / 1000) + 3600) },
    });
    return { eventId: data.data?.event_id || `feishu-cal-${Date.now()}` };
  }

  async createBitableRecord(table: string): Promise<{ recordId: string }> {
    const appToken = process.env.FEISHU_BITABLE_APP_TOKEN || '';
    const tableId = process.env.FEISHU_BITABLE_TABLE_ID || '';
    if (!appToken || !tableId) {
      throw new Error('FEISHU_BITABLE_APP_TOKEN and FEISHU_BITABLE_TABLE_ID required for bitable operations');
    }
    const data = await this.apiPost(`/bitable/v1/apps/${appToken}/tables/${tableId}/records`, {
      fields: { table_name: table },
    });
    return { recordId: data.data?.record?.record_id || `feishu-bit-${Date.now()}` };
  }
}

/** Creates the appropriate Feishu provider based on environment config. */
export function createFeishuProvider(): FeishuProvider {
  if (process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET) {
    return new RealFeishuProvider();
  }
  return new MockFeishuProvider();
}

/** @deprecated Use MockFeishuProvider or createFeishuProvider() instead. */
export const mockCreateTask = (title: string, assignee: string) =>
  new MockFeishuProvider().createTask(title, assignee);

/** @deprecated Use MockFeishuProvider or createFeishuProvider() instead. */
export const mockCreateCalendarEvent = (subject: string) =>
  new MockFeishuProvider().createCalendarEvent(subject);

/** @deprecated Use MockFeishuProvider or createFeishuProvider() instead. */
export const mockCreateBitableRecord = (table: string) =>
  new MockFeishuProvider().createBitableRecord(table);
