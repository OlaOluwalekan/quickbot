"use client";

import {
  toggleProfileDialogOpen,
  toggleThemeOpen,
} from "@/features/generalSlice";
import { RootState } from "@/store";
import { ReactNode, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { theme } = useSelector((store: RootState) => store.general);
  const dispatch = useDispatch();

  const handleDocumentClick = (e: MouseEvent) => {
    // console.log(e.target);
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
    dispatch(toggleProfileDialogOpen(false));
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
