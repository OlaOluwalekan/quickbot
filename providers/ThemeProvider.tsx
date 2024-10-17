"use client";

import {
  toggleChatMenuOpen,
  toggleProfileDialogOpen,
  toggleThemeOpen,
} from "@/features/generalSlice";
import { RootState } from "@/store";
import { ReactNode, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { theme } = useSelector((store: RootState) => store.general);
  const dispatch = useDispatch();

  // this is used to close open dialogs whenever a user clicks the document/page
  const handleDocumentClick = (e: MouseEvent) => {
    let targetElement = e.target as HTMLElement;

    // checks if the clicked element has a class of a-modal and closes all modal if id does not
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
    dispatch(toggleChatMenuOpen(false));
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
