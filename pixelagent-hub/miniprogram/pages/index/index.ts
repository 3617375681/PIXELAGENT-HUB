// PixelAgent Hub — Dashboard Page
// 仪表盘首页

import { healthCheck, listSessions, postRun, SessionMeta } from '../../utils/api';

interface AgentStatus {
  id: string;
  name: string;
  role: string;
  icon: string;
  color: string;
  status: 'idle' | 'working' | 'done' | 'error';
}

const AGENTS: AgentStatus[] = [
  { id: 'coordinator', name: 'Coordinator', role: 'Orchestrator', icon: '🎯', color: '#00ff88', status: 'idle' },
  { id: 'research_lead', name: 'Research Lead', role: 'Research', icon: '🔍', color: '#00d4ff', status: 'idle' },
  { id: 'api_explorer', name: 'API Explorer', role: 'API', icon: '🌐', color: '#a855f7', status: 'idle' },
  { id: 'market_analyst', name: 'Market Analyst', role: 'Analysis', icon: '📊', color: '#f59e0b', status: 'idle' },
  { id: 'design_lead', name: 'Design Lead', role: 'Design', icon: '🎨', color: '#ec4899', status: 'idle' },
  { id: 'tech_lead', name: 'Tech Lead', role: 'Engineering', icon: '⚙️', color: '#3b82f6', status: 'idle' },
  { id: 'qa_lead', name: 'QA Lead', role: 'Testing', icon: '🧪', color: '#22c55e', status: 'idle' },
  { id: 'security_auditor', name: 'Security Auditor', role: 'Security', icon: '🔒', color: '#ef4444', status: 'idle' },
];

const MODES = [
  { id: 'company', label: 'Company', desc: 'Full team collaboration', icon: '🏢' },
  { id: 'pipeline', label: 'Pipeline', desc: 'Sequential execution', icon: '🔗' },
  { id: 'parallel', label: 'Parallel', desc: 'Concurrent agents', icon: '⚡' },
  { id: 'debate', label: 'Debate', desc: 'Multi-perspective discussion', icon: '💬' },
  { id: 'vote', label: 'Vote', desc: 'Democratic decision', icon: '🗳️' },
  { id: 'roundtable', label: 'Roundtable', desc: 'Structured meeting', icon: '🪑' },
];

Page({
  data: {
    agents: AGENTS,
    modes: MODES,
    backendOk: false,
    running: false,
    activeMode: '',
    sessions: [] as SessionMeta[],
    sessionLoading: false,
    taskInput: '',
    showTaskInput: false,
    selectedMode: '',
  },

  onLoad() {
    this.checkBackend();
  },

  onShow() {
    this.checkBackend();
    this.loadSessions();
  },

  async checkBackend() {
    try {
      const res = await healthCheck();
      this.setData({ backendOk: res?.ok === true });
      if (res?.ok) {
        wx.showToast({ title: 'Backend connected', icon: 'success', duration: 1500 });
      }
    } catch {
      this.setData({ backendOk: false });
    }
  },

  async loadSessions() {
    this.setData({ sessionLoading: true });
    try {
      const sessions = await listSessions();
      this.setData({ sessions: Array.isArray(sessions) ? sessions : [] });
    } catch {
      // Backend may not be available
    } finally {
      this.setData({ sessionLoading: false });
    }
  },

  onSelectMode(e: any) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      showTaskInput: true,
      selectedMode: mode,
      taskInput: '',
    });
  },

  onTaskInput(e: any) {
    this.setData({ taskInput: e.detail.value });
  },

  async onSubmitTask() {
    const { taskInput, selectedMode } = this.data;
    if (!taskInput.trim() || !selectedMode) {
      wx.showToast({ title: 'Enter a task description', icon: 'none' });
      return;
    }

    const body: any = { task: taskInput.trim() };

    // Build team for company mode
    if (selectedMode === 'company') {
      body.team = AGENTS.map((a) => ({
        agentId: a.id,
        name: a.name,
        role: a.role,
        description: `${a.name} — ${a.role}`,
      }));
      body.leaderAgentId = 'coordinator';
    }

    this.setData({ running: true, activeMode: selectedMode });

    try {
      wx.showLoading({ title: 'Running agents...' });
      const result = await postRun(selectedMode, body, false);
      wx.hideLoading();

      if (result.ok) {
        wx.showToast({ title: 'Task complete!', icon: 'success' });
        if (result.sessionId) {
          wx.navigateTo({ url: `/pages/chat/chat?sessionId=${result.sessionId}` });
        }
      } else {
        wx.showToast({ title: 'Task failed', icon: 'error' });
      }
    } catch (e: any) {
      wx.hideLoading();
      wx.showToast({ title: e.message || 'Error', icon: 'error' });
    } finally {
      this.setData({ running: false, showTaskInput: false, activeMode: '' });
    }
  },

  onCancelTask() {
    this.setData({ showTaskInput: false, selectedMode: '', taskInput: '' });
  },

  onAgentTap(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.showToast({ title: `Agent: ${id}`, icon: 'none' });
  },

  onSessionTap(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/chat/chat?sessionId=${id}` });
  },

  onSettingsTap() {
    wx.showActionSheet({
      itemList: ['Set API URL', 'Set API Key', 'Refresh'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.onSetApiUrl();
        } else if (res.tapIndex === 1) {
          this.onSetApiKey();
        } else if (res.tapIndex === 2) {
          this.checkBackend();
          this.loadSessions();
        }
      },
    });
  },

  onSetApiUrl() {
    const app = getApp<{ globalData: { baseUrl: string }; setBaseUrl(url: string): void }>();
    // @ts-ignore — globalData access
    wx.showModal({
      title: 'API URL',
      editable: true,
      placeholderText: 'http://localhost:3100',
      content: app?.globalData?.baseUrl || 'http://localhost:3100',
      success: (res: any) => {
        if (res.confirm && res.content) {
          app.setBaseUrl(res.content.trim());
          wx.showToast({ title: 'URL saved', icon: 'success' });
          this.checkBackend();
        }
      },
    });
  },

  onSetApiKey() {
    const app = getApp<{ globalData: { apiKey: string }; setApiKey(key: string): void }>();
    // @ts-ignore — globalData access
    wx.showModal({
      title: 'API Key',
      editable: true,
      placeholderText: 'Enter API key',
      content: app?.globalData?.apiKey || '',
      success: (res: any) => {
        if (res.confirm && res.content) {
          app.setApiKey(res.content.trim());
          wx.showToast({ title: 'Key saved', icon: 'success' });
        }
      },
    });
  },
});
