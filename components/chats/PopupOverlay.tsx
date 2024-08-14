"use client";

import { ReactNode } from "react";

const PopupOverlay = ({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) => {
  return (
    <div
      className="fixed top-0 left-0 w-screen h-screen bg-black/60 flex justify-center items-center z-20"
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export default PopupOverlay;
