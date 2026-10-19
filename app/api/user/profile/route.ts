import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/utils/db";
import ActionResponse from "@/utils/response";
import { getAuthenticatedUser } from "@/utils/api-auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        ActionResponse.error("Unauthorized", null),
        { status: 401 }
      );
    }

    const { password: _pwd, ...safeUser } = user;
    return NextResponse.json(
      ActionResponse.success("User profile fetched", { user: safeUser }),
      { status: 200 }
    );
  } catch (error) {
    console.error("[API GET /api/user/profile] Error:", error);
    return NextResponse.json(
      ActionResponse.error("Failed to fetch user profile", null),
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        ActionResponse.error("Unauthorized", null),
        { status: 401 }
      );
    }

    const body = await req.json();
    const { name } = body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        ActionResponse.error("Name is required", null),
        { status: 400 }
      );
    }

    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: { name: name.trim() },
    });

    revalidatePath("/settings");
    const { password: _pwd, ...safeUser } = updatedUser;

    return NextResponse.json(
      ActionResponse.success("Name updated", safeUser),
      { status: 200 }
    );
  } catch (error) {
    console.error("[API PATCH /api/user/profile] Error:", error);
    return NextResponse.json(
      ActionResponse.error("Failed to update name", null),
      { status: 500 }
    );
  }
}
