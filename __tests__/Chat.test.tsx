import Chat from "@/components/chats/Chat";
import { toggleMobileNavOpen } from "@/features/generalSlice";
import { ChatProps } from "@/types/chats";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import configureMockStore from "redux-mock-store";

const mockStore = configureMockStore();

const store = mockStore({
  general: {
    currentPageId: "1",
    chatMenuIsOpen: false,
    chatMenuClass: "",
    dialogData: null,
  },
});

const mockChat: ChatProps = {
  id: "1",
  title: "Test Chat",
  createdBy: "yd772ijdh9298739",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Chat component", () => {
  it("renders the chat title", () => {
    render(
      <Provider store={store}>
        <Chat chat={mockChat} />
      </Provider>
    );

    // renders the chat title correctly
    expect(screen.getByText("Test Chat")).toBeInTheDocument();
  });

  it("closes mobile nav when chat title is clicked", () => {
    render(
      <Provider store={store}>
        <Chat chat={mockChat} />
      </Provider>
    );

    const link = screen.getByText("Test Chat");
    fireEvent.click(link);

    const actions = store.getActions();
    expect(actions).toContainEqual(toggleMobileNavOpen(false));
  });

  it("adds the active class when the chat is the current page", () => {
    const customStore = mockStore({
      general: {
        currentPageId: "1",
        chatMenuIsOpen: false,
        chatMenuClass: "",
        dialogData: null,
      },
    });

    render(
      <Provider store={customStore}>
        <Chat chat={mockChat} />
      </Provider>
    );

    const chatElement = screen.getByText("Test Chat").closest("div");
    expect(chatElement).toHaveClass("bg-accent");
  });
});
