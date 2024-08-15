import Home from "@/app/page";
import { render, screen } from "@testing-library/react";

describe("Home page link", () => {
  it("home page contains a button link to register page", () => {
    render(<Home />);

    const registerLink = screen.getByRole("link", { name: /chat/i });
    expect(registerLink).toBeInTheDocument();
  });
});
