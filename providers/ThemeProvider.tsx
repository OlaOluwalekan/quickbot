"use client";

import { toggleThemeOpen } from "@/features/generalSlice";
import { RootState } from "@/store";
import { ReactNode, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { theme } = useSelector((store: RootState) => store.general);
  const dispatch = useDispatch();

  const handleDocumentClick = (e: MouseEvent) => {
    // console.log(e.target.className);
    let targetElement = e.target as HTMLElement;

    while (targetElement) {
      if (
        targetElement.classList &&
        targetElement.classList.contains("a-modal")
      ) {
        return;
      }
      targetElement = targetElement.parentNode as HTMLElement;
    }

    dispatch(toggleThemeOpen(false));
  };

  useEffect(() => {
    document.addEventListener("click", handleDocumentClick);

    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return <>{children}</>;
};

export default ThemeProvider;
