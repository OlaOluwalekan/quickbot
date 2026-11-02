/**
 * @jest-environment node
 */
import { db } from "@/server/db/client";
import { UserRole } from "@/server/db/generated/client";

describe("server/db/client (Step 1.1)", () => {
  it("exports singleton PrismaClient with v2 auth delegates", () => {
    expect(db).toBeDefined();
    expect(typeof db.user.findUnique).toBe("function");
    expect(typeof db.session.findUnique).toBe("function");
    expect(typeof db.account.findUnique).toBe("function");
    expect(typeof db.verification.findUnique).toBe("function");
  });

  it("exports UserRole enum with USER and ADMIN", () => {
    expect(UserRole.USER).toBe("USER");
    expect(UserRole.ADMIN).toBe("ADMIN");
  });
});
