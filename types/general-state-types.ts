import { ChatProps, ResponseProps } from './chats.interface'

export interface GeneralSliceInit {
  theme: 'light' | 'dark'
  themeIsOpen: boolean
  mobileNavIsOpen: boolean
  profileDialogIsOpen: boolean
  aiResponse: string
  loadingResponse: boolean
  codeTheme: 'dark' | 'light'
  currentPageTitle: string
  currentPageId: string | null
  chatMenuIsOpen: boolean
  chatMenuClass: string
  dialogData: ChatProps | null
  editPopUpIsOpen: boolean
  deletePopUpIsOpen: boolean
  chatInputHeight: string
  searchResultIsOpen: boolean
  searchPopupIsOpen: boolean
  currentChatId: string
  authUserId: string
  searchResult: (ChatProps | ResponseProps)[]
  searchText: string
}
