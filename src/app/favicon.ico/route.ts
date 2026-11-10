import { NextResponse } from "next/server";

/** Browsers ask for /favicon.ico by default; the real icon is the generated /icon route. */
export function GET(request: Request) {
  return NextResponse.redirect(new URL("/icon", request.url), 308);
}
