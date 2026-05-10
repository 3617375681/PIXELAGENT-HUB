import React from 'react';

interface PixelAvatarProps {
  icon: string;
  color: string;
  size?: number;
  isAnimating?: boolean;
}

export const PixelAvatar: React.FC<PixelAvatarProps> = ({ icon, color, size = 48, isAnimating = false }) => {
  return (
    <div
      className="relative flex items-center justify-center pixel-border-solid"
      style={{
        width: size,
        height: size,
        backgroundColor: color + '20',
        borderColor: color,
        imageRendering: 'pixelated',
      }}
    >
      <span className="text-xl" style={{ fontSize: size * 0.5 }}>{icon}</span>
      {isAnimating && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            backgroundColor: color + '30',
            border: `2px solid ${color}`,
          }}
        />
      )}
      {isAnimating && (
        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-yellow-400 pixel-border-solid" />
      )}
    </div>
  );
};
