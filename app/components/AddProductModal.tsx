"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import IonIcon from "./IonIcon";
import { marketService } from "@/services/marketService";

interface AddProductModalProps {
    onClose: () => void;
    onSuccess: () => void;
    initialData?: any;
}

const CATEGORIES_HIERARCHY: any = {
    "FASHION": {
        "Women’s Clothing": ["Dresses", "Tops & Blouses", "T-Shirts", "Jeans", "Pants & Trousers", "Skirts", "Shorts", "Jackets & Coats", "Activewear", "Formal Wear"],
        "Men’s Clothing": ["T-Shirts", "Shirts", "Jeans", "Trousers", "Shorts", "Jackets", "Suits & Blazers", "Sportswear"],
        "Kids’ Clothing": ["Boys Wear", "Girls Wear", "School Wear", "Sleepwear", "Sportswear"],
        "Shoes": ["Men’s Shoes", "Women’s Shoes", "Kids’ Shoes", "Sneakers", "Sandals", "Boots", "Formal Shoes"],
        "Bags & Accessories": ["Handbags", "Backpacks", "Wallets", "Luggage", "Sunglasses", "Watches", "Jewelry"]
    },
    "ELECTRONICS": {
        "Mobile Phones": ["Smartphones", "Feature Phones", "Phone Cases", "Chargers", "Power Banks", "Screen Protectors"],
        "Computers": ["Laptops", "Desktop PCs", "Monitors", "Keyboards", "Mice", "Storage Devices"],
        "TV & Entertainment": ["Smart TVs", "Speakers", "Home Theatre", "Streaming Devices"],
        "Gaming": ["Consoles", "Controllers", "Games", "Gaming Accessories"]
    },
    "HOME & LIVING": {
        "Kitchen & Dining": ["Cookware", "Dinner Sets", "Kitchen Tools", "Storage Containers"],
        "Home Decor": ["Wall Art", "Clocks", "Curtains", "Lighting"],
        "Furniture": ["Sofas", "Beds", "Tables", "Chairs", "Cabinets"]
    },
    "BEAUTY & PERSONAL CARE": {
        "Skincare": ["Face Creams", "Face Wash", "Serums", "Sunscreen"],
        "Makeup": ["Foundation", "Lipstick", "Eye Makeup", "Makeup Tools"],
        "Haircare": ["Shampoo", "Conditioner", "Hair Oil", "Styling Tools"]
    },
    "BABY & KIDS": {
        "Baby Essentials": ["Diapers", "Feeding Bottles", "Baby Clothing", "Strollers"],
        "Toys": ["Educational Toys", "Dolls", "RC Toys", "Board Games"]
    },
    "AUTOMOTIVE": {
        "Car Accessories": ["Seat Covers", "Floor Mats", "Car Electronics", "Car Care"]
    },
    "GROCERIES": {
        "Food Items": ["Rice", "Spices", "Snacks", "Beverages"]
    },
    "Custom": {}
};

const CATEGORIES = Object.keys(CATEGORIES_HIERARCHY);

const SIZES = ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"];
const UOMS = [
    "Piece", "Pair", "Set", "Kg", "Gram", "Litre", "ML", "Pack", "Box", "Dozon",
    "Metre", "Yard", "Foot", "Inch", "Sq Ft", "Roll", "Bundle", "Bag", "Bottle", "Can",
    "Carton", "Pallet", "Unit", "Service", "Hour", "Day", "Month"
];

const DELIVERY_OPTIONS = ["1-3 days", "1-5 days", "1-7 days", "1-14 days", "1-21 days", "1-30 days"];
const RETURN_OPTIONS = ["1 day", "2 days", "3 days", "4 days", "5 days", "6 days", "7 days", "14 days", "30 days", "No Return"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = Array.from({ length: 31 }, (_, i) => (i + 1).toString());

const PAYMENT_METHODS = [
    { id: 'wallet', name: 'Rupieer Payments', icon: 'wallet-outline' },
    { id: 'cod', name: 'Cash on Delivery', icon: 'cash-outline' },
    { id: 'card', name: 'Credit/Debit Card', icon: 'card-outline' }
];

const COUNTRIES = [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
    "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi",
    "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic",
    "Denmark", "Djibouti", "Dominica", "Dominican Republic",
    "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia",
    "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana",
    "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
    "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea, North", "Korea, South", "Kosovo", "Kuwait", "Kyrgyzstan",
    "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
    "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar",
    "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia", "Norway", "Oman",
    "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar",
    "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
    "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu",
    "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan",
    "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe", "Worldwide"
];

const COLORS = [
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

export default function AddProductModal({ onClose, onSuccess, initialData }: AddProductModalProps) {
    const [loading, setLoading] = useState(false);
    const [selectedImages, setSelectedImages] = useState<(File | null)[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [imageColors, setImageColors] = useState<string[]>([]);
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [showSuccessPopup, setShowSuccessPopup] = useState(false);
    const [openPicker, setOpenPicker] = useState<{ type: string, field: string, options: string[], title: string, value: string, manualQuery?: string } | null>(null);
    const [tempSelections, setTempSelections] = useState<string[]>([]);
    const [showModeSelection, setShowModeSelection] = useState(false);
    const [showSourceSelection, setShowSourceSelection] = useState(false);
    const [showLinkInput, setShowLinkInput] = useState(false);
    const [imageLink, setImageLink] = useState("");
    const [uploadMode, setUploadMode] = useState<'single' | 'variants' | null>(null);
    const [imageSource, setImageSource] = useState<'file' | 'link' | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState({
        description: "",
        title: "",
        category: "",
        subCategory: "",
        manualCategory: "",
        price: "",
        promoPrice: "",
        warranty: "No Warranty",
        customWarranty: "",
        returnPolicy: "",
        returnDate: "",
        deliveryTime: "",
        deliveryMonth: "",
        deliveryDay: "",
        resellCommission: "",
        resellCommissionPercentage: "",
        googerCommission: "0",
        productDiscount: "0",
        paymentMethods: ['wallet'] as string[],
        shipping: [{ country: "Sri Lanka", charge: "0", date: "" }] as { country: string, charge: string, date: string }[],
        unifiedShipping: false,
        unifiedCharge: "",
        unifiedDate: "",
        level3Category: "",
    });

    const [variants, setVariants] = useState<any[]>([]);

    useEffect(() => {
        if (initialData) {
            // Helper to safe-parse JSON if string, or return fallback
            const safeParse = (data: any, fallback: any) => {
                if (!data) return fallback;
                if (typeof data === 'string') {
                    try {
                        return JSON.parse(data);
                    } catch (e) {
                        return fallback;
                    }
                }
                return data;
            };

            const shippingData = safeParse(initialData.shipping_info, {});
            const returnData = safeParse(initialData.return_policy, {});
            const deliveryData = safeParse(initialData.delivery_info, {});
            const commissionData = safeParse(initialData.commission_info, {});
            const paymentData = safeParse(initialData.payment_methods, []);

            setFormData({
                description: initialData.description || "",
                title: initialData.title || "",
                category: initialData.category || "",
                subCategory: initialData.sub_category || "",
                manualCategory: initialData.manual_category || "",
                price: initialData.price || "",
                promoPrice: initialData.promoPrice || "",
                warranty: initialData.warranty || "No Warranty",
                customWarranty: initialData.customWarranty || "",
                returnPolicy: returnData?.text || "",
                returnDate: returnData?.date || "",
                deliveryTime: deliveryData?.time || "",
                deliveryMonth: deliveryData?.month || "",
                deliveryDay: deliveryData?.day || "",
                resellCommission: commissionData?.resell_amount || "",
                resellCommissionPercentage: commissionData?.resell_percentage || "",
                googerCommission: commissionData?.googer_commission || "0",
                productDiscount: commissionData?.discount || "0",
                paymentMethods: Array.isArray(paymentData) ? (paymentData.includes('wallet') ? paymentData : ['wallet', ...paymentData]) : ['wallet'],
                shipping: Array.isArray(shippingData?.rates) ? shippingData.rates : [{ country: "Sri Lanka", charge: "0", date: "" }],
                unifiedShipping: shippingData?.unified || false,
                unifiedCharge: shippingData?.charge || "",
                unifiedDate: shippingData?.date || "",
                level3Category: initialData.level3_category || "",
            });

            if (initialData.image_url && typeof initialData.image_url === 'string') {
                const imgUrl = initialData.image_url;
                setPreviews([imgUrl.includes('uploads') ? `/uploads/${imgUrl.split(/[\\/]/).pop()}` : imgUrl]);
                try {
                    const variantsData = safeParse(initialData.variants, []);
                    if (Array.isArray(variantsData) && variantsData.length > 0) {
                        // Detect mode: if all have same color and same selections, it's single
                        const colors = variantsData.map((v: any) => v.color || "None");
                        const uniqueColors = new Set(colors.filter(c => c !== "None")).size;
                        const firstSelections = JSON.stringify(variantsData[0].selections || []);
                        const hasDifferentVariants = variantsData.some((v: any) => JSON.stringify(v.selections || []) !== firstSelections);

                        if (uniqueColors > 1 || hasDifferentVariants) {
                            setUploadMode('variants');
                        } else if (variantsData.length > 0) {
                            setUploadMode('single');
                        }

                        setImageColors(variantsData.map((v: any) => v.color || "None"));
                        setVariants(variantsData.map((v: any) => ({
                            promo_price: v.promo_price || "",
                            type: v.type || "Size",
                            selections: v.selections || (v.selection ? [{ value: v.selection, stock: v.stock || "0" }] : []),
                            quantity: v.quantity || "1"
                        })));
                    } else {
                        setImageColors(["None"]);
                        setVariants([{
                            promo_price: "",
                            type: "Size",
                            selections: [],
                            quantity: "1"
                        }]);
                    }
                } catch {
                    setImageColors([""]);
                    setVariants([{
                        price: "",
                        promo_price: "",
                        type: "Size",
                        selection: "",
                        quantity: "1",
                        stock: ""
                    }]);
                }
            }
        }
    }, [initialData]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const oldMainPromo = formData.promoPrice;

        setFormData(prev => {
            const updated = { ...prev, [name]: value };

            // Recalculate commissions when prices or percentages change
            if (name === 'promoPrice' || name === 'resellCommissionPercentage') {
                const basePrice = parseFloat(updated.promoPrice) || 0;
                const percent = parseFloat(updated.resellCommissionPercentage) || 0;
                if (percent > 0) {
                    updated.resellCommission = ((basePrice * percent) / 100).toFixed(2);
                }
            }

            return updated;
        });

        // Auto-populate all variant promo prices that were following the main price
        if (name === 'promoPrice') {
            setVariants(prev => {
                const newVariants = [...prev];
                newVariants.forEach(v => {
                    if (!v.promo_price || v.promo_price === oldMainPromo) {
                        v.promo_price = value;
                    }
                });
                return newVariants;
            });
        }
    };

    const handleAddImagesClick = () => {
        if (previews.length >= 5) {
            alert("Maximum 5 images allowed.");
            return;
        }

        // Ensure clean state for selection modals
        setShowSourceSelection(false);
        setShowLinkInput(false);

        if (!uploadMode) {
            setShowModeSelection(true);
        } else {
            setShowSourceSelection(true);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setShowSourceSelection(false); // Close selection popup immediately
            const files = Array.from(e.target.files);
            const remainingSpace = 5 - previews.length;
            const filesToAdd = files.slice(0, remainingSpace);

            if (files.length > remainingSpace) {
                alert("Maximum 5 images allowed.");
            }

            // We'll add them one by one in the reader loop to keep sync

            filesToAdd.forEach((file, index) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const previewUrl = reader.result as string;
                    setPreviews(prev => {
                        const newPreviews = [...prev, previewUrl];
                        setActiveImageIndex(newPreviews.length - 1); // Auto preview inside big box
                        return newPreviews;
                    });
                    setSelectedImages(prev => [...prev, file]);

                    // Single Post: only one variant/color set for all images
                    if (uploadMode === 'single') {
                        if (previews.length === 0 && index === 0) {
                            // Only add one variant if it's the very first image
                            setImageColors(prev => [...prev, "None"]);
                            setVariants(prev => [...prev, {
                                promo_price: "",
                                type: "Size",
                                selections: [],
                                quantity: "1"
                            }]);
                        } else {
                            // Subsequent images in Single Post don't get new variants, they share the first one.
                            setImageColors(prev => [...prev, "None"]);
                            // Don't add a new variant object for extra views in single mode
                        }
                    } else {
                        setImageColors(prev => [...prev, "None"]);
                        setVariants(prev => [...prev, {
                            promo_price: "",
                            type: "Size",
                            selections: [],
                            quantity: "1"
                        }]);
                    }
                };
                reader.readAsDataURL(file);
            });
        }
    };

    const handleAddImageLink = () => {
        if (!imageLink) return;

        let finalUrl = imageLink;

        // YouTube Thumbnail extraction
        if (imageLink.includes('youtube.com') || imageLink.includes('youtu.be')) {
            const videoId = imageLink.includes('v=') ? imageLink.split('v=')[1]?.split('&')[0] : imageLink.split('/').pop();
            if (videoId) {
                finalUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
            }
        }

        // Google Image Search extraction
        else if (imageLink.includes('google.com/imgres')) {
            try {
                const urlObj = new URL(imageLink);
                const googleImgUrl = urlObj.searchParams.get('imgurl');
                if (googleImgUrl) {
                    finalUrl = decodeURIComponent(googleImgUrl);
                }
            } catch (e) {
                console.error("Error parsing Google Image URL:", e);
            }
        }

        const addImage = (url: string) => {
            const remainingSpace = 5 - previews.length;
            if (remainingSpace <= 0) {
                alert("Maximum 5 images allowed.");
                return;
            }

            const currentPreviewsCount = previews.length;
            setPreviews(prev => [...prev, url]);
            setSelectedImages(prev => [...prev, null]);

            if (uploadMode === 'single') {
                if (currentPreviewsCount === 0) {
                    setImageColors(prev => [...prev, "None"]);
                    setVariants(prev => [...prev, {
                        promo_price: "",
                        type: "Size",
                        selections: [],
                        quantity: "1"
                    }]);
                } else {
                    setImageColors(prev => [...prev, "None"]);
                    // Single mode duplicates are handled by indices now
                }
            } else {
                setImageColors(prev => [...prev, "None"]);
                setVariants(prev => [...prev, {
                    promo_price: "",
                    type: "Size",
                    selections: [],
                    quantity: "1"
                }]);
            }

            setImageLink("");
            setActiveImageIndex(currentPreviewsCount); // Auto preview inside big box
            setShowLinkInput(false); // Close link input after adding so user can choose source for next image
            setShowSourceSelection(false); // Also ensure source selection is gone
        };

        // Try to validate as image
        const img = new (window as any).Image();
        img.onload = () => addImage(finalUrl);
        img.onerror = () => {
            // If it's not a direct image but we handled it (like YT), add it anyway
            if (finalUrl !== imageLink) {
                addImage(finalUrl);
            } else {
                alert("Invalid image URL. Please ensure it's a direct link to an image.");
            }
        };
        img.src = finalUrl;
    };

    const removeImage = (index: number) => {
        setSelectedImages(prev => prev.filter((_, i) => i !== index));
        setPreviews(prev => prev.filter((_, i) => i !== index));
        // We don't necessarily want to remove the variant if it was manually added, 
        // but since images and variants were 1:1, let's keep it for now but be careful.
        // Actually, let's just null out the image index in the variant.
        setVariants(prev => prev.filter((_, i) => i !== index));
        setImageColors(prev => prev.filter((_, i) => i !== index));

        if (activeImageIndex >= index && activeImageIndex > 0) {
            setActiveImageIndex(activeImageIndex - 1);
        }
    };

    const addManualVariant = (colorName: string = "None") => {
        const newCount = variants.length + 1;
        setVariants(prev => [...prev, {
            promo_price: formData.promoPrice || "",
            type: "Size",
            selections: [],
            quantity: "1",
            isManual: true
        }]);
        setImageColors(prev => [...prev, colorName]);
        setActiveImageIndex(newCount - 1);
    };

    const assignColorToActiveImage = (colorName: string) => {
        if (variants.length === 0) return;
        const newColors = [...imageColors];

        if (uploadMode === 'single') {
            // Apply to all in single mode
            newColors.fill(colorName);
        } else {
            newColors[activeImageIndex] = colorName;
        }

        setImageColors(newColors);
    };

    const handleVariantChange = (index: number, field: string, value: string) => {
        const currentVariants = Array.isArray(variants) ? variants : [];
        if (index < 0) return;

        let newVariants = [...currentVariants];

        if (uploadMode === 'single') {
            // Apply modification to all variants in single mode
            newVariants = newVariants.map(v => ({ ...v, [field]: value }));
        } else {
            // Ensure the variant exists if we're targeting it
            if (!newVariants[index]) {
                newVariants[index] = {
                    promo_price: "",
                    type: "Size",
                    selection: "",
                    quantity: "1",
                    stock: ""
                };
            }
            newVariants[index] = { ...newVariants[index], [field]: value };
        }

        setVariants(newVariants);
        setOpenPicker(null);
    };

    const handleFormChange = (field: string, value: string) => {
        setFormData(prev => {
            const updated = { ...prev, [field]: value };
            if (field === 'category') {
                updated.subCategory = "";
                updated.level3Category = "";
            } else if (field === 'subCategory') {
                updated.level3Category = "";
                // Automatic 5% Googer Commission when a Level 2 subcategory is chosen
                updated.googerCommission = "5";
            }
            return updated;
        });
        setOpenPicker(null);
    };

    const cycleColor = (direction: 'next' | 'prev') => {
        if (previews.length === 0) return;
        const currentColor = imageColors[activeImageIndex];
        const currentIndex = COLORS.findIndex(c => c.name === currentColor);

        let nextIndex;
        if (direction === 'next') {
            nextIndex = (currentIndex + 1) % COLORS.length;
        } else {
            nextIndex = currentIndex === -1 ? 0 : (currentIndex - 1 + COLORS.length) % COLORS.length;
        }

        assignColorToActiveImage(COLORS[nextIndex].name);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const data = new FormData();

            // Basic fields
            data.append('title', formData.title || formData.description.split('\n')[0].substring(0, 60) || 'New Listing');
            data.append('description', formData.description);
            data.append('category', formData.category);
            data.append('sub_category', formData.subCategory);
            data.append('level3_category', formData.level3Category);
            data.append('manual_category', formData.manualCategory);

            // Prices
            data.append('price', formData.price);
            data.append('promo_price', formData.promoPrice);
            if (Array.isArray(variants) && variants.length > 0) {
                data.append('stock', variants[0].stock || "0");
            }

            // Advanced JSON fields
            data.append('warranty_data', JSON.stringify({
                warranty: formData.warranty,
                custom: formData.customWarranty
            }));

            data.append('payment_data', JSON.stringify(formData.paymentMethods));

            data.append('shipping_data', JSON.stringify({
                rates: formData.shipping,
                unified: formData.unifiedShipping,
                charge: formData.unifiedCharge,
                date: formData.unifiedDate
            }));

            data.append('return_data', JSON.stringify({
                text: formData.returnPolicy,
                date: formData.returnDate
            }));

            data.append('delivery_data', JSON.stringify({
                time: formData.deliveryTime,
                month: formData.deliveryMonth,
                day: formData.deliveryDay
            }));

            data.append('commission_data', JSON.stringify({
                resell_amount: formData.resellCommission,
                resell_percentage: formData.resellCommissionPercentage,
                googer_commission: formData.googerCommission,
                discount: formData.productDiscount
            }));

            // Variants (Colors and detailed data associated with each image/group)
            const submissionVariants = variants.map((v, i) => ({
                color: imageColors[i] || "None",
                index: i,
                image_url: previews[i] || null,
                ...v
            }));
            data.append('variants_data', JSON.stringify(submissionVariants));

            // Multiple Images (only real files)
            if (selectedImages.length > 0) {
                selectedImages.forEach(item => {
                    if (item instanceof File) {
                        data.append('images', item);
                    }
                });
            }

            if (initialData) {
                await marketService.updateItem(initialData.id, data);
            } else {
                await marketService.createItem(data);
            }

            // Dispatch notification for Topbar
            window.dispatchEvent(new CustomEvent('add-notification', {
                detail: {
                    id: Date.now(),
                    title: initialData ? 'Product Updated' : 'Product Published',
                    message: "Success",
                    type: 'success',
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }
            }));

            setShowSuccessPopup(true);

            // Wait a bit before closing so user can see the message
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 3000);
        } catch (error: any) {
            console.error("Error saving product:", error);
            alert(error.message || "Failed to save product");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-[#121212] border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] w-[95%] md:w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-full max-h-[92vh] md:max-h-[90vh] animate-in zoom-in-95 duration-300">

                {/* Left Panel: Images & Colors */}
                <div className="w-full md:w-[40%] bg-[#1a1a1a] p-3 md:p-8 flex flex-col gap-2 md:gap-6 border-b md:border-b-0 md:border-r border-white/5 shrink-0">
                    <div className="flex items-center justify-between px-1 md:px-2">
                        <div className="text-left">
                            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">Add Listing</h2>
                            <p className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-widest font-black">{previews.length}/5 Images • {variants.length} Variants</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-4">
                        {/* Main Preview Area (ABOVE) */}
                        <div
                            onClick={handleAddImagesClick}
                            className={`relative w-full h-[140px] md:h-auto md:aspect-square rounded-[1.2rem] md:rounded-[2.5rem] overflow-hidden transition-all cursor-pointer group shrink-0
                                ${previews.length > 0 ? 'border-0 shadow-2xl' : 'border-2 border-dashed border-blue-500/30 hover:border-blue-500/50 bg-blue-500/5'}`}
                        >
                            {previews.length > 0 ? (
                                <>
                                    <Image
                                        src={previews[activeImageIndex] || previews[0]}
                                        alt="Preview"
                                        fill
                                        className="object-cover transition-all duration-500 scale-100 group-hover:scale-105"
                                    />

                                    {/* Slider Navigation Arrows - Always Visible & Enhanced (Point 6) */}
                                    {previews.length > 1 && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveImageIndex(prev => (prev === 0 ? previews.length - 1 : prev - 1));
                                                }}
                                                className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/80 border border-white/30 text-white flex items-center justify-center shadow-2xl transition-all hover:bg-white hover:text-black hover:scale-110 active:scale-95 z-30"
                                            >
                                                <IonIcon name="chevron-back" className="text-xl" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveImageIndex(prev => (prev === previews.length - 1 ? 0 : prev + 1));
                                                }}
                                                className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/80 border border-white/30 text-white flex items-center justify-center shadow-2xl transition-all hover:bg-white hover:text-black hover:scale-110 active:scale-95 z-30"
                                            >
                                                <IonIcon name="chevron-forward" className="text-xl" />
                                            </button>
                                        </>
                                    )}

                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-80 transition-opacity flex items-center justify-center pointer-events-none group-hover:pointer-events-auto">
                                        <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
                                            <IonIcon name="camera" className="text-2xl text-white" />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/[0.02]">
                                    {uploadMode === 'variants' && imageColors[activeImageIndex] && imageColors[activeImageIndex] !== "None" ? (
                                        <div
                                            className="w-full h-full flex items-center justify-center opacity-40"
                                            style={{ backgroundColor: COLORS.find(c => c.name === imageColors[activeImageIndex])?.hex || (imageColors[activeImageIndex]?.startsWith('#') ? imageColors[activeImageIndex] : 'transparent') }}
                                        >
                                            <div className="flex flex-col items-center gap-3">
                                                <IonIcon name="image-outline" className="text-5xl text-white/50 animate-pulse" />
                                                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Add Image for {imageColors[activeImageIndex]}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-4 group-hover:scale-110 transition-transform">
                                            <div className="w-16 h-16 rounded-full border-2 border-dashed border-blue-500/30 flex items-center justify-center bg-blue-500/5">
                                                <IonIcon name="camera" className="text-3xl text-blue-400 opacity-60" />
                                            </div>
                                            <div className="text-center">
                                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">Choose Mode</span>
                                                <p className="text-[8px] text-blue-500/50 font-bold uppercase mt-1 tracking-tighter italic">Wait, first choice required</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleImageChange}
                                className="hidden"
                                accept="image/*"
                                multiple
                            />
                        </div>

                        {/* Thumbnails Row (BELOW) - Responsive Sideways Slider */}
                        <div className="relative group/thumbs">
                            {previews.length > 3 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const el = document.getElementById('thumb-scroll-area');
                                        if (el) el.scrollBy({ left: -100, behavior: 'smooth' });
                                    }}
                                    className="absolute -left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#1a1a1a] border border-white/10 text-white flex items-center justify-center z-10 shadow-xl opacity-0 group-hover/thumbs:opacity-100 transition-opacity"
                                >
                                    <IonIcon name="chevron-back" className="text-xs" />
                                </button>
                            )}

                            <div
                                id="thumb-scroll-area"
                                className="flex items-start gap-3 overflow-x-auto pt-2 pb-1 custom-scrollbar no-scrollbar px-1 scroll-smooth"
                            >
                                {(uploadMode === 'variants' ? variants : previews).map((_, i) => (
                                    <div key={i} className="flex flex-col items-center gap-1.5 shrink-0 group/unit">
                                        <div
                                            onClick={() => setActiveImageIndex(i)}
                                            className={`relative w-12 h-12 md:w-16 md:h-16 rounded-[0.8rem] md:rounded-[1.2rem] overflow-hidden transition-all cursor-pointer border-2 flex items-center justify-center bg-white/5
                                                    ${activeImageIndex === i
                                                    ? 'border-blue-500 scale-105 shadow-xl ring-4 ring-blue-500/10'
                                                    : 'border-white/5 opacity-40 hover:opacity-100'}`}
                                        >
                                            {previews[i] ? (
                                                <div className="relative w-full h-full">
                                                    <Image src={previews[i]} alt={`Thumb ${i}`} fill className="object-cover" />
                                                </div>
                                            ) : (
                                                <div
                                                    className="w-full h-full"
                                                    style={{ backgroundColor: COLORS.find(c => c.name === imageColors[i])?.hex || (imageColors[i]?.startsWith('#') ? imageColors[i] : 'transparent') }}
                                                />
                                            )}

                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center border border-black shadow-lg transition-all active:scale-90 hover:bg-red-500 z-10"
                                            >
                                                <IonIcon name="close" className="text-[10px] font-black" />
                                            </button>
                                        </div>

                                        <div className="flex flex-col items-center gap-1">
                                            <div
                                                onClick={() => {
                                                    setActiveImageIndex(i);
                                                    setOpenPicker({ type: 'color', field: 'color', options: COLORS.map(c => c.name), title: 'Choose Color', value: imageColors[i] });
                                                }}
                                                className={`px-2 py-0.5 rounded-full border flex items-center gap-1.5 cursor-pointer transition-all
                                                    ${activeImageIndex === i ? 'bg-blue-600 border-blue-400' : 'bg-white/[0.05] border-white/10 hover:border-blue-500/50'}`}
                                            >
                                                <div
                                                    className="w-1.5 h-1.5 rounded-full shadow-inner ring-1 ring-white/20"
                                                    style={{ backgroundColor: COLORS.find(c => c.name === imageColors[i])?.hex || (imageColors[i]?.startsWith('#') ? imageColors[i] : '#333') }}
                                                />
                                                <span className={`text-[6px] font-black uppercase tracking-tight ${activeImageIndex === i ? 'text-white' : 'text-slate-400'}`}>
                                                    {imageColors[i] || "NONE"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {previews.length < 5 && (
                                    <div className="flex flex-col items-center justify-center h-full gap-2">
                                        <button
                                            type="button"
                                            onClick={handleAddImagesClick}
                                            className="w-12 h-12 md:w-16 md:h-16 flex items-center justify-center transition-all transform hover:scale-110 shrink-0 border-2 border-dashed border-blue-500/50 rounded-[1rem] bg-blue-500/10 hover:bg-blue-500/20 hover:border-blue-500 shadow-lg shadow-blue-500/5"
                                        >
                                            <IonIcon name="add" className="text-xl text-blue-400" />
                                        </button>
                                        <span className="text-[6px] font-black text-blue-500/40 uppercase">Add New</span>
                                    </div>
                                )}
                            </div>

                            {previews.length > 3 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const el = document.getElementById('thumb-scroll-area');
                                        if (el) el.scrollBy({ left: 100, behavior: 'smooth' });
                                    }}
                                    className="absolute -right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#1a1a1a] border border-white/10 text-white flex items-center justify-center z-10 shadow-xl opacity-0 group-hover/thumbs:opacity-100 transition-opacity"
                                >
                                    <IonIcon name="chevron-forward" className="text-xs" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Panel: Form Details */}
                <form
                    onSubmit={handleSubmit}
                    className="flex-1 p-4 md:p-8 overflow-y-auto custom-scrollbar flex flex-col bg-gradient-to-b from-transparent to-white/[0.02]"
                >
                    <div className="flex flex-col gap-5 md:gap-8">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-lg md:text-xl font-bold text-white tracking-tight italic">Product Information</h2>
                                <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black">Fill all fields to publish</p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
                            >
                                <IonIcon name="close" className="text-xl" />
                            </button>
                        </div>

                        <div className="flex flex-col gap-5">


                            <div className="flex flex-col gap-6">
                                {/* Order: Description, Product Name, Category, Price */}

                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 md:mb-1.5 flex items-center gap-1">
                                        Product Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        required
                                        type="text"
                                        name="title"
                                        value={formData.title}
                                        onChange={handleInputChange}
                                        className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2 md:py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 transition-all font-bold"
                                        placeholder="e.g. Nike Air Max"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 md:mb-1.5">Description (Optional)</label>
                                    <textarea
                                        name="description"
                                        value={formData.description}
                                        onChange={handleInputChange}
                                        rows={2}
                                        className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-1.5 md:py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 resize-none transition-all"
                                        placeholder="Detailed product description..."
                                    />
                                </div>

                                <div className="flex flex-col md:flex-row gap-4">
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 md:mb-1.5 flex items-center gap-1">
                                            Category <span className="text-red-500">*</span>
                                        </label>
                                        <div className="flex flex-col gap-2">
                                            {formData.category === 'Custom' || (formData.category && !CATEGORIES.includes(formData.category)) ? (
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={formData.category === 'Custom' ? '' : formData.category}
                                                        onChange={(e) => handleFormChange('category', e.target.value)}
                                                        className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 transition-all pr-10"
                                                        placeholder="Type category..."
                                                        autoFocus
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleFormChange('category', '')}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                                    >
                                                        <IonIcon name="close-circle" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div
                                                    onClick={() => setOpenPicker({ type: 'form', field: 'category', options: CATEGORIES, title: 'Category', value: formData.category })}
                                                    className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white flex items-center justify-between cursor-pointer focus:ring-1 focus:ring-white/30 transition-all"
                                                >
                                                    <span className="truncate">{formData.category || "Select Category"}</span>
                                                    <IonIcon name="chevron-down" className="text-gray-500" />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 md:mb-1.5 flex items-center gap-1">
                                            Sub Category (Level 2) <span className="text-red-500">*</span>
                                        </label>
                                        <div className="flex flex-col gap-2">
                                            {(() => {
                                                const subCatOptions = formData.category ? Object.keys(CATEGORIES_HIERARCHY[formData.category] || {}) : [];
                                                const isCustom = formData.subCategory === 'Custom' || (formData.subCategory && !subCatOptions.includes(formData.subCategory));

                                                if (isCustom) {
                                                    return (
                                                        <div className="relative">
                                                            <input
                                                                type="text"
                                                                value={formData.subCategory === 'Custom' ? '' : formData.subCategory}
                                                                onChange={(e) => handleFormChange('subCategory', e.target.value)}
                                                                className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 transition-all pr-10"
                                                                placeholder="Type sub category..."
                                                                autoFocus
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleFormChange('subCategory', '')}
                                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                                            >
                                                                <IonIcon name="close-circle" />
                                                            </button>
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <div
                                                        onClick={() => setOpenPicker({
                                                            type: 'form',
                                                            field: 'subCategory',
                                                            options: subCatOptions.includes('Custom') ? subCatOptions : [...subCatOptions, 'Custom'],
                                                            title: 'Sub Category (Level 2)',
                                                            value: formData.subCategory
                                                        })}
                                                        className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white flex items-center justify-between cursor-pointer focus:ring-1 focus:ring-white/30 transition-all"
                                                    >
                                                        <span className="truncate">{formData.subCategory || "Select Sub Category"}</span>
                                                        <IonIcon name="chevron-down" className="text-gray-500" />
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    <div className="flex-1">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 md:mb-1.5">
                                            Sub Category (Level 3)
                                        </label>
                                        <div className="flex flex-col gap-2">
                                            {(() => {
                                                const level3CatOptions = (formData.category && formData.subCategory) ? (CATEGORIES_HIERARCHY[formData.category]?.[formData.subCategory] || []) : [];
                                                const isCustom = formData.level3Category === 'Custom' || (formData.level3Category && !level3CatOptions.includes(formData.level3Category));

                                                if (isCustom) {
                                                    return (
                                                        <div className="relative">
                                                            <input
                                                                type="text"
                                                                value={formData.level3Category === 'Custom' ? '' : formData.level3Category}
                                                                onChange={(e) => handleFormChange('level3Category', e.target.value)}
                                                                className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 transition-all pr-10"
                                                                placeholder="Type level 3 category..."
                                                                autoFocus
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleFormChange('level3Category', '')}
                                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                                            >
                                                                <IonIcon name="close-circle" />
                                                            </button>
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <div
                                                        onClick={() => setOpenPicker({
                                                            type: 'form',
                                                            field: 'level3Category',
                                                            options: level3CatOptions.includes('Custom') ? level3CatOptions : [...level3CatOptions, 'Custom'],
                                                            title: 'Sub Category (Level 3)',
                                                            value: formData.level3Category
                                                        })}
                                                        className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white flex items-center justify-between cursor-pointer focus:ring-1 focus:ring-white/30 transition-all"
                                                    >
                                                        <span className="truncate">{formData.level3Category || "Select Level 3 Category"}</span>
                                                        <IonIcon name="chevron-down" className="text-gray-500" />
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>



                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 md:mb-1.5 flex items-center gap-1">
                                            Main Price (R) <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            required
                                            type="number"
                                            name="price"
                                            value={formData.price}
                                            onChange={handleInputChange}
                                            className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2 md:py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 transition-all font-bold line-through decoration-red-500/50"
                                            placeholder="0.00"
                                            onKeyPress={(e) => {
                                                if (!/[0-9.]/.test(e.key)) e.preventDefault();
                                            }}
                                        />
                                    </div>

                                    <div className="flex-1">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 md:mb-1.5 flex items-center gap-1">
                                            Promo Price (R) <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            required
                                            type="number"
                                            name="promoPrice"
                                            value={formData.promoPrice}
                                            onChange={handleInputChange}
                                            className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2 md:py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 transition-all font-bold"
                                            placeholder="0.00"
                                            onKeyPress={(e) => {
                                                if (!/[0-9.]/.test(e.key)) e.preventDefault();
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>


                        {/* Variant Details: Integrated Image Picker Workflow */}
                        {variants[uploadMode === 'single' ? 0 : activeImageIndex] && (
                            <div className="p-6 rounded-[2.5rem] bg-white/[0.03] border border-white/10 flex flex-col gap-6 shadow-2xl backdrop-blur-sm animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex flex-col">
                                            <h3 className="text-sm font-black text-white italic uppercase tracking-wider">
                                                {uploadMode === 'single' ? 'Product Configuration' : 'Variant Details'}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">
                                                    {uploadMode === 'single' ? 'Settings apply to all views' : `Configuring ${imageColors[activeImageIndex] || "Selected"} Unit`}
                                                </p>
                                                {uploadMode === 'variants' && (
                                                    <div
                                                        className="flex items-center gap-1.5 ml-2 pl-2 border-l border-white/10 cursor-pointer group"
                                                        onClick={() => setOpenPicker({
                                                            type: 'add_variant_color',
                                                            field: 'color',
                                                            options: COLORS.map(c => c.name),
                                                            title: 'Pick Variant Color',
                                                            value: ''
                                                        })}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="w-4 h-4 rounded bg-blue-500/20 border border-blue-500/30 text-blue-400 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all shadow-sm pointer-events-none"
                                                            title="Add Additional Color"
                                                        >
                                                            <IonIcon name="add" className="text-[10px] font-black" />
                                                        </button>
                                                        <span className="text-[8px] text-blue-400/80 font-bold uppercase tracking-widest group-hover:text-blue-300 transition-colors">Add Additional Colors</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            {(variants[uploadMode === 'single' ? 0 : activeImageIndex]?.selections || []).slice(0, 3).map((s: any, idx: number) => (
                                                <div key={idx} className="w-6 h-6 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-[8px] font-bold text-blue-400">
                                                    {s.value.substring(0, 2)}
                                                </div>
                                            ))}
                                            {(variants[uploadMode === 'single' ? 0 : activeImageIndex]?.selections || []).length > 3 && (
                                                <div className="w-6 h-6 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center text-[8px] font-bold text-slate-500">
                                                    +{(variants[uploadMode === 'single' ? 0 : activeImageIndex]?.selections || []).length - 3}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Thumbnail row inside Variant Details */}
                                    <div className="flex gap-2 mb-2 overflow-x-auto pb-2 no-scrollbar">
                                        {(uploadMode === 'variants' ? variants : previews).map((_, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => setActiveImageIndex(idx)}
                                                className={`relative w-12 h-12 rounded-xl flex-shrink-0 cursor-pointer overflow-hidden border-2 transition-all ${activeImageIndex === idx ? 'border-blue-500 scale-105 shadow-lg shadow-blue-500/20' : 'border-white/5 opacity-40 hover:opacity-100'}`}
                                            >
                                                {previews[idx] ? (
                                                    <Image src={previews[idx]} alt="Mini preview" fill className="object-cover" />
                                                ) : (
                                                    <div
                                                        className="w-full h-full"
                                                        style={{ backgroundColor: COLORS.find(c => c.name === imageColors[idx])?.hex || (imageColors[idx]?.startsWith('#') ? imageColors[idx] : 'transparent') }}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                        {previews.length < 5 && (
                                            <button
                                                type="button"
                                                onClick={handleAddImagesClick}
                                                className="w-12 h-12 rounded-xl bg-blue-600/10 border-2 border-dashed border-blue-500/30 flex items-center justify-center text-blue-400 hover:bg-blue-600/20 hover:border-blue-500/50 transition-all flex-shrink-0 shadow-lg shadow-blue-500/5"
                                            >
                                                <IonIcon name="add" className="text-lg" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-5">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                                            Promo Price
                                        </label>
                                        <input
                                            type="number"
                                            value={variants[uploadMode === 'single' ? 0 : activeImageIndex].promo_price}
                                            onChange={(e) => handleVariantChange(uploadMode === 'single' ? 0 : activeImageIndex, 'promo_price', e.target.value)}
                                            className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white mt-1 focus:ring-1 focus:ring-white outline-none transition-all placeholder:text-white/10"
                                            placeholder="Example: 599.00 (Promo Price Box)"
                                            onKeyPress={(e) => {
                                                if (!/[0-9.]/.test(e.key)) e.preventDefault();
                                            }}
                                        />
                                    </div>

                                    <div className="flex flex-col gap-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setOpenPicker({ type: 'variant', field: 'selections', options: SIZES, title: 'Add Sizes', value: '' })}
                                                className="w-full bg-blue-500/5 border border-blue-500/20 rounded-xl py-3 text-[10px] font-black text-blue-400 uppercase tracking-widest hover:bg-blue-500/10 transition-all flex items-center justify-center gap-2"
                                            >
                                                <IonIcon name="resize-outline" />
                                                + Add Sizes
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setOpenPicker({ type: 'variant', field: 'selections', options: UOMS, title: 'Add UOM', value: '' })}
                                                className="w-full bg-blue-500/5 border border-blue-500/20 rounded-xl py-3 text-[10px] font-black text-blue-400 uppercase tracking-widest hover:bg-blue-500/10 transition-all flex items-center justify-center gap-2"
                                            >
                                                <IonIcon name="cube-outline" />
                                                + Add UOM
                                            </button>
                                        </div>


                                    </div>

                                    {/* Selection List with Individual Stock (STOCK ALWAYS VISIBLE - Point 4) */}
                                    <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                        {(variants[activeImageIndex].selections || []).map((sel: any, sIdx: number) => (
                                            <div key={sIdx} className="flex flex-col gap-2 bg-black/40 border border-white/5 p-4 rounded-2xl animate-in slide-in-from-right-4 duration-300">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-black text-slate-600 uppercase mb-0.5">Variant Selection</span>
                                                        <span className="text-xs font-bold text-white">{sel.value}</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const newVariants = [...variants];
                                                            const targetIdx = uploadMode === 'single' ? 0 : activeImageIndex;
                                                            newVariants[targetIdx].selections = newVariants[targetIdx].selections.filter((_: any, i: number) => i !== sIdx);
                                                            setVariants(newVariants);
                                                        }}
                                                        className="w-7 h-7 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all shadow-sm"
                                                    >
                                                        <IonIcon name="trash-outline" className="text-xs" />
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Specific Details</span>
                                                        <input
                                                            type="text"
                                                            value={sel.detail || ""}
                                                            onChange={(e) => {
                                                                let newVariants = [...variants];
                                                                const targetIdx = uploadMode === 'single' ? 0 : activeImageIndex;
                                                                if (uploadMode === 'single') {
                                                                    newVariants = newVariants.map(v => {
                                                                        if (v.selections && v.selections[sIdx]) {
                                                                            v.selections[sIdx].detail = e.target.value;
                                                                        }
                                                                        return v;
                                                                    });
                                                                } else {
                                                                    newVariants[targetIdx].selections[sIdx].detail = e.target.value;
                                                                }
                                                                setVariants(newVariants);
                                                            }}
                                                            className="w-full bg-slate-800/10 border border-white/5 rounded-xl px-3 py-2 md:py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-white/30 placeholder:text-white/10"
                                                            placeholder="e.g. 20 to 22"
                                                        />
                                                    </div>

                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[8px] font-black text-slate-600 uppercase mb-1 block">In Stock</span>
                                                        <input
                                                            type="number"
                                                            value={sel.stock}
                                                            onChange={(e) => {
                                                                let newVariants = [...variants];
                                                                const targetIdx = uploadMode === 'single' ? 0 : activeImageIndex;
                                                                if (uploadMode === 'single') {
                                                                    newVariants = newVariants.map(v => {
                                                                        if (v.selections && v.selections[sIdx]) {
                                                                            v.selections[sIdx].stock = e.target.value;
                                                                        }
                                                                        return v;
                                                                    });
                                                                } else {
                                                                    newVariants[targetIdx].selections[sIdx].stock = e.target.value;
                                                                }
                                                                setVariants(newVariants);
                                                            }}
                                                            className="w-full bg-slate-800/10 border border-white/5 rounded-xl px-3 py-2 md:py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-white/30 placeholder-white/10"
                                                            placeholder="Amount"
                                                            onKeyPress={(e) => {
                                                                if (!/[0-9]/.test(e.key)) e.preventDefault();
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Point 5: Clickable summary chips for selected variants */}
                                    {(variants[uploadMode === 'single' ? 0 : activeImageIndex]?.selections || []).length > 0 && (
                                        <div className="mt-4 border-t border-white/5 pt-4">
                                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-2">Applied Variants Summary</span>
                                            <div className="flex flex-wrap gap-2">
                                                {(variants[uploadMode === 'single' ? 0 : activeImageIndex]?.selections || []).map((sel: any, sIdx: number) => (
                                                    <div
                                                        key={sIdx}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const newVariants = [...variants];
                                                            const targetIdx = uploadMode === 'single' ? 0 : activeImageIndex;
                                                            newVariants[targetIdx].selections = newVariants[targetIdx].selections.filter((_: any, idx: number) => idx !== sIdx);
                                                            setVariants(newVariants);
                                                        }}
                                                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-white uppercase tracking-tight flex items-center gap-2 cursor-pointer hover:bg-red-500/20 hover:border-red-500/50 transition-all group/chip"
                                                    >
                                                        <span>{sel.value} ({sel.stock})</span>
                                                        <IonIcon name="close" className="text-slate-500 group-hover/chip:text-red-500 transition-colors" />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="h-px w-full bg-white/5" />

                        <div className="flex flex-col gap-6">
                            <h3 className="text-lg font-bold text-white italic">Logistics</h3>


                            <div className="bg-slate-800/20 p-5 rounded-[2rem] border border-white/5">
                                <div className="flex items-center justify-between mb-4">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Shipping Rates</label>
                                    <div
                                        onClick={() => setFormData(prev => ({ ...prev, unifiedShipping: !prev.unifiedShipping }))}
                                        className="flex items-center gap-2 cursor-pointer group"
                                    >
                                        <span className="text-[8px] font-black text-slate-500 uppercase group-hover:text-white transition-colors">Unified Fee</span>
                                        <div className={`w-8 h-4 rounded-full relative transition-all ${formData.unifiedShipping ? 'bg-white' : 'bg-slate-700'}`}>
                                            <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${formData.unifiedShipping ? 'right-0.5 bg-black' : 'left-0.5 bg-slate-400'}`} />
                                        </div>
                                    </div>
                                </div>

                                {formData.unifiedShipping && (
                                    <div className="flex flex-col gap-4 mb-4 p-4 bg-white/5 rounded-2xl border border-white/10 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl w-fit">
                                            <button
                                                type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, unifiedCharge: '0' }))}
                                                className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${formData.unifiedCharge === '0' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}
                                            >
                                                Free Shipping
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (formData.unifiedCharge === '0') setFormData(prev => ({ ...prev, unifiedCharge: '1' }));
                                                }}
                                                className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${formData.unifiedCharge !== '0' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}
                                            >
                                                Manual
                                            </button>
                                        </div>

                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <label className="text-[9px] text-white uppercase font-black tracking-wider mb-1 block">Global Price (R)</label>
                                                <input
                                                    type="number"
                                                    value={formData.unifiedCharge}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, unifiedCharge: e.target.value }))}
                                                    disabled={formData.unifiedCharge === '0'}
                                                    className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:ring-1 focus:ring-white/30 outline-none disabled:opacity-50"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                            <div className="flex-[1.5]">
                                                <label className="text-[9px] text-white uppercase font-black tracking-wider mb-1 block">Global Shipping Date</label>
                                                <div
                                                    onClick={() => setOpenPicker({ type: 'form', field: 'unifiedDate', options: DELIVERY_OPTIONS, title: 'Shipping Date', value: formData.unifiedDate })}
                                                    className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white flex justify-between items-center cursor-pointer"
                                                >
                                                    <span>{formData.unifiedDate || "Select"}</span>
                                                    <IonIcon name="chevron-down" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setOpenPicker({ type: 'shipping', field: '', options: COUNTRIES.filter(c => !(formData.shipping || []).find(s => s.country === c)), title: 'Add Countries', value: '' })}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 text-[10px] font-black text-gray-300 uppercase tracking-widest mb-3 hover:bg-white/10 transition-all shadow-sm"
                                >
                                    + Add Shipping Country
                                </button>

                                <div className={`mt-2 overflow-y-auto custom-scrollbar pr-1 ${formData.unifiedShipping ? 'max-h-[120px]' : 'max-h-[380px] flex flex-col gap-2'}`}>
                                    {formData.unifiedShipping ? (
                                        <div className="flex flex-wrap gap-1.5 p-2 bg-white/[0.02] rounded-xl border border-white/5">
                                            {(formData.shipping || []).map((s, i) => (
                                                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-[9px] font-bold text-white group animate-in zoom-in-90 duration-200">
                                                    <span>#{s.country}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData(prev => ({ ...prev, shipping: prev.shipping.filter((_, idx) => idx !== i) }))}
                                                        className="w-3.5 h-3.5 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                                                    >
                                                        <IonIcon name="close" className="text-[8px]" />
                                                    </button>
                                                </div>
                                            ))}
                                            {(formData.shipping || []).length === 0 && (
                                                <span className="text-[8px] text-slate-600 uppercase font-black px-2 py-1">No countries added</span>
                                            )}
                                        </div>
                                    ) : (
                                        (formData.shipping || []).map((s, i) => (
                                            <div key={i} className="flex flex-col gap-2 p-3 bg-white/5 border border-white/10 rounded-2xl animate-in fade-in slide-in-from-left-2 duration-300">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-black text-white uppercase truncate">{s.country}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData(prev => ({ ...prev, shipping: prev.shipping.filter((_, idx) => idx !== i) }))}
                                                        className="w-6 h-6 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                                    >
                                                        <IonIcon name="close-circle" />
                                                    </button>
                                                </div>

                                                <div className="flex flex-col gap-3">
                                                    <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl w-fit">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const updated = [...formData.shipping];
                                                                updated[i] = { ...updated[i], charge: '0' };
                                                                setFormData(prev => ({ ...prev, shipping: updated }));
                                                            }}
                                                            className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${s.charge === '0' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}
                                                        >
                                                            Free
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const updated = [...formData.shipping];
                                                                if (s.charge === '0') updated[i].charge = '1';
                                                                setFormData(prev => ({ ...prev, shipping: updated }));
                                                            }}
                                                            className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${s.charge !== '0' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}
                                                        >
                                                            Manual
                                                        </button>
                                                    </div>

                                                    <div className="flex gap-2">
                                                        {s.charge !== '0' && (
                                                            <div className="flex-1">
                                                                <label className="text-[9px] text-white uppercase font-black tracking-wider block mb-1">Fee (R)</label>
                                                                <input
                                                                    type="number"
                                                                    value={s.charge}
                                                                    onChange={(e) => {
                                                                        const updated = [...formData.shipping];
                                                                        updated[i] = { ...updated[i], charge: e.target.value };
                                                                        setFormData(prev => ({ ...prev, shipping: updated }));
                                                                    }}
                                                                    className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white font-bold outline-none focus:ring-1 focus:ring-white/30"
                                                                    placeholder="0.00"
                                                                />
                                                            </div>
                                                        )}
                                                        <div className="flex-[1.5]">
                                                            <label className="text-[9px] text-white uppercase font-black tracking-wider block mb-1">Date</label>
                                                            <div
                                                                onClick={() => setOpenPicker({ type: 'shipping_date', field: i.toString(), options: DELIVERY_OPTIONS, title: `Shipping Date: ${s.country}`, value: s.date })}
                                                                className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white flex justify-between items-center cursor-pointer hover:bg-slate-700/50 transition-all"
                                                            >
                                                                <span>{s.date || "Select"}</span>
                                                                <IonIcon name="calendar-outline" className="text-gray-500" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col gap-4">
                                <div className="flex gap-4">
                                    <div className="flex-1 bg-slate-800/50 p-4 rounded-2xl border border-white/5">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Warranty</label>
                                        <div
                                            onClick={() => setOpenPicker({ type: 'form', field: 'warranty', options: ["No Warranty", "1 Year", "2 Years", "Custom"], title: 'Warranty', value: formData.warranty })}
                                            className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white flex items-center justify-between cursor-pointer"
                                        >
                                            <span>{formData.warranty}</span>
                                            <IonIcon name="chevron-down" className="text-gray-500" />
                                        </div>
                                        {formData.warranty === 'Custom' && (
                                            <input
                                                name="customWarranty"
                                                value={formData.customWarranty}
                                                onChange={handleInputChange}
                                                className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white mt-1.5 focus:ring-1 focus:ring-white/30 outline-none"
                                                placeholder="Enter details..."
                                            />
                                        )}
                                    </div>
                                    <div className="flex-1 bg-slate-800/50 p-4 rounded-2xl border border-white/5">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Return Days</label>
                                        <div className="flex flex-col gap-3">
                                            <div
                                                onClick={() => setOpenPicker({ type: 'form', field: 'returnPolicy', options: RETURN_OPTIONS, title: 'Return Days', value: formData.returnPolicy })}
                                                className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white flex items-center justify-between cursor-pointer"
                                            >
                                                <span>{formData.returnPolicy || "Pick Return Days"}</span>
                                                <IonIcon name="chevron-down" className="text-gray-500" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </div>

                            <div className="bg-slate-800/50 p-4 rounded-[2rem] border border-white/5">
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Payment Methods</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {PAYMENT_METHODS.map(method => {
                                        const isSelected = formData.paymentMethods.includes(method.id);
                                        return (
                                            <div
                                                key={method.id}
                                                onClick={() => {
                                                    if (method.id === 'wallet') return; // Always keep Rupier (wallet) selected
                                                    const newMethods = isSelected
                                                        ? formData.paymentMethods.filter(id => id !== method.id)
                                                        : [...formData.paymentMethods, method.id];
                                                    setFormData(prev => ({ ...prev, paymentMethods: newMethods }));
                                                }}
                                                className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${isSelected ? 'bg-white/10 border-white/20' : 'bg-black/20 border-white/5 hover:border-white/10'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isSelected ? 'bg-white text-black' : 'bg-white/5 text-slate-500'}`}>
                                                        <IonIcon name={method.icon as any} />
                                                    </div>
                                                    <span className={`text-[11px] font-bold ${isSelected ? 'text-white' : 'text-slate-500'}`}>{method.name}</span>
                                                </div>
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-700'}`}>
                                                    {isSelected && <IonIcon name="checkmark" className="text-white text-xs font-black" />}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="bg-slate-800/50 p-4 rounded-2xl border border-white/5">
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Resell Commission</label>
                                <div className="flex flex-col gap-2">
                                    <div className="flex gap-2">
                                        <div className="flex-[0.6]">
                                            <label className="text-[7px] text-slate-500 uppercase block mb-1">%</label>
                                            <input
                                                type="number"
                                                name="resellCommissionPercentage"
                                                value={formData.resellCommissionPercentage || ""}
                                                onChange={(e) => {
                                                    const percent = e.target.value;
                                                    const price = parseFloat(formData.promoPrice) || 0;
                                                    const amount = price ? ((price * (parseFloat(percent) || 0)) / 100).toFixed(2) : "";
                                                    setFormData(prev => ({ ...prev, resellCommissionPercentage: percent, resellCommission: amount }));
                                                }}
                                                className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-2 py-2 text-xs text-white outline-none"
                                                placeholder="%"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-[7px] text-slate-500 uppercase block mb-1">Fixed Amount (R)</label>
                                            <input
                                                type="number"
                                                name="resellCommission"
                                                value={formData.resellCommission || ""}
                                                onChange={handleInputChange}
                                                className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-white/30"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1 bg-slate-800/50 p-4 rounded-2xl border border-white/5">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Googer Comm. (%) *</label>
                                        {(parseFloat(formData.googerCommission) > 0) && (
                                            <span className="text-[10px] font-bold text-blue-400">
                                                -R {((parseFloat(formData.promoPrice) || 0) * parseFloat(formData.googerCommission) / 100).toFixed(2)}
                                            </span>
                                        )}
                                    </div>
                                    <input
                                        required
                                        type="number"
                                        name="googerCommission"
                                        value={formData.googerCommission || ""}
                                        onChange={handleInputChange}
                                        className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 transition-all font-bold"
                                        placeholder="0"
                                    />
                                </div>
                                <div className="flex-1 bg-slate-800/50 p-4 rounded-2xl border border-white/5">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Prod. Discount (%) *</label>
                                        {(parseFloat(formData.productDiscount) > 0) && (
                                            <span className="text-[10px] font-bold text-blue-400">
                                                -R {((parseFloat(formData.promoPrice) || 0) * parseFloat(formData.productDiscount) / 100).toFixed(2)}
                                            </span>
                                        )}
                                    </div>
                                    <input
                                        required
                                        type="number"
                                        name="productDiscount"
                                        value={formData.productDiscount || ""}
                                        onChange={handleInputChange}
                                        className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 transition-all font-bold"
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                        </div>
                    </div>
                    <div className="mt-8 mb-4 flex items-center gap-3">
                        <button
                            type="submit"
                            disabled={loading}
                            className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${loading ? 'bg-slate-800 text-slate-500' : 'bg-white text-black shadow-lg hover:bg-gray-200 hover:scale-[1.01]'}`}
                        >
                            {loading ? 'Processing...' : (initialData ? 'Update Product' : 'Publish Product')}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-12 h-[52px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-white/10 transition-all group shrink-0"
                            title="Cancel / Close"
                        >
                            <IonIcon name="cut" className="text-xl group-hover:scale-110 transition-transform" />
                        </button>
                    </div>
                </form>
            </div>


            {showModeSelection && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-sm" onClick={() => setShowModeSelection(false)} />
                    <div className="relative bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 p-8">
                        <div className="text-center mb-10">
                            <h3 className="text-xl font-black text-white italic uppercase tracking-[0.2em]">Product</h3>
                            <p className="text-[10px] text-slate-500 font-black uppercase mt-3 tracking-widest leading-relaxed">Choose how you want to present<br />your product listing</p>
                        </div>

                        <div className="flex flex-col gap-4">
                            <div
                                onClick={() => {
                                    setUploadMode('single');
                                    setShowModeSelection(false);
                                    setShowSourceSelection(true);
                                }}
                                className="group relative bg-white/[0.03] border border-white/10 p-5 rounded-[2rem] text-left hover:bg-white/[0.08] hover:border-white/20 transition-all cursor-pointer"
                            >
                                <div className="flex items-center gap-5">
                                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                                        <IonIcon name="document-text-outline" className="text-2xl" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-black text-white uppercase tracking-tight">Single Post</div>
                                        <div className="text-[9px] text-slate-500 font-bold uppercase mt-1 leading-relaxed">One product with multiple views<br />(Front, Back, Side, etc)</div>
                                    </div>
                                </div>
                            </div>

                            <div
                                onClick={() => {
                                    setUploadMode('variants');
                                    setShowModeSelection(false);
                                    setShowSourceSelection(true);
                                }}
                                className="group relative bg-white/[0.03] border border-white/10 p-5 rounded-[2rem] text-left hover:bg-white/[0.08] hover:border-white/20 transition-all cursor-pointer"
                            >
                                <div className="flex items-center gap-5">
                                    <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                                        <IonIcon name="layers-outline" className="text-2xl" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-black text-white uppercase tracking-tight">Variants</div>
                                        <div className="text-[9px] text-slate-500 font-bold uppercase mt-1 leading-relaxed">Multiple colors, sizes, or<br />different types in one listing</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowModeSelection(false)}
                            className="w-full mt-10 py-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )
            }

            {
                showSourceSelection && (
                    <div className="fixed inset-0 z-[210] flex items-center justify-center p-6">
                        <div className="absolute inset-0 bg-black/95 backdrop-blur-sm" onClick={() => setShowSourceSelection(false)} />
                        <div className="relative bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] w-full max-w-xs overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 p-8">
                            <div className="text-center mb-8">
                                <h3 className="text-lg font-black text-white italic uppercase tracking-[0.2em]">Add Images</h3>
                                <p className="text-[9px] text-slate-500 font-black uppercase mt-2 tracking-widest">Select your source</p>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => {
                                        setImageSource('file');
                                        setShowSourceSelection(false);
                                        setTimeout(() => fileInputRef.current?.click(), 100);
                                    }}
                                    className="w-full py-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-center gap-3 hover:bg-white/[0.08] hover:border-white/20 transition-all group"
                                >
                                    <IonIcon name="cloud-upload-outline" className="text-blue-400 text-lg group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Upload Images</span>
                                </button>

                                <button
                                    onClick={() => {
                                        setImageSource('link');
                                        setShowSourceSelection(false);
                                        setShowLinkInput(true);
                                    }}
                                    className="w-full py-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-center gap-3 hover:bg-white/[0.08] hover:border-white/20 transition-all group"
                                >
                                    <IonIcon name="link-outline" className="text-purple-400 text-lg group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Add Image Link</span>
                                </button>
                            </div>

                            <button
                                onClick={() => setShowSourceSelection(false)}
                                className="w-full mt-8 py-2 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] hover:text-white transition-colors"
                            >
                                Back
                            </button>
                        </div>
                    </div>
                )
            }

            {
                showLinkInput && (
                    <div className="fixed inset-0 z-[220] flex items-center justify-center p-6">
                        <div className="absolute inset-0 bg-black/95 backdrop-blur-sm" onClick={() => setShowLinkInput(false)} />
                        <div className="relative bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 p-8">
                            <div className="text-center mb-6">
                                <h3 className="text-lg font-black text-white italic uppercase tracking-[0.2em]">Image Link</h3>
                                <p className="text-[9px] text-slate-500 font-black uppercase mt-2 tracking-widest">Enter the direct image URL</p>
                            </div>

                            <div className="space-y-4">
                                <input
                                    type="url"
                                    value={imageLink}
                                    onChange={(e) => setImageLink(e.target.value)}
                                    placeholder="https://example.com/image.jpg"
                                    className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-4 py-3.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 transition-all"
                                />
                                <button
                                    onClick={handleAddImageLink}
                                    className="w-full py-4 bg-white text-black rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg hover:bg-gray-200 hover:scale-[1.02] transition-all"
                                >
                                    Add Image
                                </button>
                            </div>

                            <button
                                onClick={() => setShowLinkInput(false)}
                                className="w-full mt-6 py-2 text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )
            }

            {
                openPicker && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
                        <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => { setOpenPicker(null); setTempSelections([]); }} />
                        <div className="relative bg-[#0a0a0a] border border-white/10 rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">{openPicker.title}</span>
                                    <span className="text-[8px] text-gray-400 font-bold uppercase mt-1">Pick from list or enter manually</span>
                                </div>
                                <button type="button" onClick={() => { setOpenPicker(null); setTempSelections([]); }} className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-all">
                                    <IonIcon name="close" />
                                </button>
                            </div>

                            {!openPicker?.title.includes('UOM') && (
                                <div className="p-4 bg-black/40">
                                    <div className="relative group">
                                        <input
                                            type="text"
                                            placeholder="Search..."
                                            className="w-full bg-slate-800 rounded-2xl py-3.5 pl-11 pr-4 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 transition-all font-medium placeholder:text-slate-600"
                                            onChange={(e) => {
                                                const query = e.target.value.toLowerCase();
                                                setOpenPicker(prev => prev ? { ...prev, manualQuery: query } : null);
                                            }}
                                        />
                                        <IonIcon name="search-outline" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-white transition-colors" />
                                    </div>
                                </div>
                            )}

                            <div className="max-h-[350px] overflow-y-auto py-2 px-3 custom-scrollbar flex flex-col gap-1.5">
                                {(openPicker?.type === 'color' || openPicker?.field === 'category' || openPicker?.type === 'variant') && (
                                    <div className="p-3 mb-2 bg-white/[0.03] rounded-2xl border border-white/5 flex gap-2 items-center">
                                        <input
                                            type="text"
                                            placeholder={`Manual ${openPicker?.field === 'category' ? 'category' : openPicker?.title.includes('UOM') ? 'UOM' : 'value'}...`}
                                            className="flex-1 bg-transparent border-none text-xs text-white font-black px-2 outline-none"
                                            id="manualEntryInput"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    const val = (e.target as HTMLInputElement).value;
                                                    if (openPicker?.type === 'color') assignColorToActiveImage(val);
                                                    else if (openPicker?.type === 'form') handleFormChange(openPicker.field, val);
                                                    else if (openPicker?.type === 'variant') setTempSelections(prev => [...prev, val]);
                                                    setOpenPicker(null);
                                                }
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const input = document.getElementById('manualEntryInput') as HTMLInputElement;
                                                const val = input?.value;
                                                if (val) {
                                                    if (openPicker?.type === 'color') assignColorToActiveImage(val);
                                                    else if (openPicker?.type === 'form') handleFormChange(openPicker.field, val);
                                                    else if (openPicker?.type === 'variant') {
                                                        setTempSelections(prev => [...prev, val]);
                                                        return; // Don't close yet for multi-select
                                                    }
                                                    setOpenPicker(null);
                                                }
                                            }}
                                            className="bg-white text-black text-[9px] font-black px-3 py-1.5 rounded-lg uppercase"
                                        >
                                            Confirm
                                        </button>
                                    </div>
                                )}

                                {(openPicker?.type === 'color' || openPicker?.type === 'add_variant_color'
                                    ? COLORS.filter(c => !openPicker?.manualQuery || c.name.toLowerCase().includes(openPicker?.manualQuery as string) || c.hex.toLowerCase().includes(openPicker?.manualQuery as string))
                                    : (openPicker?.options || []).filter(o => !openPicker?.manualQuery || o.toLowerCase().includes(openPicker?.manualQuery as string))
                                ).map((o: any) => {
                                    const isColor = openPicker?.type === 'color' || openPicker?.type === 'add_variant_color';
                                    const label = isColor ? o.name : o;
                                    const isMulti = openPicker?.type === 'variant' || openPicker?.type === 'shipping';
                                    const isSelected = isMulti ? tempSelections.includes(label) : openPicker?.value === label;

                                    return (
                                        <button
                                            key={label}
                                            type="button"
                                            onClick={() => {
                                                if (openPicker?.type === 'add_variant_color') {
                                                    addManualVariant(label);
                                                    setOpenPicker(null);
                                                } else if (openPicker?.type === 'form') {
                                                    handleFormChange(openPicker.field, label);
                                                } else if (isMulti) {
                                                    setTempSelections(prev => prev.includes(label) ? prev.filter(s => s !== label) : [...prev, label]);
                                                } else if (openPicker?.type === 'color') {
                                                    assignColorToActiveImage(label);
                                                    setOpenPicker(null);
                                                } else if (openPicker?.type === 'shipping_date') {
                                                    const updated = [...formData.shipping];
                                                    const idx = parseInt(openPicker.field);
                                                    if (!isNaN(idx)) {
                                                        updated[idx] = { ...updated[idx], date: label };
                                                        setFormData(prev => ({ ...prev, shipping: updated }));
                                                    }
                                                    setOpenPicker(null);
                                                }
                                            }}
                                            className={`w-full p-3.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-between group
                                                            ${isSelected ? 'bg-white text-black' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                {isColor && (
                                                    <div
                                                        className="w-5 h-5 rounded-full border border-white/10 shadow-sm"
                                                        style={{ backgroundColor: o.hex }}
                                                    />
                                                )}
                                                <span className="tracking-tight">{label}</span>
                                            </div>
                                            {isColor && <span className={`text-[8px] font-black uppercase opacity-40 group-hover:opacity-100 ${isSelected ? 'text-black' : 'text-slate-600'}`}>{o.hex}</span>}
                                            {isSelected && <IonIcon name="checkmark-circle" className="text-lg" />}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="p-6 bg-white/[0.02] border-t border-white/5 flex gap-3">
                                <button type="button" onClick={() => { setOpenPicker(null); setTempSelections([]); }} className="flex-1 py-4 rounded-[1.5rem] bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all">Cancel</button>
                                {(openPicker?.type === 'variant' || openPicker?.type === 'shipping') && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (openPicker?.type === 'shipping') {
                                                const current = formData.shipping || [];
                                                const newShipping = tempSelections.map(country => ({ country, charge: "0", date: "" }));
                                                setFormData(prev => ({ ...prev, shipping: [...current, ...newShipping] }));
                                            } else if (openPicker?.type === 'variant') {
                                                const isUOM = openPicker.title.includes('UOM');
                                                const newVariants = [...variants];
                                                const currentSelections = newVariants[activeImageIndex].selections || [];
                                                const newSelections = tempSelections.map(val => ({
                                                    value: val,
                                                    stock: "0",
                                                    detail: ""
                                                }));
                                                newVariants[activeImageIndex] = {
                                                    ...newVariants[activeImageIndex],
                                                    selections: [...currentSelections, ...newSelections],
                                                    type: isUOM ? 'UOM' : 'Size'
                                                };
                                                setVariants(newVariants);
                                            }
                                            setOpenPicker(null);
                                            setTempSelections([]);
                                        }}
                                        className="flex-[2] py-4 rounded-[1.5rem] bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                                    >
                                        Confirm
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
            {
                showSuccessPopup && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
                        <div className="relative bg-black border border-white/20 rounded-[3rem] p-10 w-full max-w-sm text-center shadow-2xl animate-in zoom-in-95 duration-300">
                            <div className="w-20 h-20 bg-green-500/20 border border-green-500/50 rounded-full flex items-center justify-center mx-auto mb-6">
                                <IonIcon name="checkmark" className="text-4xl text-green-500" />
                            </div>
                            <h3 className="text-xl font-black text-white italic uppercase tracking-[0.2em] mb-2">{initialData ? 'Product Updated' : 'Product Published'}</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{initialData ? 'Your changes have been saved.' : 'Your product is now live on the market.'}</p>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
