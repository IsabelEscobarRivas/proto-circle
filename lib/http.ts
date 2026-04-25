import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json(
    { error: "bad_request", message, details },
    { status: 400 },
  );
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: "not_found", message }, { status: 404 });
}

export function serverError(message: string, details?: unknown) {
  return NextResponse.json(
    { error: "server_error", message, details },
    { status: 500 },
  );
}

export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

export function requireString(
  obj: Record<string, unknown>,
  key: string,
): string {
  const v = obj[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`Missing or invalid field: \`${key}\` (expected string).`);
  }
  return v;
}

export function optionalString(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") {
    throw new Error(`Invalid field: \`${key}\` (expected string).`);
  }
  return v;
}

export function optionalNumber(
  obj: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw new Error(`Invalid field: \`${key}\` (expected number).`);
  }
  return v;
}
