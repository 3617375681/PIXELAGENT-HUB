import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileJson, FileText, Copy, Check } from 'lucide-react';
import type { Agent, AgentOutput, Round, Workflow } from '../../types/agent';

interface ExportPanelProps {
  workflow: Workflow;
  isOpen: boolean;
  onClose: () => void;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ workflow, isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  const exportJSON = () => {
    const data = {
      workflow: workflow.name,
      exportedAt: new Date().toISOString(),
      totalRounds: workflow.rounds.length,
      rounds: workflow.rounds.map((r: Round) => ({
        round: r.roundNumber,
        status: r.status,
        messages: r.messages.map((m: AgentOutput) => ({
          agent: m.agentId,
          content: m.content,
          timestamp: new Date(m.timestamp).toISOString(),
          type: m.type,
        })),
        agentStatus: r.agents.map((a: Agent) => ({
          name: a.name,
          status: a.status,
          progress: a.progress,
        })),
      })),
    };
    return JSON.stringify(data, null, 2);
  };

  const exportMarkdown = () => {
    let md = `# ${workflow.name}\n\n`;
    md += `> ${workflow.description}\n\n`;
    md += `---\n\n`;

    workflow.rounds.forEach((round: Round) => {
      md += `## Round ${round.roundNumber}\n\n`;
      md += `**Status:** ${round.status.toUpperCase()}\n\n`;

      round.messages.forEach((msg: AgentOutput) => {
        const agent = round.agents.find((a: Agent) => a.id === msg.agentId);
        md += `### ${agent?.icon || '🤖'} ${agent?.name || msg.agentId}\n\n`;
        md += `\`[${msg.type.toUpperCase()}]\` ${msg.content}\n\n`;
      });

      md += `---\n\n`;
    });

    return md;
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const jsonContent = exportJSON();
  const mdContent = exportMarkdown();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 h-[70vh] bg-[#0d0d1a] border-t-2 border-green-500 z-50 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Download size={14} className="text-green-400" />
                <span className="pixel-font text-xs text-green-400">EXPORT REPORT</span>
              </div>
              <button onClick={onClose} className="pixel-font text-[10px] text-white/30 hover:text-white/60">
                [CLOSE]
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* JSON Export */}
              <div className="flex-1 flex flex-col border-r border-white/10">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black/20">
                  <div className="flex items-center gap-2">
                    <FileJson size={12} className="text-yellow-400" />
                    <span className="pixel-font text-[8px] text-yellow-400">JSON</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleCopy(jsonContent)}
                      className="pixel-btn-secondary p-1"
                    >
                      {copied ? <Check size={10} /> : <Copy size={10} />}
                    </button>
                    <button
                      onClick={() => downloadFile(jsonContent, `${workflow.name.replace(/\s+/g, '_')}.json`, 'application/json')}
                      className="pixel-btn p-1"
                    >
                      <Download size={10} />
                    </button>
                  </div>
                </div>
                <pre className="flex-1 overflow-auto pixel-scrollbar p-3 pixel-font-body text-xs text-green-400/80">
                  {jsonContent}
                </pre>
              </div>

              {/* Markdown Export */}
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black/20">
                  <div className="flex items-center gap-2">
                    <FileText size={12} className="text-blue-400" />
                    <span className="pixel-font text-[8px] text-blue-400">MARKDOWN</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleCopy(mdContent)}
                      className="pixel-btn-secondary p-1"
                    >
                      {copied ? <Check size={10} /> : <Copy size={10} />}
                    </button>
                    <button
                      onClick={() => downloadFile(mdContent, `${workflow.name.replace(/\s+/g, '_')}.md`, 'text/markdown')}
                      className="pixel-btn p-1"
                    >
                      <Download size={10} />
                    </button>
                  </div>
                </div>
                <pre className="flex-1 overflow-auto pixel-scrollbar p-3 pixel-font-body text-xs text-blue-400/80">
                  {mdContent}
                </pre>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
