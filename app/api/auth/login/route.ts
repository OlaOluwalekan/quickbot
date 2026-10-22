import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signIn } from "@/auth";
import ActionResponse from "@/utils/response";
import { LoginSchema } from "@/utils/schema/auth.shema";
import { getUserByEmailWithPassword } from "@/utils/actions/user";
import { signMobileToken } from "@/utils/api-auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body || {};

    if (!email || !password) {
      return NextResponse.json(
        ActionResponse.error("Invalid email or password", null),
        { status: 401 }
      );
    }

    const parsed = LoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      return NextResponse.json(
        ActionResponse.error("Invalid email or password", null),
        { status: 401 }
      );
    }

    const existingUser = await getUserByEmailWithPassword(email);

    if (
      !existingUser ||
      !existingUser.email ||
      !existingUser.password ||
      !existingUser.emailVerified
    ) {
      return NextResponse.json(
        ActionResponse.error("Invalid email or password", null),
        { status: 401 }
      );
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      existingUser.password
    );
    if (!isPasswordValid) {
      return NextResponse.json(
        ActionResponse.error("Invalid email or password", null),
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

    const safeUser = {
      id: existingUser.id,
      name: existingUser.name,
      email: existingUser.email,
      image: existingUser.image,
      emailVerified: existingUser.emailVerified,
      role: existingUser.role,
      tokens: existingUser.tokens,
    };

    return NextResponse.json(
      ActionResponse.success("Login successful", {
        ...safeUser,
        accessToken,
      }),
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("[API /api/auth/login] Error:", error);
    return NextResponse.json(
      ActionResponse.error("An error occurred", null),
      { status: 500 }
    );
  }
}
