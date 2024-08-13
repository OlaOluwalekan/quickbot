import { Children, ReactNode } from "react";

const CustomLi = ({ children, ...props }: { children: ReactNode }) => {
  const cleanChildren = Children.map(children, (child) =>
    typeof child === "string" ? child.replace(/\n/g, "") : child
  );

  return (
    <li {...props} className="py-0 my-0">
      {cleanChildren}
    </li>
  );
};

export default CustomLi;
