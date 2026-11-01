import ChatInput from "@/components/chats/ChatInput";
import { useUiStore } from "@/lib/stores/ui";
import { useGenerationStore } from "@/lib/stores/generation";
import { fireEvent, render, screen } from "@testing-library/react";
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

describe("ChatInput Component", () => {
  const mockUserId = "userId1";

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      refresh: jest.fn(),
    });
    (usePathname as jest.Mock).mockReturnValue("/workspaces");

    useUiStore.getState().resetTransientUi();
    useUiStore.setState({
      currentPageTitle: "Test Chat",
      currentPageId: null,
      chatMode: "text",
    });
    useGenerationStore.getState().clearAllStreams();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the ChatInput component correctly", () => {
    render(<ChatInput userId={mockUserId} />);

    const textarea = screen.getByPlaceholderText(/Message Klecx/i);
    expect(textarea).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: /Send/i });
    expect(submitBtn).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /Chat/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create Image/i }),
    ).toBeInTheDocument();
  });

  it("updates the textarea value on change", () => {
    render(<ChatInput userId={mockUserId} />);

    const textarea = screen.getByPlaceholderText(/Message Klecx/i);
    fireEvent.change(textarea, { target: { value: "Hello, Klecx!" } });
    expect(textarea).toHaveValue("Hello, Klecx!");
  });

  it("disables the submit button when textarea is empty", () => {
    render(<ChatInput userId={mockUserId} />);

    const submitBtn = screen.getByRole("button", { name: /Send/i });
    expect(submitBtn).toBeDisabled();
  });

  it("enables the submit button when textarea has text", () => {
    render(<ChatInput userId={mockUserId} />);

    const textarea = screen.getByPlaceholderText(/Message Klecx/i);
    fireEvent.change(textarea, { target: { value: "Hello, Klecx!" } });
    const submitBtn = screen.getByRole("button", { name: /Send/i });
    expect(submitBtn).toBeEnabled();
  });

  it("adjusts textarea height on input change", () => {
    render(<ChatInput userId={mockUserId} />);

    const textarea = screen.getByPlaceholderText(/Message Klecx/i);
    fireEvent.change(textarea, { target: { value: "Hello, Klecx!" } });
    expect(textarea.style.height).toBe("0px");
  });
});
