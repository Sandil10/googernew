// Real image sticker packs using Twemoji (Twitter open-source emoji art, CC BY 4.0).
// Each sticker is a 72×72 PNG with transparent background — rendered large in chat.
// Available to Plan 02+ users (chat_stickers feature).

const BASE = "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72";

const s = (code: string) => `${BASE}/${code}.png`;

export type Sticker = {
    id: string;
    url: string;
    label: string;
};

export type StickerPack = {
    id: string;
    name: string;
    icon: string;
    stickers: Sticker[];
};

export const STICKER_PACKS: StickerPack[] = [
    {
        id: "smileys",
        name: "Smileys",
        icon: "😄",
        stickers: [
            { id: "joy",      url: s("1f602"), label: "Joy" },
            { id: "hearts",   url: s("1f970"), label: "In Love" },
            { id: "cool",     url: s("1f60e"), label: "Cool" },
            { id: "starstruck", url: s("1f929"), label: "Star-Struck" },
            { id: "rofl",     url: s("1f923"), label: "ROFL" },
        ],
    },
    {
        id: "love",
        name: "Love",
        icon: "❤️",
        stickers: [
            { id: "heart",    url: s("2764"),  label: "Heart" },
            { id: "sparkling",url: s("1f496"), label: "Sparkling Heart" },
            { id: "kiss",     url: s("1f48b"), label: "Kiss" },
            { id: "rose",     url: s("1f339"), label: "Rose" },
            { id: "gift",     url: s("1f381"), label: "Gift" },
        ],
    },
    {
        id: "reactions",
        name: "Reactions",
        icon: "🔥",
        stickers: [
            { id: "fire",     url: s("1f525"), label: "Fire" },
            { id: "clap",     url: s("1f44f"), label: "Clap" },
            { id: "100",      url: s("1f4af"), label: "100" },
            { id: "party",    url: s("1f389"), label: "Party" },
            { id: "trophy",   url: s("1f3c6"), label: "Trophy" },
        ],
    },
    {
        id: "fun",
        name: "Fun",
        icon: "🦄",
        stickers: [
            { id: "unicorn",  url: s("1f984"), label: "Unicorn" },
            { id: "dog",      url: s("1f436"), label: "Dog" },
            { id: "rainbow",  url: s("1f308"), label: "Rainbow" },
            { id: "star",     url: s("2b50"),  label: "Star" },
            { id: "pizza",    url: s("1f355"), label: "Pizza" },
        ],
    },
];
