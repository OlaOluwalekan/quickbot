import { ReactNode } from "react";

const InlineCode = ({
  children,
  props,
}: {
  children: ReactNode;
  props: any;
}) => {
  return (
    <code {...props} className="rounded bg-surface-3 font-mono px-1 py-0.5">
      {children}
    </code>
  );
};

export default InlineCode;
