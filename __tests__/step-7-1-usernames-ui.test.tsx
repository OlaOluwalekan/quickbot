/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ClaimUsernameBanner } from "@/components/user/claim-username-banner";
import { ClaimUsernameDialog } from "@/components/user/claim-username-dialog";

// Mock fetch globally
const originalFetch = global.fetch;

describe("Step 7.1 — Username UI Components", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe("ClaimUsernameBanner", () => {
    test("renders banner when username is not claimed", () => {
      const onClaimClick = jest.fn();
      render(<ClaimUsernameBanner claimed={false} onClaimClick={onClaimClick} />);

      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(
        screen.getByText(/Choose your username/i)
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Claim username/i })
      ).toBeInTheDocument();
    });

    test("does not render banner when username is already claimed", () => {
      const onClaimClick = jest.fn();
      render(<ClaimUsernameBanner claimed={true} onClaimClick={onClaimClick} />);

      expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    });

    test("clicking Claim username triggers onClaimClick", () => {
      const onClaimClick = jest.fn();
      render(<ClaimUsernameBanner claimed={false} onClaimClick={onClaimClick} />);

      fireEvent.click(screen.getByRole("button", { name: /Claim username/i }));
      expect(onClaimClick).toHaveBeenCalledTimes(1);
    });

    test("clicking dismiss hides the banner", () => {
      const onClaimClick = jest.fn();
      render(<ClaimUsernameBanner claimed={false} onClaimClick={onClaimClick} />);

      fireEvent.click(screen.getByRole("button", { name: /Dismiss banner/i }));
      expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    });
  });

  describe("ClaimUsernameDialog", () => {
    test("renders dialog when open", () => {
      render(
        <ClaimUsernameDialog
          open={true}
          onOpenChange={jest.fn()}
          currentUsername="user_12345678"
        />
      );

      expect(
        screen.getByRole("heading", { name: /Choose your username/i })
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText("yourname")).toBeInTheDocument();
      expect(screen.getByText("@user_12345678")).toBeInTheDocument();
    });

    test("typing invalid format shows error and keeps Continue disabled", async () => {
      render(
        <ClaimUsernameDialog
          open={true}
          onOpenChange={jest.fn()}
          currentUsername="user_12345678"
        />
      );

      const input = screen.getByPlaceholderText("yourname");
      const continueBtn = screen.getByRole("button", { name: /Continue/i });

      // Starts with number -> invalid
      fireEvent.change(input, { target: { value: "1badname" } });

      await waitFor(() => {
        expect(
          screen.getByText(/must start with a letter/i)
        ).toBeInTheDocument();
      });
      expect(continueBtn).toBeDisabled();
    });

    test("typing valid available username enables Continue and allows progression to confirm step", async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes("/api/v1/usernames/check")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ data: { available: true } }),
          });
        }
        if (url.includes("/api/v1/me/username")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: { username: "coolcoder", displayUsername: "coolcoder" } }),
          });
        }
        return Promise.reject(new Error("unknown url"));
      }) as unknown as typeof fetch;

      const onOpenChange = jest.fn();
      const onSuccess = jest.fn();

      render(
        <ClaimUsernameDialog
          open={true}
          onOpenChange={onOpenChange}
          currentUsername="user_12345678"
          onSuccess={onSuccess}
        />
      );

      const input = screen.getByPlaceholderText("yourname");
      fireEvent.change(input, { target: { value: "coolcoder" } });

      await waitFor(() => {
        expect(screen.getByText(/Username is available!/i)).toBeInTheDocument();
      });

      const continueBtn = screen.getByRole("button", { name: /Continue/i });
      expect(continueBtn).not.toBeDisabled();

      // Click Continue to show confirm step
      fireEvent.click(continueBtn);

      expect(
        screen.getByRole("heading", { name: /Confirm your username/i })
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Once set, your username cannot be changed/i)
      ).toBeInTheDocument();
      expect(screen.getByText("@coolcoder")).toBeInTheDocument();

      // Click Confirm & Claim
      const confirmBtn = screen.getByRole("button", { name: /Confirm & Claim/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith("coolcoder");
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
