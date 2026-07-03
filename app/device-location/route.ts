import { NextRequest, NextResponse } from "next/server";

const isPrivateIp = (ip: string) => (
    /^10\./.test(ip) ||
    /^127\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    ip === "::1" ||
    /^fc|^fd/i.test(ip)
);

const normalizeIpApi = (data: any) => ({
    success: true,
    provider: "ipapi.co",
    location: {
        country: data?.country_name || data?.country || null,
        region: data?.region || null,
        district: data?.region_code || null,
        city: data?.city || null,
        locality: data?.city || null,
        zipcode: data?.postal || null,
        latitude: data?.latitude ?? null,
        longitude: data?.longitude ?? null,
    },
    timezone: data?.timezone || null,
    isp: data?.org || data?.asn || null,
    networkType: data?.network || null,
});

const normalizeIpstack = (data: any) => ({
    success: true,
    provider: "ipstack",
    location: {
        country: data?.country_name || data?.country_code || null,
        region: data?.region_name || data?.region_code || null,
        district: data?.region_code || null,
        city: data?.city || null,
        locality: data?.city || null,
        zipcode: data?.zip || null,
        latitude: data?.latitude ?? null,
        longitude: data?.longitude ?? null,
    },
    timezone: data?.time_zone?.id || data?.time_zone?.code || null,
    isp: data?.connection?.isp || data?.connection?.organization || null,
    networkType: data?.type || null,
});

export async function GET(request: NextRequest) {
    const ip = String(request.nextUrl.searchParams.get("ip") || "").trim();

    if (!ip) {
        return NextResponse.json({ success: false, message: "IP address is required." }, { status: 400 });
    }

    if (isPrivateIp(ip)) {
        return NextResponse.json({ success: false, message: "Private/local IP addresses cannot be mapped." }, { status: 400 });
    }

    const ipstackKey = process.env.IPSTACK_API_KEY || process.env.NEXT_SERVER_IPSTACK_API_KEY || "";

    if (ipstackKey) {
        try {
            const response = await fetch(`http://api.ipstack.com/${encodeURIComponent(ip)}?access_key=${encodeURIComponent(ipstackKey)}`, {
                next: { revalidate: 3600 },
            });
            const data = await response.json().catch(() => null);
            if (response.ok && data && !data?.error && data?.latitude && data?.longitude) {
                return NextResponse.json(normalizeIpstack(data));
            }
        } catch {
            // Fall through to the no-key lookup below.
        }
    }

    try {
        const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
            headers: { "User-Agent": "GoogerSecurityDeviceLookup/1.0" },
            next: { revalidate: 3600 },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.error) {
            throw new Error(data?.reason || data?.message || "Could not load exact IP location.");
        }
        return NextResponse.json(normalizeIpApi(data));
    } catch (error: any) {
        return NextResponse.json({ success: false, message: error?.message || "Could not load exact IP location." }, { status: 502 });
    }
}
