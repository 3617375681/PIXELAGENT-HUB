import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { LIVE_MODELS } from '../lib/live/llm';
import { forgetLiveCredentials, liveCredentials, saveLiveCredentials } from '../lib/live/key';
import { soundEngine } from '../lib/soundEngine';

const KEY_PAGE = 'https://platform.deepseek.com/api_keys';

/** Asks for the visitor's own DeepSeek key before a PLAY LIVE run. */
export default function LiveKeyDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const saved = liveCredentials();
  const [key, setKey] = useState(saved?.key || '');
  const [model, setModel] = useState(saved?.model || LIVE_MODELS[0].id);
  const [remember, setRemember] = useState(false);
  const valid = /^\S{20,200}$/.test(key.trim());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="studio-live-dialog">
        <DialogTitle className="pixel-font">PLAY LIVE</DialogTitle>
        <DialogDescription>
          Build your own idea right here. The four agents run in this browser tab and call DeepSeek with <b>your</b> key. Nothing goes through a PixelAgent server.
        </DialogDescription>
        <form onSubmit={(event) => { event.preventDefault(); if (!valid) return; saveLiveCredentials(key.trim(), model, remember); soundEngine.success(); onSaved(); }}>
          <label className="pixel-font" htmlFor="live-key">DEEPSEEK API KEY</label>
          <input id="live-key" type="password" autoComplete="off" spellCheck={false} placeholder="sk-…" value={key} onChange={(event) => setKey(event.target.value)} />
          <label className="pixel-font" htmlFor="live-model">MODEL</label>
          <select id="live-model" value={model} onChange={(event) => setModel(event.target.value)}>
            {LIVE_MODELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <label className="studio-live-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Remember on this device</label>
          <ul>
            <li>Sent only to <code>api.deepseek.com</code>, never to this site or any other server.</li>
            <li>Stored in this tab only{remember ? ', and kept on this device until you forget it' : ''}.</li>
            <li>A run makes 3–6 model calls, typically 20k–40k tokens. Use a key with a low spending limit.</li>
            <li>No key yet? <a href={KEY_PAGE} target="_blank" rel="noreferrer">Create one at platform.deepseek.com ↗</a></li>
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
