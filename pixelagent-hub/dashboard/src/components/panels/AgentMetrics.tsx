import React from 'react';
import { motion } from 'framer-motion';
import { Zap, Clock, Database, Cpu, Activity } from 'lucide-react';

interface MetricData {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  max?: number;
  current?: number;
}

interface AgentMetricsProps {
  metrics: MetricData[];
  isExpanded?: boolean;
}

export const AgentMetrics: React.FC<AgentMetricsProps> = ({ metrics, isExpanded = true }) => {
  if (!isExpanded) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <Zap size={10} className="text-yellow-400" />
        <div className="flex-1 h-1 bg-black/30 overflow-hidden">
          <motion.div
            className="h-full bg-yellow-400"
            animate={{ width: ['0%', '100%'] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {metrics.map((metric, i) => (
        <motion.div
          key={metric.label}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className="flex items-center gap-2"
        >
          <div style={{ color: metric.color }}>{metric.icon}</div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-0.5">
              <span className="pixel-font text-[7px] opacity-60">{metric.label}</span>
              <span className="pixel-font text-[7px]" style={{ color: metric.color }}>
                {metric.value}
              </span>
            </div>
            {metric.max !== undefined && metric.current !== undefined && (
              <div className="h-1 bg-black/30 overflow-hidden">
                <motion.div
                  className="h-full"
                  style={{ backgroundColor: metric.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(metric.current / metric.max) * 100}%` }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                />
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export const defaultMetrics = (agentId: string): MetricData[] => {
  const metricsMap: Record<string, MetricData[]> = {
    coordinator: [
      { label: 'TASKS MANAGED', value: '4/4', icon: <Activity size={10} />, color: '#00d4ff', max: 4, current: 4 },
      { label: 'AGENTS ACTIVE', value: '5', icon: <Cpu size={10} />, color: '#00d4ff', max: 5, current: 5 },
      { label: 'LATENCY', value: '45ms', icon: <Clock size={10} />, color: '#00d4ff' },
    ],
    researcher: [
      { label: 'API CALLS', value: '12', icon: <Database size={10} />, color: '#a855f7', max: 20, current: 12 },
      { label: 'SOURCES CHECKED', value: '8', icon: <Activity size={10} />, color: '#a855f7', max: 10, current: 8 },
      { label: 'DATA SIZE', value: '2.4MB', icon: <Zap size={10} />, color: '#a855f7' },
    ],
    coder: [
      { label: 'LINES WRITTEN', value: '847', icon: <Zap size={10} />, color: '#22c55e', max: 1000, current: 847 },
      { label: 'FILES CREATED', value: '6', icon: <Database size={10} />, color: '#22c55e', max: 10, current: 6 },
      { label: 'COMPILE TIME', value: '1.2s', icon: <Clock size={10} />, color: '#22c55e' },
    ],
    reviewer: [
      { label: 'ISSUES FOUND', value: '2', icon: <Activity size={10} />, color: '#f59e0b', max: 10, current: 2 },
      { label: 'LINES REVIEWED', value: '847', icon: <Zap size={10} />, color: '#f59e0b', max: 1000, current: 847 },
      { label: 'QUALITY SCORE', value: '9.2', icon: <Cpu size={10} />, color: '#f59e0b', max: 10, current: 9.2 },
    ],
    writer: [
      { label: 'WORDS WRITTEN', value: '1,240', icon: <Zap size={10} />, color: '#ec4899', max: 2000, current: 1240 },
      { label: 'SECTIONS', value: '5', icon: <Database size={10} />, color: '#ec4899', max: 8, current: 5 },
      { label: 'READ TIME', value: '4min', icon: <Clock size={10} />, color: '#ec4899' },
    ],
  };
  return metricsMap[agentId] || [];
};
