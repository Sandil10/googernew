import { NextResponse } from "next/server";

const fallbackCountries = [
  { code: "LK", name: "Sri Lanka", flag: "https://flagcdn.com/lk.svg", dialCode: "+94" },
  { code: "US", name: "United States", flag: "https://flagcdn.com/us.svg", dialCode: "+1" },
  { code: "GB", name: "United Kingdom", flag: "https://flagcdn.com/gb.svg", dialCode: "+44" },
  { code: "IN", name: "India", flag: "https://flagcdn.com/in.svg", dialCode: "+91" },
];

export async function GET() {
  try {
    const [namesResponse, phoneResponse] = await Promise.all([
      fetch("https://country.io/names.json", { next: { revalidate: 60 * 60 * 24 } }),
      fetch("https://country.io/phone.json", { next: { revalidate: 60 * 60 * 24 } }),
    ]);
    if (!namesResponse.ok || !phoneResponse.ok) throw new Error("Country provider failed");
    const names = await namesResponse.json();
    const phones = await phoneResponse.json();

    const countries = Object.entries(names)
      .map(([rawCode, rawName]) => {
        const code = String(rawCode).toUpperCase();
        const phone = String((phones as Record<string, string>)[code] || "").trim();
        if (!code || !rawName || !phone) return null;
        const dialCode = phone.startsWith("+") ? phone : `+${phone}`;
        return {
          code,
          name: String(rawName),
          flag: `https://flagcdn.com/${code.toLowerCase()}.svg`,
          dialCode,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, countries: countries.length ? countries : fallbackCountries });
  } catch {
    return NextResponse.json({ success: true, countries: fallbackCountries, fallback: true });
  }
}
