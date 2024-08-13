import { ReactNode } from "react";

const InlineCode = ({
  children,
  props,
}: {
  children: ReactNode;
  props: any;
}) => {
  return (
    <code {...props} className="rounded bg-base-200/50 px-1 py-0.5">
      {children}
    </code>
  );
};

export default InlineCode;
