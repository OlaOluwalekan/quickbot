"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect } from "react";
import CustomCode from "./CustomCode";
import InlineCode from "./InlineCode";
import CustomOl from "./CustomOl";
import { convertToHTML } from "@/utils/matkdown";
import CustomUl from "./CustomUl";
import CustomLi from "./CustomLi";
import CustomLink from "./CustomLink";

interface CodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const ResponseMD = ({ response }: { response: string }) => {
  useEffect(() => {
    convertToHTML(response);
  }, []);

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
          const language = match ? match[1] : "shell";

          return isBlock ? (
            <CustomCode language={language} children={children} props={props} />
          ) : (
            <InlineCode children={children} props={props} />
          );
        },
        ul({ children, ...props }) {
          return <CustomUl children={children} {...props} />;
        },
        ol({ children, ...props }) {
          return <CustomOl children={children} {...props} />;
        },
        li({ children, ...props }) {
          return <CustomLi children={children} {...props} />;
        },
        p({ children, ...props }) {
          return (
            <p {...props} className="mb-0">
              {children}
            </p>
          );
        },
        a({ href, children, ...props }) {
          return (
            <CustomLink href={href as string} children={children} {...props} />
          );
        },
      }}
    >
      {response}
    </ReactMarkdown>
  );
};

export default ResponseMD;
