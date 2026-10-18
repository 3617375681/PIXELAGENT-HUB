import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PixelAvatar } from './PixelAvatar';
import { ParticleEffect, StatusBurst } from './effects/ParticleEffect';
import { TypewriterText } from './effects/TypewriterText';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import type { PipelineStage } from '../lib/studioPipeline';

// Same status palette, labels and effects as the original console's AgentCard.
const statusColors = { idle: '#6b7280', thinking: '#f59e0b', done: '#22c55e', error: '#ef4444', skipped: '#6b7280' };
const statusLabels = { idle: 'IDLE', thinking: 'THINKING', done: 'DONE', error: 'ERROR', skipped: 'SKIP' };

const stageStatus = (state: PipelineStage['state']) =>
  state === 'active' ? 'thinking' : state === 'done' ? 'done' : state === 'failed' ? 'error' : state === 'skipped' ? 'skipped' : 'idle';

export default function StudioStageCard({ stage, badge, ref }: { stage: PipelineStage; badge?: string; ref?: React.Ref<HTMLLIElement> }) {
  const status = stageStatus(stage.state);
  const statusColor = statusColors[status];
  const reducedMotion = usePrefersReducedMotion();
  const thinking = status === 'thinking';
  // A pixel burst marks the moment a stage finishes or fails (not the initial render).
  const [burst, setBurst] = useState(0);
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current !== status && (status === 'done' || status === 'error') && !reducedMotion) setBurst((value) => value + 1);
    previous.current = status;
  }, [status, reducedMotion]);

  return (
    <li
      ref={ref}
      className={`studio-stage pixel-card agent-bloom ${thinking ? 'active glow-border' : ''}`}
      style={{
        borderColor: status === 'idle' || status === 'skipped' ? undefined : thinking ? stage.color : statusColor + '80',
        background: thinking ? stage.color + '12' : undefined,
        '--agent-color': stage.color,
      } as React.CSSProperties}
    >
      {!reducedMotion && <ParticleEffect color={stage.color} isActive={thinking} density={2} />}
      <StatusBurst color={status === 'error' ? statusColors.error : stage.color} trigger={burst} />
      <div className="studio-stage-head">
        <PixelAvatar icon={stage.icon} color={stage.color} size={40} isAnimating={thinking} />
        <div className="studio-stage-text">
          <div className="studio-stage-title">
            <h3 className="pixel-font" style={{ color: stage.color }}>{stage.name}</h3>
            {badge && <span className="pixel-font studio-stage-round">{badge}</span>}
          </div>
          <motion.span
            className="pixel-font studio-stage-badge"
            style={{ color: statusColor, borderColor: statusColor, backgroundColor: statusColor + '30' }}
            animate={thinking && !reducedMotion ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
            transition={thinking ? { duration: 1, repeat: Infinity } : { duration: 0 }}
          >
            {statusLabels[status]}
          </motion.span>
        </div>
      </div>
      <p className="studio-stage-detail">{stage.detail}</p>
      <p className="studio-stage-label" style={{ color: thinking ? stage.color : undefined }}>
        {thinking && !reducedMotion ? <TypewriterText text={stage.label} speed={35} /> : stage.label}
      </p>
      <div className="studio-stage-progress" aria-hidden="true">
        <span style={{ width: `${status === 'done' || status === 'error' ? 100 : 0}%`, backgroundColor: status === 'error' ? statusColors.error : stage.color }} />
        {thinking && <i style={{ background: `linear-gradient(90deg, transparent, ${stage.color}99, transparent)` }} />}
      </div>
    </li>
  );
}
