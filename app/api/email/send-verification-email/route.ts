import { sendVerificationEmail } from "@/utils/emails/send-verification-email";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // get request body
  const data = await request.json();

  try {
    // send verification email to users during registration
    await sendVerificationEmail(data.email, data.token);
    return NextResponse.json({ message: "Email sent" });
  } catch (error) {
    return NextResponse.json({ error: "something went wrong" });
  }
}
