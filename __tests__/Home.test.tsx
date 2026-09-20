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
    expect(screen.getAllByText(/Owinta AI/i)[0]).toBeInTheDocument();

    // check that the hero text is rendered correctly
    await waitFor(
      () => expect(screen.getByText(/The Intelligent AI Chatbot/i)).toBeInTheDocument(),
      { timeout: 5000 }
    );

    // check that link button to explore features is present
    const exploreFeaturesLink = screen.getByRole("link", { name: /Explore Features/i });
    expect(exploreFeaturesLink).toBeInTheDocument();
  });
});
