import ChatInput from "@/components/chats/ChatInput";
import { setAIResponse, setLoadingResponse } from "@/features/generalSlice";
import { getResponseFromAI } from "@/utils/actions/response";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { Provider } from "react-redux";
import configureMockStore from "redux-mock-store";

// Mock getResponseFromAI function
jest.mock("../utils/actions/response", () => ({
  getResponseFromAI: jest.fn(),
}));

// Mock the next/navigation useRouter
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

const mockStore = configureMockStore();
const store = mockStore({
  general: {
    currentPageTitle: "Chat Page",
  },
});

describe("ChatInput Component", () => {
  const mockUserId = "12345";
  const mockExistingToken = 5;

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the input and submit button", () => {
    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} existingToken={mockExistingToken} />
      </Provider>
    );

    expect(screen.getByPlaceholderText("Ask Quick")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("disables the submit button when input is empty", () => {
    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} existingToken={mockExistingToken} />
      </Provider>
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("enables the submit button when input is not empty", () => {
    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} existingToken={mockExistingToken} />
      </Provider>
    );

    const input = screen.getByPlaceholderText("Ask Quick");
    const button = screen.getByRole("button");

    fireEvent.change(input, { target: { value: "Hello" } });
    expect(button).not.toBeDisabled();
  });

  it("adjusts textarea height on input change", () => {
    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} existingToken={mockExistingToken} />
      </Provider>
    );

    const input = screen.getByPlaceholderText("Ask Quick");

    fireEvent.change(input, { target: { value: "Hello" } });

    expect(input.style.height).toBe("0px"); // Initial height adjustment
  });

  it("handles form submission and dispatches appropriate actions", async () => {
    const mockRouterPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockRouterPush });

    (getResponseFromAI as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        text: "AI Response",
        chatId: "newChatId",
      },
    });

    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} existingToken={mockExistingToken} />
      </Provider>
    );

    const input = screen.getByPlaceholderText("Ask Quick");
    const button = screen.getByRole("button");

    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(getResponseFromAI).toHaveBeenCalledWith(
        expect.any(FormData),
        "/chat",
        mockExistingToken
      );
    });

    expect(store.getActions()).toContainEqual(setLoadingResponse(true));
    expect(store.getActions()).toContainEqual(setAIResponse("AI Response"));
    expect(store.getActions()).toContainEqual(setLoadingResponse(false));
    expect(mockRouterPush).toHaveBeenCalledWith(`/chat/{newChatId}`);
  });

  it("does not redirect if already on the chat page", async () => {
    const mockRouterPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockRouterPush });

    (getResponseFromAI as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        text: "AI Response",
        chatId: "existingChatId",
      },
    });

    render(
      <Provider store={store}>
        <ChatInput userId={mockUserId} existingToken={mockExistingToken} />
      </Provider>
    );

    const input = screen.getByPlaceholderText("Ask Quick");
    const button = screen.getByRole("button");

    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(getResponseFromAI).toHaveBeenCalledWith(
        expect.any(FormData),
        "/chat",
        mockExistingToken
      );
    });

    expect(store.getActions()).toContainEqual(setAIResponse("AI Response"));
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});
