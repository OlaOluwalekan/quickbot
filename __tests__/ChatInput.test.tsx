import ChatInput from "@/components/chats/ChatInput";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import configureMockStore from "redux-mock-store";
import { useRouter } from "next/navigation";

// Mock getResponseFromAI function
jest.mock("../utils/actions/response", () => ({
  getResponseFromAI: jest.fn(),
}));

// Mock the next/navigation useRouter
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

const mockStore = configureMockStore([]);

describe("ChatInput Component", () => {
  const mockUserId = "userId1";
  const mockExistingToken = 100;
  let store: any;

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });

    store = mockStore({
      general: {
        currentPageTitle: "Test Chat",
        chatInputHeight: "48px",
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the ChatInput component correctly", () => {
    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} existingToken={mockExistingToken} />
      </Provider>
    );

    // Check if the textarea is rendered
    const textarea = screen.getByPlaceholderText(/Ask Quick/i);
    expect(textarea).toBeInTheDocument();

    // check if the submit button is rendered
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("updates the textarea value on change", () => {
    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} existingToken={mockExistingToken} />
      </Provider>
    );

    const textarea = screen.getByPlaceholderText(/Ask Quick/i);
    fireEvent.change(textarea, { target: { value: "Hello, QuickBot!" } });
    expect(textarea).toHaveValue("Hello, QuickBot!");
  });

  it("disables the submit button when textarea is empty", () => {
    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} existingToken={mockExistingToken} />
      </Provider>
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("enables the button when text area has text", () => {
    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} existingToken={mockExistingToken} />
      </Provider>
    );

    const textarea = screen.getByPlaceholderText(/Ask Quick/i);
    fireEvent.change(textarea, { target: { value: "Hello, QuickBot!" } });
    const button = screen.getByRole("button");
    expect(button).toBeEnabled();
  });

  it("adjust textarea height on input change", () => {
    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} existingToken={mockExistingToken} />
      </Provider>
    );

    const textarea = screen.getByPlaceholderText(/Ask Quick/i);
    fireEvent.change(textarea, { target: { value: "Hello, QuickBot!" } });
    expect(textarea.style.height).toBe("0px");
  });
});
