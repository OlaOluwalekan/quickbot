import Home from "@/app/page";
import store from "@/store";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";

describe("Home Component", () => {
  it("renders the home page component correctly", async () => {
    render(
      <Provider store={store}>
        <Home />
      </Provider>
    );

    // check that app name component is rendered correctly
    expect(screen.getByText(/QuickBot/i)).toBeInTheDocument();

    // check that the typing text component is rendered correctly with specific text
    await waitFor(
      () => expect(screen.getByText(/Need Response?/i)).toBeInTheDocument(),
      { timeout: 20000 }
    );

    // check that link button to register page is present
    const registerLink = screen.getByRole("link", { name: /chat/i });
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute("href", "/auth/register");
  });
});
