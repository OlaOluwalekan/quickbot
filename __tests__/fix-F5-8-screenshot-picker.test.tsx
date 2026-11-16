/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ScreenshotPicker, type PickedScreenshot } from "@/components/support/screenshot-picker";
import enMessages from "@/messages/en.json";

jest.mock("next-intl", () => jest.requireActual("../test-utils/next-intl").nextIntlMock);

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => "blob:preview");
  URL.revokeObjectURL = jest.fn();
});

function Harness({ initial = [] as PickedScreenshot[] }) {
  const [value, setValue] = React.useState<PickedScreenshot[]>(initial);
  return <ScreenshotPicker value={value} onChange={setValue} />;
}

const file = (name: string, type: string, bytes = 1000) =>
  new File([new Uint8Array(bytes)], name, { type });

function addFiles(files: File[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

describe("F5.8 — screenshot picker", () => {
  it("adds images, shows thumbnails and the counter, and removes one", async () => {
    render(<Harness />);
    addFiles([file("a.png", "image/png"), file("b.webp", "image/webp")]);
    await waitFor(() => expect(screen.getByTestId("screenshot-counter")).toHaveTextContent("2 / 5"));
    expect(screen.getByAltText("Screenshot 1: a.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove a.png" }));
    expect(screen.getByTestId("screenshot-counter")).toHaveTextContent("1 / 5");
  });

  it("shows a per-file error for a wrong type or a file over 2 MB", async () => {
    render(<Harness />);
    addFiles([file("notes.pdf", "application/pdf"), file("huge.png", "image/png", 3 * 1024 * 1024)]);
    await waitFor(() =>
      expect(screen.getByText(/notes\.pdf.*only PNG, JPEG or WebP/)).toBeInTheDocument()
    );
    expect(screen.getByText(/huge\.png.*larger than 2 MB/)).toBeInTheDocument();
    expect(screen.getByTestId("screenshot-counter")).toHaveTextContent("0 / 5");
  });

  it("stops at five screenshots", async () => {
    render(<Harness />);
    addFiles(Array.from({ length: 6 }, (_, i) => file(`s${i}.png`, "image/png")));
    await waitFor(() => expect(screen.getByTestId("screenshot-counter")).toHaveTextContent("5 / 5"));
    expect(
      screen.getByText(enMessages.Support.screenshots.errors.tooMany.replace("{max}", "5"))
    ).toBeInTheDocument();
  });

  it("adds a pasted image", async () => {
    render(<Harness />);
    const pasted = file("clipboard.png", "image/png");
    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", { value: { files: [pasted] } });
    document.dispatchEvent(event);
    await waitFor(() => expect(screen.getByTestId("screenshot-counter")).toHaveTextContent("1 / 5"));
    expect(event.defaultPrevented).toBe(true);
  });
});
