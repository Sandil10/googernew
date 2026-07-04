import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
    if (request.nextUrl.pathname === "/dashboard") {
        const url = request.nextUrl.clone();
        url.pathname = "/home";
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/dashboard"],
};
