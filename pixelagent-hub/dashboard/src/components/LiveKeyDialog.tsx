import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { LIVE_PROVIDERS, liveProvider } from '../lib/live/llm';
import { forgetLiveCredentials, liveCredentials, saveLiveCredentials } from '../lib/live/key';
import { soundEngine } from '../lib/soundEngine';

/** Asks for the visitor's own model key before a PLAY LIVE run. */
export default function LiveKeyDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const saved = liveCredentials();
  const [providerId, setProviderId] = useState(saved?.provider || LIVE_PROVIDERS[0].id);
  const [key, setKey] = useState(saved?.key || '');
  const [model, setModel] = useState(saved?.model || LIVE_PROVIDERS[0].models[0]);
  const [remember, setRemember] = useState(false);
  const provider = liveProvider(providerId);
  const host = new URL(provider.endpoint).host;
  const valid = /^\S{20,300}$/.test(key.trim()) && /^\S{1,120}$/.test(model.trim());
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
        <form onSubmit={(event) => { event.preventDefault(); if (!valid) return; saveLiveCredentials({ provider: provider.id, key: key.trim(), model: model.trim() }, remember); soundEngine.success(); onSaved(); }}>
          <label className="pixel-font" htmlFor="live-provider">PROVIDER</label>
          <select id="live-provider" value={provider.id} onChange={(event) => pick(event.target.value)}>
            {LIVE_PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <label className="pixel-font" htmlFor="live-key">API KEY</label>
          <input id="live-key" type="password" autoComplete="off" spellCheck={false} placeholder={`${provider.label} key`} value={key} onChange={(event) => setKey(event.target.value)} />
          <label className="pixel-font" htmlFor="live-model">MODEL</label>
          <input id="live-model" list="live-models" autoComplete="off" spellCheck={false} value={model} onChange={(event) => setModel(event.target.value)} />
          <datalist id="live-models">{provider.models.map((item) => <option key={item} value={item} />)}</datalist>
          <label className="studio-live-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Remember on this device</label>
          <ul>
            <li>Sent only to <code>{host}</code>, never to this site or any other server.</li>
            <li>Stored in this tab only{remember ? ', and kept on this device until you forget it' : ''}.</li>
            <li>A run makes 3–6 model calls, typically 20k–40k tokens. Use a key with a low spending limit.</li>
            <li>No key yet? <a href={provider.keyPage} target="_blank" rel="noreferrer">Get one from {provider.label} ↗</a></li>
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
