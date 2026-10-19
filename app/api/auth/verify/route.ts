import { NextRequest, NextResponse } from "next/server";
import ActionResponse from "@/utils/response";
import { verifyEmail } from "@/utils/actions/register";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body || {};

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        ActionResponse.error("Invalid token", null),
        { status: 400 }
      );
    }

    const result = await verifyEmail(token);
    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    console.error("[API /api/auth/verify] Error:", error);
    return NextResponse.json(
      ActionResponse.error("Something went wrong. Try again later", null),
      { status: 500 }
    );
  }
}
