Component({
  properties: {
    msg: {
      type: Object,
      value: {
        id: '',
        role: 'assistant',
        content: '',
        type: 'output',
        time: '',
        attachments: [],
        streaming: false,
      },
    },
  },

  methods: {
    onRetry() {
      this.triggerEvent('retry');
    },

    onPreviewImage(e: any) {
      const url = e.currentTarget.dataset.url;
      wx.previewImage({
        urls: [url],
        current: url,
      });
    },
  },
});
