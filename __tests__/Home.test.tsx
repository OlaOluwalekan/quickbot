import Home from "@/app/page";
import store from "@/store";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import enMessages from "../messages/en.json";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => "/",
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

describe("Home Component", () => {
  jest.setTimeout(30000);

  it("renders the Klecx home page component correctly", async () => {
    render(
      <Provider store={store}>
        <Home />
      </Provider>
    );

    // Check that Klecx app name is rendered
    expect(screen.getAllByText(/Klecx/i)[0]).toBeInTheDocument();

    // Check that the hero headline and localized typing text are rendered
    expect(
      screen.getByText(/Think faster\. Create bolder with/i)
    ).toBeInTheDocument();

    await waitFor(
      () =>
        expect(
          screen.getByText(/Stream real-time answers with zero lag/i)
        ).toBeInTheDocument(),
      { timeout: 25000 }
    );

    // Check that link button to register page is present
    const registerLink = screen.getAllByRole("link", {
      name: /Start Free Workspace|Get Started/i,
    })[0];
    expect(registerLink).toBeInTheDocument();
  });
});
