"use client";

import ReactMarkdown from "react-markdown";
import remarkGemoji from "remark-gemoji";
import remarkGfm from "remark-gfm";

interface AssistantMarkdownProps {
  content: string;
}

export function AssistantMarkdown({ content }: AssistantMarkdownProps) {
  return (
    <div className="message-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkGemoji]}
        components={{
          a: (props) => (
            <a {...props} rel="noreferrer noopener" target="_blank" />
          ),
          pre: ({ children, ...props }) => (
            <div className="message-markdown__pre-wrap">
              <pre {...props}>{children}</pre>
            </div>
          ),
          table: ({ children, ...props }) => (
            <div className="message-markdown__table-wrap">
              <table {...props}>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
