import { sendVerificationEmail } from "@/utils/emails/send-verification-email";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const data = await request.json();

    if (!data?.email || !data?.token) {
      return NextResponse.json(
        { error: "Email and token are required" },
        { status: 400 }
      );
    }

    // send verification email to users during registration
    const result = await sendVerificationEmail(data.email, data.token);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send email" },
        { status: 400 }
      );
    }

    return NextResponse.json({ message: "Email sent", id: result.id });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Something went wrong" },
      { status: 500 }
    );
  }
}
