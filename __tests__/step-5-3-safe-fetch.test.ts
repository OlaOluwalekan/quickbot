/**
 * @jest-environment node
 */

import http from "node:http";
import {
  safeFetch,
  isPrivateOrBlockedIP,
  validateUrl,
  resolveDnsAndValidate,
  isPathDisallowedByRobotsTxt,
  SsrfError,
} from "../server/files/safe-fetch";

const mockGetActor = jest.fn();
const mockRequireWorkspace = jest.fn();
const mockLimit = jest.fn();

jest.mock("../server/auth/session", () => ({
  getActor: (...args: unknown[]) => mockGetActor(...args),
  requireActor: (...args: unknown[]) => mockGetActor(...args),
}));

jest.mock("../server/authz/access", () => ({
  requireWorkspace: (...args: unknown[]) => mockRequireWorkspace(...args),
  resolveWorkspaceRole: jest.fn().mockResolvedValue("owner"),
}));

jest.mock("../server/http/rate-limit", () => ({
  limit: (...args: unknown[]) => mockLimit(...args),
  policies: {
    "link:fetch": { n: 10, window: "1 m" },
  },
}));

const mockDb = {
  user: {
    findUnique: jest.fn(),
  },
  attachment: {
    create: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock("../server/db/client", () => ({
  db: mockDb,
}));

describe("Step 5.3 — Safe link ingestion (SSRF-proof fetcher)", () => {
  let server: http.Server;
  let serverPort: number;
  let serverHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      if (serverHandler) {
        serverHandler(req, res);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(0, "127.0.0.1", () => {
      serverPort = (server.address() as { port: number }).port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("1. isPrivateOrBlockedIP unit checks", () => {
    it("identifies private IPv4 addresses", () => {
      expect(isPrivateOrBlockedIP("10.0.0.1")).toBe(true);
      expect(isPrivateOrBlockedIP("172.16.0.1")).toBe(true);
      expect(isPrivateOrBlockedIP("172.31.255.255")).toBe(true);
      expect(isPrivateOrBlockedIP("192.168.1.1")).toBe(true);
    });

    it("identifies loopback IPv4 and IPv6", () => {
      expect(isPrivateOrBlockedIP("127.0.0.1")).toBe(true);
      expect(isPrivateOrBlockedIP("127.0.0.2")).toBe(true);
      expect(isPrivateOrBlockedIP("::1")).toBe(true);
    });

    it("identifies link-local and cloud metadata addresses", () => {
      expect(isPrivateOrBlockedIP("169.254.169.254")).toBe(true);
      expect(isPrivateOrBlockedIP("fe80::1")).toBe(true);
    });

    it("identifies CGNAT (100.64.0.0/10) and unspecified", () => {
      expect(isPrivateOrBlockedIP("100.64.0.1")).toBe(true);
      expect(isPrivateOrBlockedIP("0.0.0.0")).toBe(true);
      expect(isPrivateOrBlockedIP("::")).toBe(true);
    });

    it("identifies unique-local IPv6 (fc00::/7)", () => {
      expect(isPrivateOrBlockedIP("fc00::1")).toBe(true);
      expect(isPrivateOrBlockedIP("fd12:3456:789a:1::1")).toBe(true);
    });

    it("identifies IPv4-mapped IPv6 pointing to private addresses", () => {
      expect(isPrivateOrBlockedIP("::ffff:127.0.0.1")).toBe(true);
      expect(isPrivateOrBlockedIP("::ffff:10.0.0.1")).toBe(true);
      expect(isPrivateOrBlockedIP("::ffff:169.254.169.254")).toBe(true);
    });

    it("identifies multicast, broadcast, and reserved IPs", () => {
      expect(isPrivateOrBlockedIP("224.0.0.1")).toBe(true);
      expect(isPrivateOrBlockedIP("255.255.255.255")).toBe(true);
      expect(isPrivateOrBlockedIP("240.0.0.1")).toBe(true);
      expect(isPrivateOrBlockedIP("ff02::1")).toBe(true);
    });

    it("allows public unicast addresses", () => {
      expect(isPrivateOrBlockedIP("8.8.8.8")).toBe(false);
      expect(isPrivateOrBlockedIP("1.1.1.1")).toBe(false);
      expect(isPrivateOrBlockedIP("93.184.215.14")).toBe(false);
      expect(isPrivateOrBlockedIP("2606:4700:4700::1111")).toBe(false);
    });
  });

  describe("2. URL Scheme, Credential, and Port Validation", () => {
    it("rejects non-http/https protocols", () => {
      expect(() => validateUrl("ftp://example.com/file.txt")).toThrow(SsrfError);
      expect(() => validateUrl("file:///etc/passwd")).toThrow(SsrfError);
      expect(() => validateUrl("javascript:alert(1)")).toThrow(SsrfError);
      expect(() => validateUrl("gopher://example.com")).toThrow(SsrfError);
      expect(() => validateUrl("data:text/plain,hello")).toThrow(SsrfError);
    });

    it("rejects credentials in URL", () => {
      expect(() => validateUrl("http://admin:secret@example.com")).toThrow(SsrfError);
      expect(() => validateUrl("https://user@example.com")).toThrow(SsrfError);
    });

    it("rejects non-standard ports", () => {
      expect(() => validateUrl("http://example.com:8080/")).toThrow(SsrfError);
      expect(() => validateUrl("http://example.com:22/")).toThrow(SsrfError);
      expect(() => validateUrl("https://example.com:8443/")).toThrow(SsrfError);
    });

    it("allows standard ports 80 and 443", () => {
      expect(validateUrl("http://example.com:80/").port).toBe("");
      expect(validateUrl("https://example.com:443/").port).toBe("");
      expect(validateUrl("https://example.com/").port).toBe("");
    });

    it("rejects decimal and octal literal IPs in hostname directly", () => {
      expect(() => validateUrl("http://2130706433")).toThrow(SsrfError);
      expect(() => validateUrl("http://0177.0.0.1")).toThrow(SsrfError);
      expect(() => validateUrl("http://127.0.0.1")).toThrow(SsrfError);
      expect(() => validateUrl("http://[::1]")).toThrow(SsrfError);
      expect(() => validateUrl("http://169.254.169.254")).toThrow(SsrfError);
    });
  });

  describe("3. DNS Resolution and Multi-IP Verification", () => {
    it("rejects if ANY resolved address is private (public first then private)", async () => {
      const mockDnsLookup = async () => [
        { address: "93.184.215.14", family: 4 }, // public IP
        { address: "10.0.0.1", family: 4 },       // private IP
      ];

      await expect(
        resolveDnsAndValidate("dual-homed.example.com", mockDnsLookup)
      ).rejects.toThrow(/forbidden/i);
    });

    it("rejects localtest.me or names resolving to 127.0.0.1", async () => {
      const mockDnsLookup = async () => [
        { address: "127.0.0.1", family: 4 },
      ];

      await expect(
        resolveDnsAndValidate("localtest.me", mockDnsLookup)
      ).rejects.toThrow(/forbidden/i);
    });

    it("passes when all resolved addresses are public unicast", async () => {
      const mockDnsLookup = async () => [
        { address: "93.184.215.14", family: 4 },
        { address: "93.184.215.15", family: 4 },
      ];

      const res = await resolveDnsAndValidate("valid.example.com", mockDnsLookup);
      expect(res).toHaveLength(2);
      expect(res[0]?.address).toBe("93.184.215.14");
    });
  });

  describe("4. SSRF Corpus and Attack Prevention in safeFetch", () => {
    it("rejects direct http://127.0.0.1", async () => {
      await expect(safeFetch("http://127.0.0.1")).rejects.toThrow(SsrfError);
    });

    it("rejects direct http://[::1]", async () => {
      await expect(safeFetch("http://[::1]")).rejects.toThrow(SsrfError);
    });

    it("rejects cloud metadata http://169.254.169.254", async () => {
      await expect(safeFetch("http://169.254.169.254")).rejects.toThrow(SsrfError);
    });

    it("rejects decimal integer IP form http://2130706433", async () => {
      await expect(safeFetch("http://2130706433")).rejects.toThrow(SsrfError);
    });

    it("rejects octal IP form http://0177.0.0.1", async () => {
      await expect(safeFetch("http://0177.0.0.1")).rejects.toThrow(SsrfError);
    });

    it("rejects hostname that returns a public IP first then a private one", async () => {
      const mockDns = async () => [
        { address: "93.184.215.14", family: 4 },
        { address: "192.168.1.1", family: 4 },
      ];

      await expect(
        safeFetch("http://hybrid-attacker.com", { dnsLookup: mockDns })
      ).rejects.toThrow(/forbidden/i);
    });

    it("rejects a redirect from a public host to http://10.0.0.5", async () => {
      // Server redirects to private IP
      serverHandler = (_req, res) => {
        res.writeHead(302, { Location: "http://10.0.0.5/secret" });
        res.end();
      };

      const mockDns = async (h: string) => {
        if (h === "public-landing.com") {
          return [{ address: "127.0.0.1", family: 4 }];
        }
        return [{ address: "10.0.0.5", family: 4 }];
      };

      await expect(
        safeFetch(`http://public-landing.com:${serverPort}/redirect`, {
          // Temporarily mock DNS to point public-landing.com to our local test server port
          allowedPorts: [80, 443, serverPort],
          allowLoopbackForTesting: true,
          dnsLookup: async (h) => {
            if (h === "10.0.0.5") {
              return [{ address: "10.0.0.5", family: 4 }];
            }
            return [{ address: "127.0.0.1", family: 4 }];
          },
        })
      ).rejects.toThrow(SsrfError);
    });

    it("rejects redirect chains exceeding 3 hops", async () => {
      let hops = 0;
      serverHandler = (req, res) => {
        hops++;
        res.writeHead(302, { Location: `http://example.com:${serverPort}/hop-${hops}` });
        res.end();
      };

      const mockDns = async () => [{ address: "127.0.0.1", family: 4 }];

      await expect(
        safeFetch(`http://example.com:${serverPort}/hop-0`, {
          allowedPorts: [80, 443, serverPort],
          allowLoopbackForTesting: true,
          dnsLookup: mockDns,
          maxRedirects: 3,
        })
      ).rejects.toThrow(/Maximum redirect limit/i);
    });

    it("rejects oversized body (> 2MB)", async () => {
      serverHandler = (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        // Stream 3 MB of data
        const chunk = Buffer.alloc(1024 * 1024, "A");
        res.write(chunk);
        res.write(chunk);
        res.write(chunk);
        res.end();
      };

      const mockDns = async () => [{ address: "127.0.0.1", family: 4 }];

      await expect(
        safeFetch(`http://example.com:${serverPort}/huge`, {
          allowedPorts: [80, 443, serverPort],
          allowLoopbackForTesting: true,
          dnsLookup: mockDns,
          maxBytes: 2 * 1024 * 1024,
        })
      ).rejects.toThrow(/exceeds/i);
    });

    it("rejects slow-loris response exceeding total timeout", async () => {
      serverHandler = (_req, _res) => {
        // Deliberately hold connection open without sending response
      };

      const mockDns = async () => [{ address: "127.0.0.1", family: 4 }];

      await expect(
        safeFetch(`http://example.com:${serverPort}/slow`, {
          allowedPorts: [80, 443, serverPort],
          allowLoopbackForTesting: true,
          dnsLookup: mockDns,
          totalTimeoutMs: 100, // 100ms test timeout
        })
      ).rejects.toThrow(/timed out/i);
    });

    it("rejects disallowed content types like application/zip", async () => {
      serverHandler = (_req, res) => {
        res.writeHead(200, { "Content-Type": "application/zip" });
        res.end("PK00...");
      };

      const mockDns = async () => [{ address: "127.0.0.1", family: 4 }];

      await expect(
        safeFetch(`http://example.com:${serverPort}/archive.zip`, {
          allowedPorts: [80, 443, serverPort],
          allowLoopbackForTesting: true,
          dnsLookup: mockDns,
        })
      ).rejects.toThrow(/Unsupported content type/i);
    });
  });

  describe("5. robots.txt Disallow Evaluator", () => {
    it("respects robots.txt disallow for KlecxBot and *", () => {
      const robots = `
User-agent: *
Disallow: /admin/
Disallow: /private/
Allow: /private/public-doc

User-agent: Googlebot
Disallow: /
`;
      expect(isPathDisallowedByRobotsTxt(robots, "/admin/dashboard")).toBe(true);
      expect(isPathDisallowedByRobotsTxt(robots, "/private/secret")).toBe(true);
      expect(isPathDisallowedByRobotsTxt(robots, "/private/public-doc")).toBe(false);
      expect(isPathDisallowedByRobotsTxt(robots, "/articles/post-1")).toBe(false);
    });
  });

  describe("6. Clean Text Extraction on Normal HTML & Plain Text", () => {
    it("extracts clean title and article body using Readability + linkedom", async () => {
      serverHandler = (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Deep Dive into AI Systems</title>
              <meta name="author" content="Jane Doe" />
            </head>
            <body>
              <nav><a href="/">Home</a><a href="/about">About</a></nav>
              <article>
                <h1>Deep Dive into AI Systems</h1>
                <p>Artificial intelligence systems require robust data engineering, safety boundaries, and clear evaluation metrics.</p>
                <p>Deploying large language models with retrieval augmented generation reduces hallucinations significantly.</p>
              </article>
              <footer>&copy; 2026 Tech Journal</footer>
            </body>
          </html>
        `);
      };

      const mockDns = async () => [{ address: "127.0.0.1", family: 4 }];

      const result = await safeFetch(`http://example.com:${serverPort}/article`, {
        allowedPorts: [80, 443, serverPort],
          allowLoopbackForTesting: true,
          dnsLookup: mockDns,
      });

      expect(result.status).toBe(200);
      expect(result.mime).toBe("text/html");
      expect(result.originalName).toBe("example.com");
      expect(result.title).toContain("Deep Dive into AI Systems");
      expect(result.text).toContain("Artificial intelligence systems require robust data engineering");
      expect(result.text).toContain("reduces hallucinations significantly");
      expect(result.text).not.toContain("Home"); // Navigation stripped by Readability
      expect(result.text).not.toContain("Tech Journal"); // Footer stripped
    });

    it("handles plain text responses cleanly", async () => {
      serverHandler = (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("This is a simple plain text note without any HTML markup.");
      };

      const mockDns = async () => [{ address: "127.0.0.1", family: 4 }];

      const result = await safeFetch(`http://example.com:${serverPort}/notes.txt`, {
        allowedPorts: [80, 443, serverPort],
          allowLoopbackForTesting: true,
          dnsLookup: mockDns,
      });

      expect(result.status).toBe(200);
      expect(result.mime).toBe("text/plain");
      expect(result.text).toBe("This is a simple plain text note without any HTML markup.");
    });
  });

  describe("7. ingestLinkAttachment Service Integration", () => {
    it("rate limits link ingestion (10/min) and stores Attachment of kind DOCUMENT", async () => {
      const { ingestLinkAttachment } = await import("../server/services/attachment");

      mockRequireWorkspace.mockResolvedValue({ ws: { ownerId: "user-test-1" } });
      mockLimit.mockResolvedValue({ success: true, remaining: 9, reset: Date.now() + 60000 });
      mockDb.user.findUnique.mockResolvedValue({ plan: "free" });
      mockDb.attachment.count.mockResolvedValue(0);

      const createdRecord = {
        id: "att-link-123",
        ownerId: "user-test-1",
        workspaceId: "ws-test-1",
        kind: "DOCUMENT",
        status: "READY",
        providerId: `http://example.com:${serverPort}/article`,
        resourceType: "raw",
        mime: "text/html",
        bytes: 120,
        originalName: "example.com",
        extractedText: "Clean extracted article text",
        createdAt: new Date(),
        deletedAt: null,
      };
      mockDb.attachment.create.mockResolvedValue(createdRecord);

      serverHandler = (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><article><p>Clean extracted article text</p></article></body></html>");
      };

      const result = await ingestLinkAttachment(
        { userId: "user-test-1", role: "USER", email: "test@example.com", sessionId: "sess-1" },
        "ws-test-1",
        `http://example.com:${serverPort}/article`,
        {
          allowedPorts: [80, 443, serverPort],
          allowLoopbackForTesting: true,
          dnsLookup: async () => [{ address: "127.0.0.1", family: 4 }],
        }
      );

      expect(mockLimit).toHaveBeenCalledWith("link:fetch", "user-test-1");
      expect(mockDb.attachment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: "DOCUMENT",
          status: "READY",
          originalName: "example.com",
          mime: "text/html",
        }),
      });
      expect(result.id).toBe("att-link-123");
      expect(result.kind).toBe("DOCUMENT");
    });
  });
});
