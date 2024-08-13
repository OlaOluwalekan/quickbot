export interface GeneralSliceInit {
  theme: "cupcake" | "dracula" | "light" | "black";
  themeIsOpen: boolean;
  mobileNavIsOpen: boolean;
  profileDialogIsOpen: boolean;
  aiResponse: string;
  loadingResponse: boolean;
  codeTheme: "dark" | "light";
  currentPageTitle: string;
  currentPageId: string | null;
}
