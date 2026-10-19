import { NextResponse } from "next/server";
import ActionResponse from "@/utils/response";
import { getTemplatePrompts } from "@/utils/actions/template-prompt";

export async function GET() {
  try {
    const result = await getTemplatePrompts();
    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error("[API GET /api/prompts/templates] Error:", error);
    return NextResponse.json(
      ActionResponse.error("Failed to fetch template prompts", null),
      { status: 500 }
    );
  }
}
