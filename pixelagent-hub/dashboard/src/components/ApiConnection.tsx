import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog';
import { connectRecordsApi, disconnectRecordsApi, getRecordsApiBaseUrl, hasRecordsCredential } from '../lib/recordsApi';

export default function ApiConnection() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const configured = hasRecordsCredential();

  function changeOpen(next: boolean) {
    if (busy) return;
    setKey('');
    setError('');
    setOpen(next);
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await connectRecordsApi(key);
      setKey('');
      window.location.reload();
    } catch {
      setError('连接失败：请检查 API Key、服务地址和网络。浏览器需允许会话存储。');
      setBusy(false);
    }
  }

  function disconnect() {
    try {
      disconnectRecordsApi();
      window.location.reload();
    } catch {
      setError('无法清除凭据：浏览器需允许会话存储。');
    }
  }

  return (
    <div className="flex justify-end bg-slate-950 px-4 py-2 text-xs text-slate-300">
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogTrigger className="rounded border border-slate-600 px-3 py-1 hover:border-cyan-400 focus-visible:outline-cyan-400">
          API 连接 · {configured ? '已配置凭据' : '未配置凭据'}
        </DialogTrigger>
        <DialogContent className="border-slate-600 bg-slate-950 text-slate-100">
          <DialogTitle>连接 Records API</DialogTitle>
          <DialogDescription className="text-slate-300">
            API Key 仅保存在当前标签页会话中。连接或清除凭据后页面刷新；此操作不取消服务端任务。
          </DialogDescription>
          <p className="break-all text-xs text-slate-400">服务地址：{getRecordsApiBaseUrl() || window.location.origin}（地址由部署配置指定）</p>
          <form onSubmit={connect} className="grid gap-3">
            <label htmlFor="records-api-key" className="text-sm">Records API Key</label>
            <input id="records-api-key" type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} disabled={busy} required maxLength={4096} className="rounded border border-slate-600 bg-slate-900 px-3 py-2" />
            <p className="text-xs text-slate-400">填写服务端 RECORDS_API_KEY，模型提供商密钥仍由服务端配置。未启用鉴权的本机服务无需填写。</p>
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            <button disabled={busy} type="submit" className="rounded bg-cyan-700 px-3 py-2 disabled:opacity-50">{busy ? '正在验证…' : '验证并连接'}</button>
            <button disabled={busy} type="button" onClick={disconnect} className="rounded border border-slate-600 px-3 py-2 disabled:opacity-50">清除凭据并刷新</button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
