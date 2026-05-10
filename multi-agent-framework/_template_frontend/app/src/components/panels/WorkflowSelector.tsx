import React from 'react';
import { motion } from 'framer-motion';
import type { Workflow } from '../../types/agent';
import { Layers, ChevronDown, FileCode, Globe, Database, BrainCircuit } from 'lucide-react';

interface WorkflowSelectorProps {
  workflows: Workflow[];
  currentId: string;
  onSelect: (id: string) => void;
}

export const WorkflowSelector: React.FC<WorkflowSelectorProps> = ({
  workflows,
  currentId,
  onSelect,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const current = workflows.find((w) => w.id === currentId);

  const getIcon = (name: string) => {
    if (name.includes('Weather')) return <FileCode size={12} />;
    if (name.includes('Scraper')) return <Globe size={12} />;
    if (name.includes('Data')) return <Database size={12} />;
    if (name.includes('Chat')) return <BrainCircuit size={12} />;
    return <Layers size={12} />;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="pixel-btn-secondary px-3 py-2 flex items-center gap-2 min-w-[200px]"
      >
        {current && getIcon(current.name)}
        <span className="pixel-font text-[8px] flex-1 text-left">{current?.name || 'Select Workflow'}</span>
        <ChevronDown size={10} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 right-0 mt-1 pixel-card z-50 bg-[#0d0d1a]"
          >
            {workflows.map((wf) => (
              <button
                key={wf.id}
                onClick={() => {
                  onSelect(wf.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-white/5 transition-colors ${
                  wf.id === currentId ? 'bg-white/10' : ''
                }`}
              >
                {getIcon(wf.name)}
                <div>
                  <div className="pixel-font text-[8px]">{wf.name}</div>
                  <div className="pixel-font-body text-[10px] opacity-40">{wf.description}</div>
                </div>
                <span className="pixel-font text-[7px] ml-auto opacity-30">{wf.rounds.length} ROUNDS</span>
              </button>
            ))}
          </motion.div>
        </>
      )}
    </div>
  );
};
