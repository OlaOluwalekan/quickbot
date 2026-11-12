/**
 * A highlighted passage is sent as rendered text; the stored text is markdown.
 * `locateQuote` must accept every passage a reader can select, and still
 * refuse text that isn't in the source.
 */
import { locateQuote, quoteIsFromSource } from "@/lib/annotations/quote-match";

const SOURCE = [
  "## Leader election",
  "",
  "Raft uses **randomized** election timeouts to avoid _split votes_.",
  "",
  "1. A follower times out.",
  "2. It becomes a `candidate` and asks for votes.",
  "3. See the [Raft paper](https://raft.github.io/raft.pdf) for details.",
  "",
  "| Role | Votes |",
  "| --- | --- |",
  "| Leader | majority |",
  "",
  "The quorum is $\\lfloor N/2 \\rfloor + 1$ nodes &amp; nothing less.",
  "",
  "```ts",
  "const quorum = Math.floor(n / 2) + 1;",
  "```",
].join("\n");

describe("F2.7 — locating a rendered passage in its markdown source", () => {
  it("accepts a passage that is copied character for character", () => {
    const loc = locateQuote(SOURCE, "election timeouts to avoid");
    expect(loc).not.toBeNull();
    expect(SOURCE.slice(loc!.start, loc!.end)).toBe("election timeouts to avoid");
  });

  it("accepts a passage that crosses bold and italic text", () => {
    const quote = "Raft uses randomized election timeouts to avoid split votes.";
    const loc = locateQuote(SOURCE, quote);
    expect(loc).not.toBeNull();
    expect(SOURCE.slice(loc!.start, loc!.end)).toBe(
      "Raft uses **randomized** election timeouts to avoid _split votes"
    );
  });

  it("accepts a passage that spans a heading, paragraphs and list items", () => {
    // Rendered lists have no numbers and blocks are separated by one newline.
    const quote =
      "Leader election\nRaft uses randomized election timeouts to avoid split votes.\n" +
      "A follower times out.\nIt becomes a candidate and asks for votes.";
    const loc = locateQuote(SOURCE, quote);
    expect(loc).not.toBeNull();
    expect(SOURCE.slice(loc!.start, loc!.end).startsWith("Leader election")).toBe(true);
    expect(SOURCE.slice(loc!.start, loc!.end).endsWith("asks for votes")).toBe(true);
  });

  it("accepts a passage that crosses a link, a table and a code block", () => {
    expect(
      quoteIsFromSource(SOURCE, "See the Raft paper for details.\nRoleVotesLeadermajority")
    ).toBe(true);
    expect(
      quoteIsFromSource(SOURCE, "nothing less.\nconst quorum = Math.floor(n / 2) + 1;")
    ).toBe(true);
  });

  it("accepts a passage that crosses a rendered formula", () => {
    // A rendered formula adds its own text (symbols, then the TeX source).
    const quote =
      "The quorum is ⌊N/2⌋+1\\lfloor N/2 \\rfloor + 1⌊N/2⌋+1 nodes & nothing less.";
    expect(quoteIsFromSource(SOURCE, quote)).toBe(true);
  });

  it("accepts a passage that starts and ends inside a word", () => {
    expect(quoteIsFromSource(SOURCE, "andomized election timeouts to avoid split vot")).toBe(true);
  });

  it("refuses text that is not in the source", () => {
    expect(locateQuote(SOURCE, "Paxos uses a different approach entirely.")).toBeNull();
    expect(locateQuote(SOURCE, "Raft uses randomized dice to pick the leader every day")).toBeNull();
    expect(locateQuote(SOURCE, "")).toBeNull();
    expect(locateQuote(SOURCE, "???")).toBeNull();
  });

  it("refuses a passage whose order differs from the source", () => {
    expect(
      locateQuote(SOURCE, "It becomes a candidate and asks for votes. A follower times out.")
    ).toBeNull();
  });
});
