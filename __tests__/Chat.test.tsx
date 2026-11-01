import Chat from "@/components/chats/Chat";
import generalReducer, { toggleMobileNavOpen } from "@/features/generalSlice";
import { GeneralSliceInit } from "@/types";
import { ChatProps } from "@/types/chats";
import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";

function createTestStore(overrides: Partial<GeneralSliceInit> = {}) {
  const preloadedGeneral: GeneralSliceInit = {
    theme: "light",
    themeIsOpen: false,
    mobileNavIsOpen: false,
    profileDialogIsOpen: false,
    aiResponse: "",
    loadingResponse: false,
    codeTheme: "light",
    currentPageTitle: "New Chat",
    currentPageId: "1",
    chatMenuIsOpen: false,
    chatMenuClass: "",
    dialogData: null,
    editPopUpIsOpen: false,
    deletePopUpIsOpen: false,
    chatInputHeight: "56px",
    searchResultIsOpen: false,
    streamingPrompt: "",
    streamingText: "",
    isStreaming: false,
    chatMode: "text",
    optimisticResponses: [],
    ...overrides,
  };

  const store = configureStore({
    reducer: { general: generalReducer },
    preloadedState: { general: preloadedGeneral },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  const dispatchSpy = jest.spyOn(store, "dispatch");
  return { store, dispatchSpy };
}

const mockChat: ChatProps = {
  id: "1",
  title: "Test Chat",
  createdBy: "yd772ijdh9298739",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Chat component", () => {
  it("renders the chat title", () => {
    const { store } = createTestStore();
    render(
      <Provider store={store}>
        <Chat chat={mockChat} />
      </Provider>
    );

    expect(screen.getByText("Test Chat")).toBeInTheDocument();
  });

  it("closes mobile nav when chat title is clicked", () => {
    const { store, dispatchSpy } = createTestStore();
    render(
      <Provider store={store}>
        <Chat chat={mockChat} />
      </Provider>
    );

    const link = screen.getByText("Test Chat");
    fireEvent.click(link);

    expect(dispatchSpy).toHaveBeenCalledWith(toggleMobileNavOpen(false));
  });

  it("adds the active class when the chat is the current page", () => {
    const { store } = createTestStore({ currentPageId: "1" });

    render(
      <Provider store={store}>
        <Chat chat={mockChat} />
      </Provider>
    );

    const chatElement = screen.getByText("Test Chat").closest("div");
    expect(chatElement).toHaveClass("bg-accent-soft");
  });
});
