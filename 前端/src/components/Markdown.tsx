import { useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import 'highlight.js/styles/github-dark.css';

/** 代码块（语言标签 + 复制按钮） */
function CodeBlock({ language, code }: { language?: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/60 bg-muted/40">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span className="font-mono">{language ?? 'text'}</span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 transition hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 text-xs leading-5">
        <code className={language ? `hljs language-${language}` : 'hljs'}>{code}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  // 剥掉 react-markdown 默认的 <pre> 外壳，改由 CodeBlock 自绘
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const match = /language-(\w+)/.exec(className || '');
    const text = String(children).replace(/\n$/, '');
    const block = !!match || text.includes('\n');
    if (block) {
      return <CodeBlock language={match?.[1]} code={text} />;
    }
    return (
      <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs text-foreground/90">
        {children}
      </code>
    );
  },
};

/** 消息 Markdown 渲染（GFM + 代码高亮 + 复制） */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
