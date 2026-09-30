import { NextResponse } from "next/server";
import { repositoryManager } from "@/lib/repositories/factory";

export async function GET() {
  const isReady = !!repositoryManager;
  if (!isReady) {
    return NextResponse.json(
      { ready: false, error: "Repository manager uninitialized" },
      { status: 503 }
    );
  }

  return NextResponse.json(
    {
      ready: true,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
