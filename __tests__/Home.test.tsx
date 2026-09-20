import Home from "@/app/page";
import store from "@/store";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";

describe("Home Component", () => {
  jest.setTimeout(30000);
  it("renders the home page component correctly", async () => {
    render(
      <Provider store={store}>
        <Home />
      </Provider>
    );

    // check that app name component is rendered correctly
    expect(screen.getAllByText(/QuickBot/i)[0]).toBeInTheDocument();

    // check that the typing text component is rendered correctly with specific text
    await waitFor(
      () => expect(screen.getByText(/Talk, Learn, Solve – Instantly/i)).toBeInTheDocument(),
      { timeout: 25000 }
    );

    // check that link button to register page is present
    const registerLink = screen.getAllByRole("link", { name: /chat/i })[0];
    expect(registerLink).toBeInTheDocument();
  });
});
