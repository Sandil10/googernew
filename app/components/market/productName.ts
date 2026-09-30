/** Product name as shown on cards and the second view: first letter capital,
 *  the rest lower case ("FISH BUN11" -> "Fish bun11"). */
export function productNameCase(name?: string | null): string {
    const t = String(name ?? "").trim();
    if (!t) return t;
    const lower = t.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}
