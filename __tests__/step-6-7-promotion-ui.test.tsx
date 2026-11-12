/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ResponseCard } from "@/components/response/response-card";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "ws_test_123" }),
}));

jest.mock("next-intl", () => ({
  // Used by the annotation preview card inside AnswerBody (F2.6).
  useFormatter: () => ({ relativeTime: () => "" }),
  useNow: () => new Date(),
  useTranslations: () => (key: string) => key,
}));

// The Promote buttons moved to the Ask column in F2.7: see
// fix-F2-7-promotion-ui.test.tsx.
describe("Step 6.7 — Promoted response card", () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  it("ResponseCard displays quote block and Promoted badge for promoted response", () => {
    const promotedResponse = {
      id: "resp_promoted_123",
      workspaceId: "ws_test_123",
      prompt: "How does quorum size affect write availability?",
      origin: "PROMOTED",
      quote: "Distributed consensus requires quorum agreement across nodes.",
      sourceAnnotationId: "annot_reply_1",
      activeVersion: {
        id: "ver_promo_1",
        number: 1,
        content: "A strict majority quorum tolerates node failures.",
      },
    };

    render(
      <QueryClientProvider client={queryClient}>
        <ResponseCard
          response={promotedResponse}
          workspaceId="ws_test_123"
          userId="user_1"
        />
      </QueryClientProvider>
    );

    // Verify quote block
    const quoteBlock = screen.getByTestId("promoted-quote");
    expect(quoteBlock).toBeInTheDocument();
    expect(quoteBlock).toHaveTextContent("Distributed consensus requires quorum agreement across nodes.");
    expect(screen.getByText("promoted.viewAnnotation")).toBeInTheDocument();

    // Verify Promoted badge
    const badge = screen.getByTestId("promoted-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("promoted.badge");
  });
});
