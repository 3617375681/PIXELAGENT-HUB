import { useState } from 'react';
import { KeyRound } from 'lucide-react';
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
      setError('Connection failed. Check the API key, server address and network. Session storage must be allowed.');
      setBusy(false);
    }
  }

  function disconnect() {
    try {
      disconnectRecordsApi();
      window.location.reload();
    } catch {
      setError('Could not clear the key: session storage must be allowed.');
    }
  }

  // Rendered inside the Studio header; the dialog is portaled, so it uses the global pixel classes.
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger className="pixel-btn-secondary pixel-font flex items-center gap-1.5 px-2 py-1.5 text-[8px]" title={configured ? 'API key set' : 'No API key set'}>
        <KeyRound size={12} />
        <span className="studio-api-label">API</span>
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5" style={{ backgroundColor: configured ? '#22c55e' : '#6b7280' }} />
        <span className="sr-only">{configured ? 'API key set' : 'No API key set'}</span>
      </DialogTrigger>
      <DialogContent className="pixel-card rounded-none border-2 bg-[#1a1a25] text-[hsl(var(--foreground))] pixel-font-body text-lg">
        <DialogTitle className="pixel-font text-[11px] leading-relaxed text-[#22c55e]">RECORDS API</DialogTitle>
        <DialogDescription className="pixel-font-body text-base text-white/60">
          The key stays in this tab's session only. Connecting or clearing reloads the page; running jobs are not cancelled.
        </DialogDescription>
        <p className="break-all text-base text-white/40">Server: {getRecordsApiBaseUrl() || window.location.origin}</p>
        <form onSubmit={connect} className="grid gap-3">
          <label htmlFor="records-api-key">Records API Key</label>
          <input id="records-api-key" type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} disabled={busy} required maxLength={4096} className="border-2 border-[hsl(var(--border))] bg-[#0d0d16] px-3 py-2 focus:border-[#22c55e] focus:outline-none" />
          <p className="text-base text-white/40">Use the server's RECORDS_API_KEY. Model keys stay on the server. Local servers without auth need no key.</p>
          {error && <p role="alert" className="text-[#fca5a5]">{error}</p>}
          <button disabled={busy} type="submit" className="pixel-btn pixel-font px-3 py-2.5 text-[9px] disabled:opacity-50">{busy ? 'VERIFYING…' : 'CONNECT'}</button>
          <button disabled={busy} type="button" onClick={disconnect} className="pixel-btn-secondary px-3 py-2 disabled:opacity-50">Clear key and reload</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
