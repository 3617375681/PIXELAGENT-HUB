import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function CodeHighlight({ language, value }: { language: string; value: string }) {
  return (
    <SyntaxHighlighter
      language={language || 'text'}
      style={vscDarkPlus}
      customStyle={{ margin: 0, fontSize: '12px', borderRadius: 4, padding: '8px 12px' }}
      codeTagProps={{ style: { fontSize: '12px', fontFamily: 'ui-monospace, monospace' } }}
    >
      {value}
    </SyntaxHighlighter>
  );
}
