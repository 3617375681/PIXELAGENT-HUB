// PixelAgent Hub — WeChat Mini Program
// 微信小程序入口

interface AppOptions {
  baseUrl: string;
  apiKey: string;
}

App<AppOptions>({
  globalData: {
    baseUrl: 'http://localhost:3100',
    apiKey: '',
  },

  onLaunch() {
    const saved = wx.getStorageSync<string>('api_base_url');
    if (saved) {
      this.globalData.baseUrl = saved;
    }
    const key = wx.getStorageSync<string>('api_key');
    if (key) {
      this.globalData.apiKey = key;
    }
    console.log('[PixelAgent] Mini Program launched, API:', this.globalData.baseUrl);
  },

  setBaseUrl(url: string) {
    this.globalData.baseUrl = url;
    wx.setStorageSync('api_base_url', url);
  },

  setApiKey(key: string) {
    this.globalData.apiKey = key;
    wx.setStorageSync('api_key', key);
  },
});
