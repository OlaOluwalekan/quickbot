import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  darcula,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy, Moon, Sun } from "lucide-react";
import clsx from "clsx";
import { ReactNode, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store";
import { setCodeTheme } from "@/features/generalSlice";

const CustomCode = ({
  language,
  children,
  props,
}: {
  language: string;
  children: ReactNode;
  props: any;
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const { codeTheme } = useSelector((store: RootState) => store.general);
  const dispatch = useDispatch();

  const toggleCodeTheme = () => {
    dispatch(setCodeTheme(codeTheme === "light" ? "dark" : "light"));
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 2500);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-border bg-surface-2 text-fg text-xs sm:text-sm shadow-sm">
      <div className="flex justify-between items-center px-3.5 py-2 bg-surface-3 border-b border-border">
        <span className="font-mono text-xs font-semibold text-accent lowercase">
          {language}
        </span>
        <div className="flex gap-3 items-center">
          <button
            type="button"
            className="text-sm text-muted hover:text-fg transition-colors cursor-pointer"
            onClick={toggleCodeTheme}
            title="Toggle code theme"
          >
            {codeTheme === "light" ? (
              <Moon className="h-3.5 w-3.5" strokeWidth={1.5} />
            ) : (
              <Sun className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
          <button
            type="button"
            className={clsx(
              "text-sm transition-colors cursor-pointer",
              isCopied ? "text-success" : "text-muted hover:text-fg"
            )}
            onClick={() => handleCopyCode(String(children))}
            title="Copy code"
          >
            {isCopied ? (
              <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
            ) : (
              <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          {...props}
          PreTag="div"
          language={language}
          style={codeTheme === "light" ? oneLight : darcula}
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: "0.85rem",
          }}
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

export default CustomCode;
