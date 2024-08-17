import { Children, ReactNode } from "react";

const CustomUl = ({ children, ...props }: { children: ReactNode }) => {
  const cleanChildren = Children.map(children, (child) =>
    typeof child === "string" ? child.replace(/\n/g, "") : child
  );

  return (
    <ul
      style={{
        listStyleType: "square",
        // padding: "0 10px",
      }}
      {...props}
    >
      {cleanChildren}
    </ul>
  );
};

export default CustomUl;
