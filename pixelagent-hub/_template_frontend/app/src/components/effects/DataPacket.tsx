import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DataPacket {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  label?: string;
  icon?: string;
}

interface DataPacketAnimationProps {
  packets: DataPacket[];
  onComplete?: (id: string) => void;
}

export const DataPacketAnimation: React.FC<DataPacketAnimationProps> = ({
  packets,
  onComplete,
}) => {
  const [activePackets, setActivePackets] = useState<string[]>([]);

  useEffect(() => {
    packets.forEach((packet, i) => {
      setTimeout(() => {
        setActivePackets((prev) => [...prev, packet.id]);
      }, i * 400);
    });
  }, [packets]);

  const handleComplete = (id: string) => {
    setActivePackets((prev) => prev.filter((p) => p !== id));
    onComplete?.(id);
  };

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
      <AnimatePresence>
        {packets.map((packet) => (
          activePackets.includes(packet.id) && (
            <g key={packet.id}>
              {/* Trail */}
              <motion.path
                d={`M${packet.from.x},${packet.from.y} L${packet.to.x},${packet.to.y}`}
                stroke={packet.color}
                strokeWidth={2}
                strokeDasharray="4,4"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.3 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
              {/* Packet */}
              <motion.g
                initial={{ x: packet.from.x, y: packet.from.y, opacity: 0, scale: 0 }}
                animate={{
                  x: packet.to.x,
                  y: packet.to.y,
                  opacity: [0, 1, 1, 0],
                  scale: [0.5, 1.2, 1, 0.5],
                }}
                transition={{ duration: 1.2, ease: 'easeInOut' }}
                onAnimationComplete={() => handleComplete(packet.id)}
              >
                <rect
                  x={-8}
                  y={-6}
                  width={16}
                  height={12}
                  fill={packet.color}
                  rx={1}
                />
                <rect
                  x={-6}
                  y={-4}
                  width={12}
                  height={8}
                  fill="rgba(0,0,0,0.3)"
                  rx={1}
                />
                {/* Mini icon inside */}
                <text
                  x={0}
                  y={2}
                  textAnchor="middle"
                  fontSize={8}
                  fill="white"
                >
                  {packet.icon || '⚡'}
                </text>
              </motion.g>
              {/* Glow effect at destination */}
              <motion.circle
                cx={packet.to.x}
                cy={packet.to.y}
                r={20}
                fill={packet.color}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: [0, 0.3, 0], scale: [0, 1.5, 2] }}
                transition={{ delay: 1.1, duration: 0.5 }}
              />
            </g>
          )
        ))}
      </AnimatePresence>
    </svg>
  );
};
