import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DataPacketAnimation } from './effects/DataPacket';
import { ScreenFlash } from './ScreenFlash';
import { TypewriterText } from './effects/TypewriterText';
import { soundEngine } from '../lib/soundEngine';
import StudioStageCard from './StudioStageCard';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { STAGE_ORDER, describeEvent, type PipelineView, type StageId } from '../lib/studioPipeline';
import type { StudioEvent } from '../types/studio';

type Box = { left: number; top: number; right: number; bottom: number };
type Packet = { id: string; from: { x: number; y: number }; to: { x: number; y: number }; color: string; icon: string };
const time = (at: string) => new Date(at).toLocaleTimeString([], { hour12: false });

/**
 * The original console's node graph, reduced to the real Studio team and driven only by server events:
 * a stage lights up when its event arrives, a packet flies when work is handed on, and a failed build
 * or browser check draws a red edge back to the Coder carrying the actual error text.
 */
export default function StudioPipeline({ view, events, live }: { view: PipelineView; events: StudioEvent[]; live: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const cards = useRef<Partial<Record<StageId, HTMLLIElement | null>>>({});
  const [boxes, setBoxes] = useState<Partial<Record<StageId, Box>>>({});
  const [packets, setPackets] = useState<Packet[]>([]);
  const [flash, setFlash] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const previous = useRef<PipelineView | null>(null);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const origin = element.getBoundingClientRect();
      setBoxes(Object.fromEntries(STAGE_ORDER.flatMap((id) => {
        const rect = cards.current[id]?.getBoundingClientRect();
        return rect ? [[id, { left: rect.left - origin.left, top: rect.top - origin.top, right: rect.right - origin.left, bottom: rect.bottom - origin.top }]] : [];
      })));
    };
    measure();
    // Cards resize without the container changing (e.g. the margin reserved for the feedback arc), so watch both.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const card of Object.values(cards.current)) if (card) observer.observe(card);
    return () => observer.disconnect();
  }, []);

  const vertical = (boxes.coder && boxes.manager) ? boxes.coder.top > boxes.manager.bottom - 1 : false;
  const anchor = (id: StageId, side: 'in' | 'out' | 'below') => {
    const box = boxes[id];
    if (!box) return null;
    if (side === 'below') return vertical ? { x: box.right, y: (box.top + box.bottom) / 2 } : { x: (box.left + box.right) / 2, y: box.bottom };
    if (vertical) return { x: (box.left + box.right) / 2, y: side === 'out' ? box.bottom : box.top };
    return { x: side === 'out' ? box.right : box.left, y: (box.top + box.bottom) / 2 };
  };

  // 8-bit cues from the original console, one per real transition (never for the initial load).
  const heard = useRef<PipelineView | null>(null);
  useEffect(() => {
    const before = heard.current;
    heard.current = view;
    if (!before) return;
    view.stages.forEach((stage, index) => {
      const was = before.stages[index].state;
      if (stage.state === was) return;
      if (stage.state === 'active') soundEngine.statusChange('thinking');
      else if (stage.state === 'failed') soundEngine.error();
      else if (stage.state === 'done') soundEngine.message();
    });
    if (view.terminal === 'ready_for_review' && before.terminal !== 'ready_for_review') soundEngine.success();
  }, [view]);

  // Hand-offs become packets; only transitions seen live animate, never the initial load.
  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (!before || reducedMotion) return;
    const added: Packet[] = [];
    view.stages.forEach((stage, index) => {
      if (stage.state !== 'active' || before.stages[index].state === 'active' || index === 0) return;
      const source = stage.id === 'coder' && before.feedback ? before.feedback.from : STAGE_ORDER[index - 1];
      const from = anchor(source, source === STAGE_ORDER[index - 1] ? 'out' : 'below');
      const to = anchor(stage.id, source === STAGE_ORDER[index - 1] ? 'in' : 'below');
      const sourceStage = view.stages.find((item) => item.id === source)!;
      if (from && to) added.push({ id: `${stage.id}-${Date.now()}`, from, to, color: source === STAGE_ORDER[index - 1] ? sourceStage.color : '#ef4444', icon: sourceStage.icon });
    });
    if (added.length) { setPackets((current) => [...current.slice(-6), ...added]); soundEngine.packetSend(); }
    if (view.terminal === 'ready_for_review' && before.terminal !== 'ready_for_review') setFlash((value) => value + 1);
    // anchor() reads the latest measured boxes; re-running on box changes would replay packets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, reducedMotion]);

  const edges = STAGE_ORDER.slice(0, -1).map((id, index) => {
    const target = STAGE_ORDER[index + 1];
    const from = anchor(id, 'out');
    const to = anchor(target, 'in');
    const source = view.stages[index];
    const next = view.stages[index + 1];
    const flowing = (source.state === 'done' || source.state === 'skipped') && next.state === 'active';
    const done = source.state === 'done' && (next.state === 'done' || next.state === 'failed');
    return { id: `${id}-${target}`, from, to, color: source.color, flowing, done };
  });
  const feedbackFrom = view.feedback ? anchor(view.feedback.from, 'below') : null;
  const feedbackTo = view.feedback ? anchor('coder', 'below') : null;
  const bend = 64;
  const feedbackPath = feedbackFrom && feedbackTo && (vertical
    ? `M ${feedbackFrom.x} ${feedbackFrom.y} C ${feedbackFrom.x + bend} ${feedbackFrom.y}, ${feedbackTo.x + bend} ${feedbackTo.y}, ${feedbackTo.x} ${feedbackTo.y}`
    : `M ${feedbackFrom.x} ${feedbackFrom.y} C ${feedbackFrom.x} ${feedbackFrom.y + bend}, ${feedbackTo.x} ${feedbackTo.y + bend}, ${feedbackTo.x} ${feedbackTo.y}`);
  const curve = (from: { x: number; y: number }, to: { x: number; y: number }) => vertical
    ? `M ${from.x} ${from.y} C ${from.x} ${from.y + 16}, ${to.x} ${to.y - 16}, ${to.x} ${to.y}`
    : `M ${from.x} ${from.y} C ${from.x + 24} ${from.y}, ${to.x - 24} ${to.y}, ${to.x} ${to.y}`;
  const running = live && !view.terminal;

  return (
    <section className="studio-pipeline" aria-label="The squad at work">
      <div className="studio-pipeline-head pixel-font">
        <span>THE SQUAD</span>
        {view.round > 0 && <span>ROUND {view.round}</span>}
        {running && <span className="studio-live">● LIVE</span>}
        {view.derived && <span className="studio-derived" title="This project predates event logs; the timeline is rebuilt from its saved record and only start/finish times are real">REBUILT</span>}
      </div>
      <div ref={container} className={`studio-pipeline-graph ${view.feedback ? 'has-feedback' : ''}`}>
        <svg className="studio-pipeline-edges" aria-hidden="true">
          <defs>
            <filter id="studio-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            <marker id="studio-arrow-red" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="#ef4444" /></marker>
          </defs>
          {edges.map((edge) => edge.from && edge.to && (
            <g key={edge.id}>
              <path d={curve(edge.from, edge.to)} fill="none" stroke={edge.color} strokeWidth={edge.flowing || edge.done ? 2.5 : 1.5} opacity={edge.flowing || edge.done ? 0.9 : 0.3} filter={edge.flowing ? 'url(#studio-glow)' : undefined} />
              {edge.flowing && !reducedMotion && <circle r={3} fill={edge.color}><animateMotion dur="1.4s" repeatCount="indefinite" path={curve(edge.from, edge.to)} /></circle>}
            </g>
          ))}
          {feedbackPath && <path className={reducedMotion ? '' : 'studio-feedback-path'} d={feedbackPath} fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="6 5" markerEnd="url(#studio-arrow-red)" filter="url(#studio-glow)" />}
        </svg>
        <DataPacketAnimation packets={packets} onComplete={(id) => setPackets((current) => current.filter((packet) => packet.id !== id))} />
        <ol className="studio-team">
          {view.stages.map((stage) => (
            <StudioStageCard key={stage.id} ref={(element) => { cards.current[stage.id] = element; }} stage={stage} badge={view.round > 1 && (stage.id === 'coder' || stage.id === 'builder') ? `R${view.round}` : undefined} />
          ))}
        </ol>
      </div>
      {view.feedback && (
        <p className="studio-feedback" role="status">
          <span className="pixel-font">↩ {view.feedback.from === 'builder' ? 'BUILDER' : 'TESTER'} → CODER</span>
          {view.feedback.from === 'builder' ? `Build failed${view.feedback.round ? ` in round ${view.feedback.round}` : ''}. The error goes back to the Coder:` : 'A browser check failed. Back to the Coder:'}
          <code>{view.feedback.message}</code>
        </p>
      )}
      {events.length > 0 && (
        <div className="studio-event-log">
          <span className="pixel-font">LOG · {events.length} EVENTS</span>
          <ol aria-live="polite">
            {events.slice(-6).map((event, index, shown) => <li key={event.seq} className={`event-${event.type}`}><time dateTime={event.at}>{time(event.at)}</time>{index === shown.length - 1 && running && !reducedMotion ? <TypewriterText text={describeEvent(event)} speed={18} /> : describeEvent(event)}</li>)}
          </ol>
        </div>
      )}
      <ScreenFlash color="#22c55e" trigger={flash} />
    </section>
  );
}
