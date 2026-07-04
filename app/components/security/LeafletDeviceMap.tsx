"use client";

type Props = {
    latitude: number;
    longitude: number;
    label?: string | null;
    className?: string;
};

export default function LeafletDeviceMap({ latitude, longitude, label, className = "h-[360px]" }: Props) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    const delta = 0.02;
    const bbox = [
        lng - delta,
        lat - delta,
        lng + delta,
        lat + delta,
    ].join(",");
    const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`;

    return (
        <div className={`relative overflow-hidden rounded-3xl bg-black ${className}`}>
            <iframe
                title={label || "Device location map"}
                src={mapUrl}
                className="h-full w-full border-0 grayscale-[0.2] invert-0"
                loading="lazy"
                referrerPolicy="no-referrer"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3">
                <p className="truncate text-xs font-bold text-white">{label || "Device location"}</p>
                <p className="mt-0.5 text-[10px] text-white/55">{lat.toFixed(5)}, {lng.toFixed(5)}</p>
            </div>
        </div>
    );
}
