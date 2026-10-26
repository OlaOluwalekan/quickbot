import { NextRequest, NextResponse } from "next/server";
import ActionResponse from "@/utils/response";
import { db } from "@/utils/db";
import { generateVerificationToken } from "@/utils/actions/token";
import { sendVerificationEmail } from "@/utils/emails/send-verification-email";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body || {};

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        ActionResponse.error("Email is required", null),
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true },
    });

    if (user && !user.emailVerified) {
      const verificationToken = await generateVerificationToken(email);
      if (verificationToken?.token) {
        await sendVerificationEmail(email, verificationToken.token);
      }
    }

    return NextResponse.json(
      ActionResponse.success("If the account exists, an email was sent", null),
      { status: 200 }
    );
  } catch (error) {
    console.error("[API /api/auth/resend-verification] Error:", error);
    return NextResponse.json(
      ActionResponse.error("Error Occurred", null),
      { status: 500 }
    );
  }
}
