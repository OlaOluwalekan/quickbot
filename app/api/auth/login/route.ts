import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signIn } from "@/auth";
import ActionResponse from "@/utils/response";
import { LoginSchema } from "@/utils/schema/auth.shema";
import { getUserByEmail } from "@/utils/actions/user";
import { signMobileToken } from "@/utils/api-auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body || {};

    if (!email) {
      return NextResponse.json(
        ActionResponse.error("email is required", null),
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json(
        ActionResponse.error("password is required", null),
        { status: 400 }
      );
    }

    const parsed = LoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message || "Invalid input";
      return NextResponse.json(ActionResponse.error(firstIssue, null), {
        status: 400,
      });
    }

    const existingUser = await getUserByEmail(email);

    if (!existingUser || !existingUser.email) {
      return NextResponse.json(
        ActionResponse.error("User does not exist", null),
        { status: 404 }
      );
    }

    if (!existingUser.password) {
      const { password: _p, ...safeUser } = existingUser;
      return NextResponse.json(
        ActionResponse.error(
          "This account uses a different login method",
          safeUser
        ),
        { status: 400 }
      );
    }

    if (!existingUser.emailVerified) {
      const { password: _p, ...safeUser } = existingUser;
      return NextResponse.json(
        ActionResponse.error("Email is not verified", safeUser),
        { status: 403 }
      );
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      existingUser.password
    );
    if (!isPasswordValid) {
      return NextResponse.json(
        ActionResponse.error("Invalid credentials", null),
        { status: 401 }
      );
    }

    // Attempt NextAuth session sign-in for web cookie clients
    try {
      await signIn("credentials", { email, password, redirect: false });
    } catch {
      // NextAuth may throw a redirect or cookie context warning when called from external clients
    }

    const accessToken = signMobileToken({
      id: existingUser.id,
      email: existingUser.email,
      role: existingUser.role,
    });

    const { password: _pwd, ...safeUser } = existingUser;

    return NextResponse.json(
      ActionResponse.success("Login successful", {
        ...safeUser,
        accessToken,
      }),
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[API /api/auth/login] Error:", error);
    return NextResponse.json(
      ActionResponse.error("An error occurred", null),
      { status: 500 }
    );
  }
}
