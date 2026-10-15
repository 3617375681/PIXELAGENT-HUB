import type React from 'react';
import { PixelAvatar } from './PixelAvatar';
import type { StudioStage } from '../lib/studioStages';

// Same status palette and labels as AgentCard, so Studio reads as part of the original console.
const statusColors = { idle: '#6b7280', thinking: '#f59e0b', done: '#22c55e', error: '#ef4444', skipped: '#6b7280' };
const statusLabels = { idle: 'IDLE', thinking: 'THINKING', done: 'DONE', error: 'ERROR', skipped: 'SKIP' };

const stageStatus = (state: StudioStage['state']) =>
  state === 'active' ? 'thinking' : state === 'done' ? 'done' : state === 'failed' ? 'error' : state === 'skipped' ? 'skipped' : 'idle';

export default function StudioStageCard({ stage }: { stage: StudioStage }) {
  const status = stageStatus(stage.state);
  const statusColor = statusColors[status];
  const progress = status === 'done' || status === 'error' ? 100 : 0;
  return (
    <li
      className={`studio-stage pixel-card agent-bloom ${status === 'thinking' ? 'active glow-border' : ''}`}
      style={{
        borderColor: status === 'idle' || status === 'skipped' ? undefined : status === 'thinking' ? stage.color : statusColor + '80',
        background: status === 'thinking' ? stage.color + '12' : undefined,
        '--agent-color': stage.color,
      } as React.CSSProperties}
    >
      <div className="studio-stage-head">
        <PixelAvatar icon={stage.icon} color={stage.color} size={36} isAnimating={status === 'thinking'} />
        <div className="studio-stage-text">
          <div className="studio-stage-title">
            <h3 className="pixel-font" style={{ color: stage.color }}>{stage.name}</h3>
            <span className={`pixel-font studio-stage-badge ${status === 'thinking' ? 'cursor-blink' : ''}`} style={{ color: statusColor, borderColor: statusColor, backgroundColor: statusColor + '30' }}>{statusLabels[status]}</span>
          </div>
          <p>{stage.detail}</p>
          <p className="studio-stage-label">{stage.label}</p>
        </div>
      </div>
      <div className="studio-stage-progress" aria-hidden="true">
        <span style={{ width: `${progress}%`, backgroundColor: status === 'error' ? statusColors.error : stage.color }} />
        {status === 'thinking' && <i style={{ background: `linear-gradient(90deg, transparent, ${stage.color}99, transparent)` }} />}
      </div>
    </li>
  );
}
