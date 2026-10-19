import { NextRequest, NextResponse } from "next/server";
import ActionResponse from "@/utils/response";
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

    const verificationToken = await generateVerificationToken(email);
    if (!verificationToken) {
      return NextResponse.json(
        ActionResponse.error("Error Occurred", null),
        { status: 500 }
      );
    }

    await sendVerificationEmail(email, verificationToken.token);

    return NextResponse.json(
      ActionResponse.success("Verification email sent", verificationToken),
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
