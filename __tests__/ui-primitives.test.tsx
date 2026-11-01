import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";

const ROOT = process.cwd();

describe("Step 3.2 — UI primitives (shadcn/ui on Radix)", () => {
  it("has created all required shadcn/ui and custom primitives", () => {
    const expectedFiles = [
      "components/ui/button.tsx",
      "components/ui/input.tsx",
      "components/ui/textarea.tsx",
      "components/ui/label.tsx",
      "components/ui/form.tsx",
      "components/ui/dialog.tsx",
      "components/ui/alert-dialog.tsx",
      "components/ui/dropdown-menu.tsx",
      "components/ui/popover.tsx",
      "components/ui/tooltip.tsx",
      "components/ui/tabs.tsx",
      "components/ui/sheet.tsx",
      "components/ui/skeleton.tsx",
      "components/ui/avatar.tsx",
      "components/ui/badge.tsx",
      "components/ui/separator.tsx",
      "components/ui/scroll-area.tsx",
      "components/ui/command.tsx",
      "components/ui/switch.tsx",
      "components/ui/select.tsx",
      "components/ui/checkbox.tsx",
      "components/ui/radio-group.tsx",
      "components/ui/sonner.tsx",
      "components/ui/spinner.tsx",
      "components/ui/empty-state.tsx",
      "components/ui/page-header.tsx",
      "components/ui/confirm-dialog.tsx",
      "components/ui/copy-button.tsx",
      "app/dev/ui/page.tsx",
    ];

    for (const rel of expectedFiles) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
    }
  });

  it("has deleted all legacy UI components", () => {
    const deletedPaths = [
      "components/ui/button",
      "components/ui/inputs",
      "components/alert",
      "components/loading",
      "components/ui/text/TypingText.tsx",
      "components/chats/PopupOverlay.tsx",
      "components/chats/DeletePopup.tsx",
      "components/chats/EditPopup.tsx",
    ];

    for (const rel of deletedPaths) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(false);
    }
  });

  it("enforces min-height and aria-label on icon-only Button", () => {
    render(
      <Button size="icon" tooltip="Open settings">
        <span>⚙</span>
      </Button>
    );

    const btn = screen.getByRole("button", { name: "Open settings" });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain("min-h-10");
    expect(btn.className).toContain("max-sm:min-h-11");
  });

  it("renders Spinner, EmptyState, PageHeader, and CopyButton", () => {
    render(
      <div>
        <PageHeader title="Workspaces" description="Manage your workspaces" />
        <EmptyState
          title="No workspaces"
          description="Create your first workspace"
          action={<Button>Create</Button>}
        />
        <Spinner label="Fetching data" />
        <CopyButton value="test-snippet" label="Copy snippet" />
      </div>
    );

    expect(screen.getByText("Workspaces")).toBeInTheDocument();
    expect(screen.getByText("No workspaces")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Fetching data" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy snippet" })).toBeInTheDocument();
  });

  it("requires typed confirmation in ConfirmDialog when confirmText is set", () => {
    const onConfirm = jest.fn();
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={jest.fn()}
        title="Delete workspace"
        description="Type DELETE to confirm"
        confirmText="DELETE"
        confirmLabel="Confirm Delete"
        onConfirm={onConfirm}
      />
    );

    const confirmBtn = screen.getByRole("button", { name: "Confirm Delete" });
    expect(confirmBtn).toBeDisabled();

    const input = screen.getByPlaceholderText("DELETE");
    fireEvent.change(input, { target: { value: "WRONG" } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: "DELETE" } });
    expect(confirmBtn).toBeEnabled();

    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
