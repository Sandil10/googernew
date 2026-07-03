import { NextRequest, NextResponse } from "next/server";

const normalizeCode = (value: string | null) => String(value || "").trim().toUpperCase();

async function fetchCountryCodeFromIpService() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);

  try {
    const response = await fetch("https://ipapi.co/json/", {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) return "";
    const data = await response.json().catch(() => null);
    return normalizeCode(data?.country_code || data?.country);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const headerCountryCode = normalizeCode(
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("cf-ipcountry") ||
    request.headers.get("x-country-code")
  );

  const countryCode = headerCountryCode || await fetchCountryCodeFromIpService();

  return NextResponse.json({
    success: !!countryCode,
    countryCode: countryCode || null,
  });
}
