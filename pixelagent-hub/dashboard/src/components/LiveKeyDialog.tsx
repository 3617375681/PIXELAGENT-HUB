import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { customEndpoint, DEFAULT_CUSTOM_BASE_URL, LIVE_PROVIDERS, liveProvider } from '../lib/live/llm';
import { forgetLiveCredentials, liveCredentials, saveLiveCredentials } from '../lib/live/key';
import { soundEngine } from '../lib/soundEngine';

/** Asks for the visitor's own model key (or local server) before a PLAY LIVE run. */
export default function LiveKeyDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const saved = liveCredentials();
  const [providerId, setProviderId] = useState(saved?.provider || LIVE_PROVIDERS[0].id);
  const [key, setKey] = useState(saved?.key || '');
  const [model, setModel] = useState(saved?.model || LIVE_PROVIDERS[0].models[0]);
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl || DEFAULT_CUSTOM_BASE_URL);
  const [remember, setRemember] = useState(false);
  const provider = liveProvider(providerId);
  let endpoint = provider.endpoint;
  let urlError = '';
  if (provider.custom) {
    try { endpoint = customEndpoint(baseUrl); } catch (error) { urlError = error instanceof Error ? error.message : String(error); }
  }
  const host = endpoint ? new URL(endpoint).host : '';
  // A local server may need no key; hosted providers always do.
  const trimmedKey = key.trim();
  const keyOk = provider.custom ? !/\s/.test(trimmedKey) && trimmedKey.length <= 300 : /^\S{20,300}$/.test(trimmedKey);
  const valid = keyOk && !urlError && /^\S{1,120}$/.test(model.trim());
  const pick = (id: string) => {
    const next = liveProvider(id);
    setProviderId(next.id);
    setModel(next.models[0]);
    if (saved?.provider !== next.id) setKey('');
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="studio-live-dialog">
        <DialogTitle className="pixel-font">PLAY LIVE</DialogTitle>
        <DialogDescription>
          Build your own idea right here. The four agents run in this browser tab and call the model with <b>your</b> key. Nothing goes through a PixelAgent server.
        </DialogDescription>
        <form onSubmit={(event) => { event.preventDefault(); if (!valid) return; saveLiveCredentials({ provider: provider.id, key: trimmedKey, model: model.trim(), ...(provider.custom ? { baseUrl: baseUrl.trim() } : {}) }, remember); soundEngine.success(); onSaved(); }}>
          <label className="pixel-font" htmlFor="live-provider">PROVIDER</label>
          <select id="live-provider" value={provider.id} onChange={(event) => pick(event.target.value)}>
            {LIVE_PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          {provider.custom && <>
            <label className="pixel-font" htmlFor="live-base-url">SERVER URL</label>
            <input id="live-base-url" autoComplete="off" spellCheck={false} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} aria-invalid={!!urlError} />
            {urlError && <p className="studio-live-error" role="alert">{urlError}</p>}
          </>}
          <label className="pixel-font" htmlFor="live-key">{provider.custom ? 'API KEY (OPTIONAL)' : 'API KEY'}</label>
          <input id="live-key" type="password" autoComplete="off" spellCheck={false} placeholder={provider.custom ? 'Leave empty for a local server' : `${provider.label} key`} value={key} onChange={(event) => setKey(event.target.value)} />
          <label className="pixel-font" htmlFor="live-model">MODEL</label>
          <input id="live-model" list="live-models" autoComplete="off" spellCheck={false} value={model} onChange={(event) => setModel(event.target.value)} />
          <datalist id="live-models">{provider.models.map((item) => <option key={item} value={item} />)}</datalist>
          <label className="studio-live-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Remember on this device</label>
          <ul>
            <li>Sent only to <code>{host || 'the server you enter'}</code>, never to this site or any other server.</li>
            {provider.custom && <li>The server must allow this page&apos;s origin (CORS). Ollama: start it with <code>OLLAMA_ORIGINS=*</code>. LM Studio: turn on CORS in its server settings.</li>}
            <li>Stored in this tab only{remember ? ', and kept on this device until you forget it' : ''}.</li>
            <li>A run makes 3–6 model calls, typically 20k–40k tokens.{provider.custom ? '' : ' Use a key with a low spending limit.'}</li>
            <li>{provider.custom ? 'Setup help: ' : 'No key yet? '}<a href={provider.keyPage} target="_blank" rel="noreferrer">{provider.custom ? 'running PLAY LIVE on a local model ↗' : `Get one from ${provider.label} ↗`}</a></li>
          </ul>
          <div className="studio-live-actions">
            {saved && <button type="button" className="pixel-font" onClick={() => { forgetLiveCredentials(); setKey(''); soundEngine.click(); }}>FORGET KEY</button>}
            <button type="submit" className="pixel-font studio-create" disabled={!valid}>SAVE &amp; BUILD</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
