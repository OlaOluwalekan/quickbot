import { route } from "@/server/http/route";
import { Errors } from "@/server/http/errors";
import { getClientIp } from "@/server/http/rate-limit";
import { supportTicketSchema } from "@/lib/schemas/support";
import { createSupportTicket } from "@/server/services/support";
import type { IncomingScreenshot } from "@/server/services/support-screenshots";
import { MAX_SUPPORT_SCREENSHOTS } from "@/lib/support/screenshots";
import { LOCALE_COOKIE } from "@/i18n/config";

/**
 * Support requests. JSON for a request without files; `multipart/form-data`
 * (the same fields, `diagnostics` as a JSON string, plus up to five
 * `screenshots`) when screenshots are attached.
 */
export const POST = route({
  auth: "optional",
  rateLimit: {
    policy: "support:send",
    key: (c) => c.actor?.userId ?? getClientIp(c.req) ?? "anonymous",
  },
  handler: async ({ req, actor }) => {
    const isMultipart = (req.headers.get("content-type") ?? "").includes(
      "multipart/form-data"
    );

    let raw: unknown;
    const screenshots: IncomingScreenshot[] = [];

    if (isMultipart) {
      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        throw Errors.badRequest("Invalid multipart form data", "invalid_form_data");
      }
      const text = (name: string) => {
        const value = form.get(name);
        return typeof value === "string" ? value : undefined;
      };
      let diagnostics: unknown;
      const diagnosticsText = text("diagnostics");
      if (diagnosticsText) {
        try {
          diagnostics = JSON.parse(diagnosticsText);
        } catch {
          throw Errors.badRequest("Malformed diagnostics");
        }
      }
      raw = {
        name: text("name") || undefined,
        email: text("email"),
        topic: text("topic"),
        message: text("message"),
        website: text("website") || undefined,
        diagnostics,
      };

      const files = form.getAll("screenshots");
      // Refuse an oversized batch before reading any file into memory.
      if (files.length > MAX_SUPPORT_SCREENSHOTS) {
        throw Errors.unprocessable(
          `At most ${MAX_SUPPORT_SCREENSHOTS} screenshots`,
          "too_many_screenshots",
          { max: MAX_SUPPORT_SCREENSHOTS }
        );
      }
      for (const file of files) {
        if (typeof file === "string") {
          throw Errors.badRequest("Screenshots must be files", "invalid_form_data");
        }
        screenshots.push({ buffer: Buffer.from(await file.arrayBuffer()) });
      }
    } else {
      const body = await req.text();
      try {
        raw = body.trim() ? JSON.parse(body) : {};
      } catch {
        throw Errors.badRequest("Malformed JSON");
      }
    }

    const parsed = supportTicketSchema.safeParse(raw);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.flatten());
    }

    return createSupportTicket(actor, parsed.data, {
      screenshots,
      locale: req.cookies.get(LOCALE_COOKIE)?.value,
    });
  },
});
