import { ChatProps } from "./chats";

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
  chatMenuIsOpen: boolean;
  chatMenuClass: string;
  dialogData: ChatProps | null;
  editPopUpIsOpen: boolean;
  deletePopUpIsOpen: boolean;
  chatInputHeight: string;
}
