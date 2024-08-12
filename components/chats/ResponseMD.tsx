"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { dark, darcula } from "react-syntax-highlighter/dist/esm/styles/prism";
import { FaCopy, FaMoon } from "react-icons/fa6";

interface CodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const ResponseMD = ({ response }: { response: string }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }: CodeProps) {
          let match: any = /language-(\w+)/.exec(className || "");

          const isBlock = className
            ? true
            : String(children).includes("\n")
            ? true
            : false;
          const language = match ? match[1] : "javascript";
          //   console.log("LANG:", codeText, isBlock);

          return isBlock ? (
            <div className="mockup-code text-sm bg-primary text-primary-content">
              <section className="flex justify-between px-3">
                <span className="block">{language}</span>
                <article className="flex gap-4 items-center">
                  <button className="text-lg hover:text-base-200">
                    <FaMoon />
                  </button>
                  <button className="text-lg hover:text-base-200">
                    <FaCopy />
                  </button>
                </article>
              </section>
              <SyntaxHighlighter
                {...props}
                PreTag="div"
                language={language}
                // style={darcula}
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            </div>
          ) : (
            <code
              {...props}
              className="rounded"
              style={{ borderRadius: "5px" }}
            >
              {children}
            </code>
          );
        },
      }}
    >
      {response}
    </ReactMarkdown>
  );
};

export default ResponseMD;
