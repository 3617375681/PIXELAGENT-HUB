import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface ParticleEffectProps {
  color: string;
  isActive: boolean;
  type?: 'thinking' | 'error' | 'done';
  density?: number;
}

export const ParticleEffect: React.FC<ParticleEffectProps> = ({
  color,
  isActive,
  density = 2,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const createParticle = (): Particle => {
      const side = Math.floor(Math.random() * 4);
      let x, y, vx, vy;
      const speed = 0.5 + Math.random() * 1.5;

      switch (side) {
        case 0: // top
          x = Math.random() * canvas.width;
          y = 0;
          vx = (Math.random() - 0.5) * speed;
          vy = speed;
          break;
        case 1: // right
          x = canvas.width;
          y = Math.random() * canvas.height;
          vx = -speed;
          vy = (Math.random() - 0.5) * speed;
          break;
        case 2: // bottom
          x = Math.random() * canvas.width;
          y = canvas.height;
          vx = (Math.random() - 0.5) * speed;
          vy = -speed;
          break;
        default: // left
          x = 0;
          y = Math.random() * canvas.height;
          vx = speed;
          vy = (Math.random() - 0.5) * speed;
          break;
      }

      return {
        x, y, vx, vy,
        life: 0,
        maxLife: 60 + Math.random() * 60,
        color,
        size: 2 + Math.random() * 3,
      };
    };

    const animate = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (isActive) {
        // Spawn new particles
        for (let i = 0; i < density; i++) {
          if (Math.random() < 0.3) {
            particlesRef.current.push(createParticle());
          }
        }
      }

      // Update and draw particles
      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        const alpha = 1 - p.life / p.maxLife;
        if (alpha <= 0) return false;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);

        // Pixel glow
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillRect(Math.floor(p.x) - 1, Math.floor(p.y) - 1, p.size + 2, p.size + 2);

        return true;
      });

      ctx.globalAlpha = 1;
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, color, density]);

  // Resize handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isActive) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 2 }}
    />
  );
};

// Simpler CSS-based particle burst for status changes
export const StatusBurst: React.FC<{ color: string; trigger: number }> = ({ color, trigger }) => {
  const [particles, setParticles] = React.useState<Array<{ id: number; angle: number; distance: number; delay: number }>>([]);

  useEffect(() => {
    if (trigger === 0) return;
    const newParticles = Array.from({ length: 12 }, (_, i) => ({
      id: Date.now() + i,
      angle: (i / 12) * Math.PI * 2,
      distance: 20 + Math.random() * 30,
      delay: Math.random() * 0.2,
    }));
    setParticles(newParticles);
    const timer = setTimeout(() => setParticles([]), 800);
    return () => clearTimeout(timer);
  }, [trigger]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible" style={{ zIndex: 3 }}>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute left-1/2 top-1/2 w-1.5 h-1.5"
          style={{
            backgroundColor: color,
            animation: `particle-burst 0.6s ease-out ${p.delay}s forwards`,
            '--angle': `${p.angle}rad`,
            '--distance': `${p.distance}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
};
