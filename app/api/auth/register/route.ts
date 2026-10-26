import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/utils/db";
import ActionResponse from "@/utils/response";
import { RegisterSchema } from "@/utils/schema/auth.shema";
import { generateVerificationToken } from "@/utils/actions/token";
import { getUserByEmail } from "@/utils/actions/user";
import { sendVerificationEmail } from "@/utils/emails/send-verification-email";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, password, confirmPassword } = body || {};

    if (!email) {
      return NextResponse.json(
        ActionResponse.error("Email is required", null),
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json(
        ActionResponse.error("Name is required", null),
        { status: 400 }
      );
    }
    if (!password) {
      return NextResponse.json(
        ActionResponse.error("Password is required", null),
        { status: 400 }
      );
    }
    if (!confirmPassword) {
      return NextResponse.json(
        ActionResponse.error("You need to confirm your password", null),
        { status: 400 }
      );
    }

    const parsed = RegisterSchema.safeParse({
      email,
      name,
      password,
      confirmPassword,
    });

    if (!parsed.success) {
      const firstIssue =
        parsed.error.issues[0]?.message || "Invalid registration details";
      return NextResponse.json(ActionResponse.error(firstIssue, null), {
        status: 400,
      });
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        ActionResponse.error("Passwords do not match", null),
        { status: 400 }
      );
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        ActionResponse.error("Email already exists", null),
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await db.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
      },
    });

    const verificationToken = await generateVerificationToken(email);

    if (verificationToken?.token) {
      await sendVerificationEmail(email, verificationToken.token);
    }

    return NextResponse.json(
      ActionResponse.success("Registration successful", {
        id: newUser.id,
        email: newUser.email,
      }),
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("[API /api/auth/register] Error:", error);
    return NextResponse.json(
      ActionResponse.error(
        error instanceof Error ? error.message : "Registration failed",
        null
      ),
      { status: 500 }
    );
  }
}
