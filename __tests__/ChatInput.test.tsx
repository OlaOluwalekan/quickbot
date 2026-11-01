import ChatInput from "@/components/chats/ChatInput";
import generalReducer from "@/features/generalSlice";
import { GeneralSliceInit } from "@/types";
import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { usePathname, useRouter } from "next/navigation";
import enMessages from "../messages/en.json";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}));

jest.mock("next-intl", () => ({
  useTranslations: (namespace: keyof typeof enMessages) => {
    return (key: string, values?: Record<string, any>) => {
      const ns = (enMessages as any)[namespace] || {};
      let template = ns[key] || key;
      if (values) {
        Object.entries(values).forEach(([k, v]) => {
          template = template.replace(`{${k}}`, String(v));
        });
      }
      return template;
    };
  },
  useLocale: () => "en",
}));

function createTestStore() {
  const preloadedGeneral: GeneralSliceInit = {
    theme: "light",
    themeIsOpen: false,
    mobileNavIsOpen: false,
    profileDialogIsOpen: false,
    aiResponse: "",
    loadingResponse: false,
    codeTheme: "light",
    currentPageTitle: "Test Chat",
    currentPageId: null,
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
  };

  return configureStore({
    reducer: { general: generalReducer },
    preloadedState: { general: preloadedGeneral },
  });
}

describe("ChatInput Component", () => {
  const mockUserId = "userId1";
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      refresh: jest.fn(),
    });
    (usePathname as jest.Mock).mockReturnValue("/workspaces");

    store = createTestStore();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the ChatInput component correctly", () => {
    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} />
      </Provider>
    );

    const textarea = screen.getByPlaceholderText(/Message Klecx/i);
    expect(textarea).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: /Send/i });
    expect(submitBtn).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /Chat/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create Image/i })
    ).toBeInTheDocument();
  });

  it("updates the textarea value on change", () => {
    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} />
      </Provider>
    );

    const textarea = screen.getByPlaceholderText(/Message Klecx/i);
    fireEvent.change(textarea, { target: { value: "Hello, Klecx!" } });
    expect(textarea).toHaveValue("Hello, Klecx!");
  });

  it("disables the submit button when textarea is empty", () => {
    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} />
      </Provider>
    );

    const submitBtn = screen.getByRole("button", { name: /Send/i });
    expect(submitBtn).toBeDisabled();
  });

  it("enables the submit button when textarea has text", () => {
    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} />
      </Provider>
    );

    const textarea = screen.getByPlaceholderText(/Message Klecx/i);
    fireEvent.change(textarea, { target: { value: "Hello, Klecx!" } });
    const submitBtn = screen.getByRole("button", { name: /Send/i });
    expect(submitBtn).toBeEnabled();
  });

  it("adjusts textarea height on input change", () => {
    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} />
      </Provider>
    );

    const textarea = screen.getByPlaceholderText(/Message Klecx/i);
    fireEvent.change(textarea, { target: { value: "Hello, Klecx!" } });
    expect(textarea.style.height).toBe("0px");
  });
});
