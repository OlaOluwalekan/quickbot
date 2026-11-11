/**
 * Fix F2.6 — profile hovercard on `@name` chips in saved comments (F2.2 spec,
 * carried forward): hovering or focusing a chip shows the member's avatar,
 * name and username, loaded from the workspace's mentionables.
 */

import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../messages/en.json";
import { RenderMentions } from "@/components/annotations/mention-textarea";
import { api } from "@/lib/api/client";

jest.mock("../lib/api/client", () => ({
  api: jest.fn(),
}));

const mockedApi = api as jest.MockedFunction<typeof api>;

function renderText(text: string, props: { workspaceId?: string; focusable?: boolean } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <RenderMentions text={text} {...props} />
    </NextIntlClientProvider>
  );
}

async function focusChip(username: string) {
  const chip = document.querySelector(`[data-mention="${username}"]`) as HTMLElement;
  await act(async () => {
    fireEvent.focus(chip);
    await Promise.resolve();
  });
  return chip;
}

describe("Fix F2.6 — mention profile hovercard", () => {
  beforeEach(() => {
    mockedApi.mockReset();
  });

  it("shows the member's name and username when a chip gets the focus", async () => {
    mockedApi.mockResolvedValue([
      { kind: "user", id: "u_2", username: "ada_lovelace2", displayName: "Other Ada", avatarUrl: null },
      { kind: "user", id: "u_1", username: "ada_lovelace", displayName: "Ada Lovelace", avatarUrl: null },
    ]);
    renderText("Thanks @ada_lovelace for the review", { workspaceId: "ws_card_1" });

    const chip = await focusChip("ada_lovelace");
    expect(chip).toHaveAttribute("tabindex", "0");
    expect(mockedApi).toHaveBeenCalledWith(
      "/api/v1/workspaces/ws_card_1/mentionables?q=ada_lovelace"
    );
    // The exact username is picked, not the first search result.
    expect((await screen.findAllByText("Ada Lovelace")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Other Ada")).not.toBeInTheDocument();
  });

  it("says so when the mentioned person is not a member (any more)", async () => {
    mockedApi.mockResolvedValue([]);
    renderText("cc @former_member", { workspaceId: "ws_card_2" });

    await focusChip("former_member");
    expect(
      (await screen.findAllByText("Not a member of this workspace")).length
    ).toBeGreaterThan(0);
  });

  it("loads a profile once per workspace and username", async () => {
    mockedApi.mockResolvedValue([
      { kind: "user", id: "u_3", username: "grace_h", displayName: "Grace", avatarUrl: null },
    ]);
    renderText("@grace_h and again @grace_h", { workspaceId: "ws_card_3" });

    const chips = document.querySelectorAll('[data-mention="grace_h"]');
    for (const chip of Array.from(chips)) {
      await act(async () => {
        fireEvent.focus(chip);
        await Promise.resolve();
      });
      await screen.findAllByText("Grace");
      act(() => {
        fireEvent.blur(chip);
      });
    }
    expect(mockedApi).toHaveBeenCalledTimes(1);
  });

  it("stays a plain chip without a workspace, and is not focusable inside a button", async () => {
    const { unmount } = renderText("Hello @ada_lovelace");
    const chip = await focusChip("ada_lovelace");
    expect(chip).not.toHaveAttribute("tabindex");
    expect(mockedApi).not.toHaveBeenCalled();
    unmount();

    renderText("Hello @ada_lovelace", { workspaceId: "ws_card_4", focusable: false });
    expect(document.querySelector('[data-mention="ada_lovelace"]')).not.toHaveAttribute(
      "tabindex"
    );
  });

  it("keeps the @klecx chip as it was", () => {
    renderText("@klecx remember this", { workspaceId: "ws_card_5" });
    expect(screen.getByText("Klecx noted this")).toHaveAttribute("data-mention", "klecx");
  });
});
