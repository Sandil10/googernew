// Colour names the Add Listing form offers, with their swatch hex. Saved
// variants only store the name, so views look the hex up here.
const PRODUCT_COLORS: { name: string; hex: string }[] = [
    { name: "None", hex: "transparent" },
    { name: "Alice Blue", hex: "#F0F8FF" }, { name: "Antique White", hex: "#FAEBD7" }, { name: "Aqua", hex: "#00FFFF" }, { name: "Aquamarine", hex: "#7FFFD4" }, { name: "Azure", hex: "#F0FFFF" },
    { name: "Beige", hex: "#F5F5DC" }, { name: "Bisque", hex: "#FFE4C4" }, { name: "Black", hex: "#000000" }, { name: "Blanched Almond", hex: "#FFEBCD" }, { name: "Blue", hex: "#0000FF" },
    { name: "Blue Violet", hex: "#8A2BE2" }, { name: "Brown", hex: "#A52A2A" }, { name: "Burly Wood", hex: "#DEB887" }, { name: "Cadet Blue", hex: "#5F9EA0" }, { name: "Chartreuse", hex: "#7FFF00" },
    { name: "Chocolate", hex: "#D2691E" }, { name: "Coral", hex: "#FF7F50" }, { name: "Cornflower Blue", hex: "#6495ED" }, { name: "Cornsilk", hex: "#FFF8DC" }, { name: "Crimson", hex: "#DC143C" },
    { name: "Cyan", hex: "#00FFFF" }, { name: "Dark Blue", hex: "#00008B" }, { name: "Dark Cyan", hex: "#008B8B" }, { name: "Dark Goldenrod", hex: "#B8860B" }, { name: "Dark Gray", hex: "#A9A9A9" },
    { name: "Dark Green", hex: "#006400" }, { name: "Dark Khaki", hex: "#BDB76B" }, { name: "Dark Magenta", hex: "#8B008B" }, { name: "Dark Olive Green", hex: "#556B2F" }, { name: "Dark Orange", hex: "#FF8C00" },
    { name: "Dark Orchid", hex: "#9932CC" }, { name: "Dark Red", hex: "#8B0000" }, { name: "Dark Salmon", hex: "#E9967A" }, { name: "Dark Sea Green", hex: "#8FBC8F" }, { name: "Dark Slate Blue", hex: "#483D8B" },
    { name: "Dark Slate Gray", hex: "#2F4F4F" }, { name: "Dark Turquoise", hex: "#00CED1" }, { name: "Dark Violet", hex: "#9400D3" }, { name: "Deep Pink", hex: "#FF1493" }, { name: "Deep Sky Blue", hex: "#00BFFF" },
    { name: "Dim Gray", hex: "#696969" }, { name: "Dodger Blue", hex: "#1E90FF" }, { name: "Fire Brick", hex: "#B22222" }, { name: "Floral White", hex: "#FFFAF0" }, { name: "Forest Green", hex: "#228B22" },
    { name: "Fuchsia", hex: "#FF00FF" }, { name: "Gainsboro", hex: "#DCDCDC" }, { name: "Ghost White", hex: "#F8F8FF" }, { name: "Gold", hex: "#FFD700" }, { name: "Goldenrod", hex: "#DAA520" },
    { name: "Gray", hex: "#808080" }, { name: "Green", hex: "#008000" }, { name: "Green Yellow", hex: "#ADFF2F" }, { name: "Honey Dew", hex: "#F0FFF0" }, { name: "Hot Pink", hex: "#FF69B4" },
    { name: "Indian Red", hex: "#CD5C5C" }, { name: "Indigo", hex: "#4B0082" }, { name: "Ivory", hex: "#FFFFF0" }, { name: "Khaki", hex: "#F0E68C" }, { name: "Lavender", hex: "#E6E6FA" },
    { name: "Lavender Blush", hex: "#FFF0F5" }, { name: "Lawn Green", hex: "#7CFC00" }, { name: "Lemon Chiffon", hex: "#FFFACD" }, { name: "Light Blue", hex: "#ADD8E6" }, { name: "Light Coral", hex: "#F08080" },
    { name: "Light Cyan", hex: "#E0FFFF" }, { name: "Light Goldenrod Yellow", hex: "#FAFAD2" }, { name: "Light Gray", hex: "#D3D3D3" }, { name: "Light Green", hex: "#90EE90" }, { name: "Light Pink", hex: "#FFB6C1" },
    { name: "Light Salmon", hex: "#FFA07A" }, { name: "Light Sea Green", hex: "#20B2AA" }, { name: "Light Sky Blue", hex: "#87CEFA" }, { name: "Light Slate Gray", hex: "#778899" }, { name: "Light Steel Blue", hex: "#B0C4DE" },
    { name: "Light Yellow", hex: "#FFFFE0" }, { name: "Lime", hex: "#00FF00" }, { name: "Lime Green", hex: "#32CD32" }, { name: "Linen", hex: "#FAF0E6" }, { name: "Magenta", hex: "#FF00FF" },
    { name: "Maroon", hex: "#800000" }, { name: "Medium Aquamarine", hex: "#66CDAA" }, { name: "Medium Blue", hex: "#0000CD" }, { name: "Medium Orchid", hex: "#BA55D3" }, { name: "Medium Purple", hex: "#9370DB" },
    { name: "Medium Sea Green", hex: "#3CB371" }, { name: "Medium Slate Blue", hex: "#7B68EE" }, { name: "Medium Spring Green", hex: "#00FA9A" }, { name: "Medium Turquoise", hex: "#48D1CC" }, { name: "Medium Violet Red", hex: "#C71585" },
    { name: "Midnight Blue", hex: "#191970" }, { name: "Mint Cream", hex: "#F5FFFA" }, { name: "Misty Rose", hex: "#FFE4E1" }, { name: "Moccasin", hex: "#FFE4B5" }, { name: "Navajo White", hex: "#FFDEAD" },
    { name: "Navy", hex: "#000080" }, { name: "Old Lace", hex: "#FDF5E6" }, { name: "Olive", hex: "#808000" }, { name: "Olive Drab", hex: "#6B8E23" }, { name: "Orange", hex: "#FFA500" },
    { name: "Orange Red", hex: "#FF4500" }, { name: "Orchid", hex: "#DA70D6" }, { name: "Pale Goldenrod", hex: "#EEE8AA" }, { name: "Pale Green", hex: "#98FB98" }, { name: "Pale Turquoise", hex: "#AFEEEE" },
    { name: "Pale Violet Red", hex: "#DB7093" }, { name: "Papaya Whip", hex: "#FFEFD5" }, { name: "Peach Puff", hex: "#FFDAB9" }, { name: "Peru", hex: "#CD853F" }, { name: "Pink", hex: "#FFC0CB" },
    { name: "Plum", hex: "#DDA0DD" }, { name: "Powder Blue", hex: "#B0E0E6" }, { name: "Purple", hex: "#800080" }, { name: "Rebecca Purple", hex: "#663399" }, { name: "Red", hex: "#FF0000" },
    { name: "Rosy Brown", hex: "#BC8F8F" }, { name: "Royal Blue", hex: "#4169E1" }, { name: "Saddle Brown", hex: "#8B4513" }, { name: "Salmon", hex: "#FA8072" }, { name: "Sandy Brown", hex: "#F4A460" },
    { name: "Sea Green", hex: "#2E8B57" }, { name: "Sea Shell", hex: "#FFF5EE" }, { name: "Sienna", hex: "#A0522D" }, { name: "Silver", hex: "#C0C0C0" }, { name: "Sky Blue", hex: "#87CEEB" },
    { name: "Slate Blue", hex: "#6A5ACD" }, { name: "Slate Gray", hex: "#708090" }, { name: "Snow", hex: "#FFFAFA" }, { name: "Spring Green", hex: "#00FF7F" }, { name: "Steel Blue", hex: "#4682B4" },
    { name: "Tan", hex: "#D2B48C" }, { name: "Teal", hex: "#008080" }, { name: "Thistle", hex: "#D8BFD8" }, { name: "Tomato", hex: "#FF6347" }, { name: "Turquoise", hex: "#40E0D0" },
    { name: "Violet", hex: "#EE82EE" }, { name: "Wheat", hex: "#F5DEB3" }, { name: "White", hex: "#FFFFFF" }, { name: "White Smoke", hex: "#F5F5F5" }, { name: "Yellow", hex: "#FFFF00" },
    { name: "Yellow Green", hex: "#9ACD32" },
    // Marketing & Premium names
    { name: "Midnight Black", hex: "#0B0B0B" }, { name: "Space Gray", hex: "#343D46" }, { name: "Rose Gold", hex: "#B76E79" }, { name: "Champagne", hex: "#F7E7CE" }, { name: "Emerald", hex: "#50C878" },
    { name: "Ruby", hex: "#E0115F" }, { name: "Sapphire Blue", hex: "#0F52BA" }, { name: "Amethyst", hex: "#9966CC" }, { name: "Amber Gold", hex: "#FFBF00" }, { name: "Coral Pink", hex: "#F88379" },
    { name: "Mint Green", hex: "#98FF98" }, { name: "Lavender Purple", hex: "#967BB6" }, { name: "Charcoal Gray", hex: "#36454F" }, { name: "Ocean Blue", hex: "#0077BE" }, { name: "Desert Sand", hex: "#EDC9AF" },
    { name: "Burgundy Red", hex: "#800020" }, { name: "Olive Green", hex: "#808000" }, { name: "Mustard Yellow", hex: "#FFDB58" }, { name: "Peach Orange", hex: "#FFCC99" }, { name: "Tiffany Blue", hex: "#0ABAB5" },
    { name: "Periwinkle Blue", hex: "#CCCCFF" }, { name: "Cotton Candy", hex: "#FFBCD9" }, { name: "Slate Gray", hex: "#708090" }, { name: "Stormy Sky", hex: "#778899" }, { name: "Forest Green", hex: "#228B22" },
    { name: "Electric Purple", hex: "#BF00FF" }, { name: "Neon Green", hex: "#39FF14" }, { name: "Ice White", hex: "#F0F8FF" }, { name: "Off White", hex: "#FAF9F6" }, { name: "Creamy Beige", hex: "#F5F5DC" },
    { name: "Mocha", hex: "#A38068" }, { name: "Caramel Brown", hex: "#AF6F09" }, { name: "Honey Gold", hex: "#EBA937" }, { name: "Copper Metallic", hex: "#B87333" }, { name: "Bronze Dust", hex: "#CD7F32" },
    { name: "Titanium Silver", hex: "#878681" }, { name: "Jet Black Matte", hex: "#0A0A0A" }, { name: "Cool Cyan", hex: "#00FFFF" }, { name: "Deep Indigo", hex: "#310062" }, { name: "Lavender Blush", hex: "#FFF0F5" },
    { name: "Cherry Red", hex: "#D2042D" }, { name: "Maroon", hex: "#800000" }, { name: "Wine Red", hex: "#722F37" }, { name: "Berry Purple", hex: "#990F4B" }, { name: "Plum Deep", hex: "#673147" },
    { name: "Midnight Navy", hex: "#191970" }, { name: "Teal Deep", hex: "#004B49" }, { name: "Pine Green", hex: "#01796F" }, { name: "Apple Green", hex: "#8DB600" }, { name: "Lemon Fizz", hex: "#FFF700" },
    { name: "Sunset Gold", hex: "#FFD700" }, { name: "Pumpkin Orange", hex: "#FF7518" }, { name: "Rust Brown", hex: "#B7410E" }, { name: "Cinnamon", hex: "#D2691E" }, { name: "Terracotta", hex: "#E2725B" },
    { name: "Sandstone", hex: "#766352" }, { name: "Taupe Gray", hex: "#8B8589" }, { name: "Pebble Gray", hex: "#D1D1D1" }, { name: "Cloud White", hex: "#F8F8FF" }, { name: "Pearl White", hex: "#F0EAD6" },
    { name: "Eggshell White", hex: "#FBF5E6" }, { name: "Lilac Mist", hex: "#C8A2C8" }, { name: "Thistle Bloom", hex: "#D8BFD8" }, { name: "Sky Blue Light", hex: "#E0FFFF" }, { name: "Baby Pink", hex: "#F4C2C2" }
];

const HEX_BY_NAME = new Map<string, string>();
PRODUCT_COLORS.forEach((c) => {
    const key = c.name.trim().toLowerCase();
    if (!HEX_BY_NAME.has(key)) HEX_BY_NAME.set(key, c.hex);
});

/** Swatch colour for a variant: its own hex, else the hex of its colour name. */
export function variantColorHex(variant: any, fallback = "#333"): string {
    const own = String(variant?.color_hex || variant?.hex || "").trim();
    if (own) return own;
    const name = String(variant?.color || "").trim().toLowerCase();
    const hex = HEX_BY_NAME.get(name);
    if (!hex || hex === "transparent") return fallback;
    return hex;
}