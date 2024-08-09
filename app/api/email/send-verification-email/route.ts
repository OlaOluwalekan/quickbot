import { sendVerificationEmail } from "@/utils/emails/send-verification-email";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const data = await request.json();
  //   console.log("DATA API:", data);
  try {
    await sendVerificationEmail(data.email, data.token);
    return NextResponse.json({ message: "Email sent" });
  } catch (error) {
    return NextResponse.json({ error: "something went wrong" });
  }
}
