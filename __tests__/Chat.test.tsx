import Chat from "@/components/chats/Chat";
import { useUiStore } from "@/lib/stores/ui";
import { ChatProps } from "@/types/chats";
import { fireEvent, render, screen } from "@testing-library/react";

const mockChat: ChatProps = {
  id: "1",
  title: "Test Chat",
  createdBy: "yd772ijdh9298739",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Chat component", () => {
  beforeEach(() => {
    useUiStore.getState().resetTransientUi();
    useUiStore.setState({
      currentPageTitle: "New Chat",
      currentPageId: "1",
      mobileNavIsOpen: true,
    });
  });

  it("renders the chat title", () => {
    render(<Chat chat={mockChat} />);
    expect(screen.getByText("Test Chat")).toBeInTheDocument();
  });

  it("closes mobile nav when chat title is clicked", () => {
    render(<Chat chat={mockChat} />);

    const link = screen.getByText("Test Chat");
    fireEvent.click(link);

    expect(useUiStore.getState().mobileNavIsOpen).toBe(false);
  });

  it("adds the active class when the chat is the current page", () => {
    useUiStore.setState({ currentPageId: "1" });
    render(<Chat chat={mockChat} />);

    const chatElement = screen.getByText("Test Chat").closest("div");
    expect(chatElement).toHaveClass("bg-accent-soft");
  });
});
