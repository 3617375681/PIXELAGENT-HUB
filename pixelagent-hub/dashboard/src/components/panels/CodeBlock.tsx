import React from 'react';
// @ts-expect-error — package has incomplete types for ESM subpath
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// @ts-expect-error — package has incomplete types for ESM subpath
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'typescript',
  filename,
  showLineNumbers = true,
}) => {
  const pixelStyle = {
    ...vscDarkPlus,
    'pre[class*="language-"]': {
      ...vscDarkPlus['pre[class*="language-"]'],
      background: '#0a0a12',
      border: '1px solid rgba(20, 255, 120, 0.2)',
      borderRadius: 0,
      fontFamily: "'VT323', monospace",
      fontSize: '13px',
      lineHeight: '1.4',
      margin: 0,
      padding: '12px',
    },
    'code[class*="language-"]': {
      ...vscDarkPlus['code[class*="language-"]'],
      fontFamily: "'VT323', monospace",
      fontSize: '13px',
      lineHeight: '1.4',
      background: 'transparent',
    },
  };

  return (
    <div className="pixel-card overflow-hidden">
      {filename && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border-b border-white/10">
          <div className="w-2 h-2 bg-green-400" />
          <span className="pixel-font text-[8px] text-green-400">{filename}</span>
          <span className="pixel-font text-[7px] text-white/20 ml-auto">{language.toUpperCase()}</span>
        </div>
      )}
      <SyntaxHighlighter
        language={language}
        style={pixelStyle}
        showLineNumbers={showLineNumbers}
        lineNumberStyle={{
          color: 'rgba(20, 255, 120, 0.3)',
          fontFamily: "'VT323', monospace",
          fontSize: '11px',
          minWidth: '2em',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};
