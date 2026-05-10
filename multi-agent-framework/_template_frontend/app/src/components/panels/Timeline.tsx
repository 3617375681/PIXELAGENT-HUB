import React from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Clock } from 'lucide-react';

interface TimelineEvent {
  time: number;
  agentId: string;
  agentName: string;
  agentColor: string;
  event: string;
  type: 'start' | 'think' | 'output' | 'error' | 'complete';
}

interface TimelineProps {
  events: TimelineEvent[];
  currentTime: number;
  totalDuration: number;
  onSeek: (time: number) => void;
  onPlayPause: () => void;
  isPlaying: boolean;
}

export const Timeline: React.FC<TimelineProps> = ({
  events,
  currentTime,
  totalDuration,
  onSeek,
  onPlayPause,
  isPlaying,
}) => {
  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <button onClick={onPlayPause} className="pixel-btn-secondary p-1.5">
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <div className="flex items-center gap-1 text-white/40">
          <Clock size={10} />
          <span className="pixel-font text-[8px]">{formatTime(currentTime)} / {formatTime(totalDuration)}</span>
        </div>
      </div>

      {/* Progress Bar with Events */}
      <div className="relative">
        <div
          className="h-3 bg-black/40 border border-white/10 cursor-pointer relative"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const pct = x / rect.width;
            onSeek(pct * totalDuration);
          }}
        >
          {/* Background track */}
          <div className="absolute inset-y-0 left-0 bg-green-500/20" style={{ width: `${progress}%` }} />

          {/* Event markers */}
          {events.map((evt, i) => {
            const pct = totalDuration > 0 ? (evt.time / totalDuration) * 100 : 0;
            return (
              <motion.div
                key={i}
                className="absolute top-0 bottom-0 w-0.5"
                style={{
                  left: `${pct}%`,
                  backgroundColor: evt.agentColor,
                }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: i * 0.05 }}
                title={`${evt.agentName}: ${evt.event}`}
              />
            );
          })}

          {/* Current position */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-white"
            style={{ left: `${progress}%`, transform: 'translateX(-50%)' }}
          />
        </div>

        {/* Event labels */}
        <div className="flex justify-between mt-1">
          {events.filter((_, i) => i % 3 === 0).map((evt, i) => (
            <span key={i} className="pixel-font text-[6px] opacity-30">
              {evt.agentName}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
