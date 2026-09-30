import { NextResponse } from "next/server";
import { eventEngine } from "@/lib/engine/eventEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const publicState = await eventEngine.getPublicState();
  return NextResponse.json(publicState);
}
