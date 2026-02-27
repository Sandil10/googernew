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

const CATEGORIES: Record<string, string[]> = {
    "Cakes": ["Birthday Cakes", "Wedding Cakes", "Custom Cakes", "Other"],
    "Gamings": ["Consoles", "PC", "Accessories", "Other"],
    "Headphones": ["Wireless", "Wired", "Earbuds", "Other"],
    "Parfums": ["Men", "Women", "Unisex", "Other"],
    "Fruits": ["Fresh", "Dried", "Other"],
    "Mobiles": ["Smartphones", "Tablets", "Accessories", "Other"],
    "Laptops": ["Gaming", "Business", "Ultrabooks", "Other"],
    "Accessories": ["Bags", "Watches", "Jewelry", "Other"],
    "Shoes": ["Sneakers", "Formal", "Other"],
    "Clothing": ["Men", "Women", "Kids", "Other"],
    "Electronics": ["TV", "Appliances", "Cameras", "Other"],
    "Fashion": ["Bags", "Eyewear", "Other"],
    "Custom": ["Other"]
};

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
    { id: 'cash', name: 'Cash', icon: 'cash-outline' },
    { id: 'card', name: 'Card', icon: 'card-outline' },
    { id: 'bank', name: 'Bank Transfer', icon: 'business-outline' },
    { id: 'cod', name: 'COD', icon: 'cash-outline' },
    { id: 'wallet', name: 'Rupeir Payments', icon: 'wallet-outline' }
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
    { name: "Black", hex: "#000000" }, { name: "White", hex: "#FFFFFF" }, { name: "Red", hex: "#E11D48" }, { name: "Blue", hex: "#2563EB" },
    { name: "Green", hex: "#16A34A" }, { name: "Yellow", hex: "#FACC15" }, { name: "Purple", hex: "#9333EA" }, { name: "Pink", hex: "#DB2777" },
    { name: "Orange", hex: "#EA580C" }, { name: "Gray", hex: "#6B7280" }, { name: "Brown", hex: "#78350F" }, { name: "Teal", hex: "#14B8A6" },
    { name: "Indigo", hex: "#4F46E5" }, { name: "Cyan", hex: "#06B6D4" }, { name: "Lime", hex: "#84CC16" }, { name: "Amber", hex: "#F59E0B" },
    { name: "Rose", hex: "#F43F5E" }, { name: "Silver", hex: "#C0C0C0" }, { name: "Gold", hex: "#D4AF37" }, { name: "Navy", hex: "#000080" },
    { name: "Maroon", hex: "#800000" }, { name: "Olive", hex: "#808000" }, { name: "Sky", hex: "#0EA5E9" }, { name: "Violet", hex: "#7C3AED" },
    { name: "Beige", hex: "#F5F5DC" }, { name: "Coral", hex: "#FF7F50" }, { name: "Crimson", hex: "#DC143C" }, { name: "Emerald", hex: "#50C878" },
    { name: "Fuchsia", hex: "#FF00FF" }, { name: "Ivory", hex: "#FFFFF0" }, { name: "Khaki", hex: "#F0E68C" }, { name: "Lavender", hex: "#E6E6FA" },
    { name: "Magenta", hex: "#FF00FF" }, { name: "Mint", hex: "#3EB489" }, { name: "Mustard", hex: "#FFDB58" }, { name: "Peach", hex: "#FFE5B4" },
    { name: "Platinum", hex: "#E5E4E2" }, { name: "Ruby", hex: "#E0115F" }, { name: "Salmon", hex: "#FA8072" }, { name: "Tan", hex: "#D2B48C" },
    { name: "Turquoise", hex: "#40E0D0" }, { name: "Wine", hex: "#722F37" }, { name: "Zaffre", hex: "#0014A8" }, { name: "Azure", hex: "#007FFF" },
    { name: "Charcoal", hex: "#36454F" }, { name: "Mauve", hex: "#E0B0FF" }, { name: "Nude", hex: "#E3BC9A" }, { name: "Ocher", hex: "#CC7722" },
    { name: "Papaya", hex: "#FFEFD5" }, { name: "Sand", hex: "#C2B280" }
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
        title: "",
        description: "",
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
        productDiscount: "0",
        paymentMethods: [] as string[],
        shipping: [{ country: "Sri Lanka", charge: "0", date: "" }] as { country: string, charge: string, date: string }[],
        unifiedShipping: false,
        unifiedCharge: "",
        unifiedDate: "",
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
                title: initialData.title || (initialData.description ? initialData.description.split('\n')[0].substring(0, 60) : ""),
                description: initialData.description || "",
                category: initialData.category || "",
                subCategory: initialData.sub_category || "",
                manualCategory: "",
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
                productDiscount: commissionData?.discount || "0",
                paymentMethods: Array.isArray(paymentData) ? (paymentData.includes('wallet') ? paymentData : ['wallet', ...paymentData]) : ['wallet'],
                shipping: Array.isArray(shippingData?.rates) ? shippingData.rates : [{ country: "Sri Lanka", charge: "0", date: "" }],
                unifiedShipping: shippingData?.unified || false,
                unifiedCharge: shippingData?.charge || "",
                unifiedDate: shippingData?.date || "",
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
            const next = { ...prev, [name]: value };

            // Auto-calculate commission based on promoPrice if exists, else main price
            if (name === 'price' || name === 'promoPrice' || name === 'resellCommissionPercentage') {
                const currentPrice = parseFloat(next.promoPrice || next.price) || 0;
                if (next.resellCommissionPercentage) {
                    next.resellCommission = ((currentPrice * parseFloat(next.resellCommissionPercentage)) / 100).toFixed(2);
                }
            }

            return next;
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
        if (!uploadMode) {
            setShowModeSelection(true);
        } else if (!imageSource) {
            setShowSourceSelection(true);
        } else {
            // Persistent source: once chosen, keep using it for this session
            if (imageSource === 'file') fileInputRef.current?.click();
            else setShowLinkInput(true);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
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
                    setPreviews(prev => [...prev, previewUrl]);
                    setSelectedImages(prev => [...prev, file]);

                    // Single Post: only one variant/color set for all images
                    // Variants: each image gets its own variant/color set
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
                            // Subsequent images in Single Post don't get new variants
                            // They share the first one. We can keep imageColors but index 0 is master.
                            // Actually to keep indices aligned, we might need to duplicate or just ignore others.
                            // Let's keep them 1:1 but they will be 'slave' to the first one in UI.
                            setImageColors(prev => [...prev, imageColors[0] || "None"]);
                            setVariants(prev => [...prev, { ...variants[0] }]);
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

        // Basic image URL validation
        const isValidUrl = (url: string) => {
            return url.match(/\.(jpeg|jpg|gif|png|webp|avif)$/) != null ||
                url.includes('images.unsplash.com') ||
                url.includes('fbcdn.net') ||
                url.includes('ytimg.com');
        };

        if (!isValidUrl(imageLink)) {
            alert("Invalid image URL. Please provide a direct link to an image file.");
            return;
        }

        const remainingSpace = 5 - previews.length;
        if (remainingSpace <= 0) {
            alert("Maximum 5 images allowed.");
            return;
        }

        const currentPreviewsCount = previews.length;
        setPreviews(prev => [...prev, imageLink]);
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
                setImageColors(prev => [...prev, imageColors[0] || "None"]);
                setVariants(prev => [...prev, { ...variants[0] }]);
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
        if (currentPreviewsCount + 1 >= 5) {
            setShowLinkInput(false);
        }
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

    const addManualVariant = () => {
        const newCount = variants.length + 1;
        setVariants(prev => [...prev, {
            promo_price: formData.promoPrice || "",
            type: "Size",
            selections: [],
            quantity: "1",
            isManual: true
        }]);
        setImageColors(prev => [...prev, "None"]);
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

    const handleVariantChange = (index: number, field: string, value: any) => {
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

    const handleFormChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
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

        let finalTitle = formData.title;
        // Requirement 11: derive title from description if empty
        if (!finalTitle && formData.description) {
            finalTitle = formData.description.split('\n')[0].trim();
        }

        // Validation: Product Name
        if (!finalTitle) {
            alert("Product Name is required (or first line of Description).");
            return;
        }

        // Validation: Category
        if (!formData.category) {
            alert("Category is required.");
            return;
        }

        // Validation: Payment Methods
        if (!formData.paymentMethods || formData.paymentMethods.length === 0) {
            alert("Please select at least one accepted payment method.");
            return;
        }

        setLoading(true);

        try {
            const data = new FormData();

            // Basic fields
            data.append('title', finalTitle);
            data.append('description', formData.description);
            data.append('category', formData.category);
            data.append('sub_category', formData.subCategory);
            data.append('manual_category', formData.manualCategory);

            // Prices
            data.append('price', formData.price);
            // Use promoPrice if exists, otherwise fallback to main price (Requirement 3)
            data.append('promo_price', formData.promoPrice || formData.price);

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
                discount: formData.productDiscount
            }));

            // Variants (Colors and detailed data associated with each image/group)
            const submissionVariants = variants.map((v, i) => ({
                color: imageColors[i] || "None",
                index: i,
                image_url: previews[i] || null,
                ...v,
                // Ensure variant promo price also falls back if empty
                promo_price: v.promo_price || formData.promoPrice || formData.price
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
            <div className="bg-[#121212] border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] w-[92%] md:w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-auto max-h-[85vh] md:max-h-[90vh] animate-in zoom-in-95 duration-300">

                {/* Left Panel: Images & Colors */}
                <div className="w-full md:w-[40%] bg-[#1a1a1a] p-2 md:p-8 flex flex-col gap-2 md:gap-6 border-b md:border-b-0 md:border-r border-white/5 shrink-0">
                    <div className="flex items-center justify-between px-1 md:px-2">
                        <div className="text-left">
                            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">Add Listing</h2>
                            <p className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-widest font-black">{previews.length}/5 Images • {variants.length} Variants</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        {/* Main Preview Area (Now Above) */}
                        <div
                            onClick={handleAddImagesClick}
                            className={`relative w-full h-[220px] md:h-auto md:aspect-square rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden transition-all cursor-pointer group shadow-2xl
                                ${previews.length > 0 ? 'border-0' : 'border-2 border-dashed border-white/10 hover:border-white/20 bg-white/5'}`}
                        >
                            {previews.length > 0 ? (
                                <>
                                    <Image
                                        src={previews[activeImageIndex] || previews[0]}
                                        alt="Preview"
                                        fill
                                        className="object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
                                            <IonIcon name="camera" className="text-2xl text-white" />
                                        </div>
                                    </div>

                                    {/* Slider Arrows (Requirement 6) */}
                                    {previews.length > 1 && (
                                        <>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : previews.length - 1)); }}
                                                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                                            >
                                                <IonIcon name="chevron-back" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setActiveImageIndex((prev) => (prev < previews.length - 1 ? prev + 1 : 0)); }}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                                            >
                                                <IonIcon name="chevron-forward" />
                                            </button>
                                        </>
                                    )}
                                </>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-12 h-12 rounded-full border-2 border-white/10 flex items-center justify-center bg-white/5">
                                        <IonIcon name="camera" className="text-2xl text-white/30" />
                                    </div>
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

                        {/* Thumbnails Row (Now Below) */}
                        <div className="flex items-center gap-2 overflow-x-auto py-1 custom-scrollbar no-scrollbar px-1 min-h-[60px]">
                            {variants.map((v, i) => (
                                <div key={i} className="relative group shrink-0">
                                    <div
                                        onClick={() => setActiveImageIndex(i)}
                                        className={`relative w-12 h-12 rounded-[1rem] overflow-hidden transition-all cursor-pointer border-2 flex items-center justify-center bg-white/5
                                                ${activeImageIndex === i
                                                ? 'border-blue-500 scale-105 shadow-lg'
                                                : 'border-white/5 opacity-60 hover:opacity-100'}`}
                                    >
                                        {previews[i] ? (
                                            <Image src={previews[i]} alt={`Thumb ${i}`} fill className="object-cover" />
                                        ) : (
                                            <IonIcon name="color-palette-outline" className="text-white/40" />
                                        )}
                                    </div>

                                    {/* Delete Button Near Thumbnail (Requirement 12) */}
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-10"
                                    >
                                        <IonIcon name="close" className="text-[10px] font-bold" />
                                    </button>
                                </div>
                            ))}
                            {previews.length < 5 && (
                                <button
                                    type="button"
                                    onClick={handleAddImagesClick}
                                    className="w-12 h-12 flex items-center justify-center transition-all transform hover:scale-110 shrink-0 border-2 border-dashed border-blue-500/50 rounded-[1rem] bg-blue-500/10 hover:border-blue-500/70"
                                    title="Add Image"
                                >
                                    <IonIcon name="add" className="text-xl text-blue-500" />
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

                        <div className="flex flex-col gap-6">
                            {/* Requirement 11: Order - Description first, then Title/Name */}
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                    Description (Optional)
                                </label>
                                <textarea
                                    name="description"
                                    value={formData.description}
                                    onChange={handleInputChange}
                                    rows={2}
                                    className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 resize-none transition-all"
                                    placeholder="Detailed product description..."
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                    Product Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    required
                                    type="text"
                                    name="title"
                                    value={formData.title}
                                    onChange={handleInputChange}
                                    className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 transition-all"
                                    placeholder="e.g. Birthday Cake, Designer Shoes..."
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                        Category <span className="text-red-500">*</span>
                                    </label>
                                    <div
                                        onClick={() => setOpenPicker({ type: 'form', field: 'category', options: Object.keys(CATEGORIES), title: 'Main Category', value: formData.category })}
                                        className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white flex items-center justify-between cursor-pointer focus:ring-1 focus:ring-white/30 transition-all"
                                    >
                                        <span className="truncate">{formData.category === 'Custom' && formData.manualCategory ? formData.manualCategory : (formData.category || "Select Category")}</span>
                                        <IonIcon name="chevron-down" className="text-gray-500" />
                                    </div>
                                    {formData.category === 'Custom' && (
                                        <input
                                            type="text"
                                            name="manualCategory"
                                            value={formData.manualCategory}
                                            onChange={handleInputChange}
                                            className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white mt-1"
                                            placeholder="Enter your category..."
                                        />
                                    )}
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                        Sub Category
                                    </label>
                                    <div
                                        onClick={() => {
                                            if (!formData.category) return alert("Please select a main category first.");
                                            const options = CATEGORIES[formData.category] || [];
                                            setOpenPicker({ type: 'form', field: 'subCategory', options: options as string[], title: `Sub Category of ${formData.category}`, value: formData.subCategory });
                                        }}
                                        className={`w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white flex items-center justify-between cursor-pointer focus:ring-1 focus:ring-white/30 transition-all ${!formData.category ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <span className="truncate">{formData.subCategory || "Select Sub Category"}</span>
                                        <IonIcon name="chevron-down" className="text-gray-500" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                        Main Price (R) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        required
                                        type="number"
                                        name="price"
                                        value={formData.price}
                                        onChange={handleInputChange}
                                        className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 transition-all font-bold"
                                        placeholder="0.00"
                                    />
                                </div>

                                <div className="flex-1">
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                        Promo Price (R) <span className="text-slate-500 opacity-50">(Optional)</span>
                                    </label>
                                    <input
                                        type="number"
                                        name="promoPrice"
                                        value={formData.promoPrice}
                                        onChange={handleInputChange}
                                        className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 transition-all font-bold"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        </div>


                        {/* Variant Details & Configuration (Requirements 4, 5, 6) */}
                        {variants[activeImageIndex] && (
                            <div className="p-6 rounded-[2.5rem] bg-white/[0.03] border border-white/10 flex flex-col gap-6 shadow-2xl backdrop-blur-sm animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <h3 className="text-sm font-black text-white italic uppercase tracking-wider">
                                            {uploadMode === 'single' ? 'Product Configuration' : 'Variant Details'}
                                        </h3>
                                        <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                                            {uploadMode === 'single' ? 'Settings apply to all views' : `Configuring ${imageColors[activeImageIndex] || "Selected"} Color`}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setUploadMode('variants');
                                            handleAddImagesClick();
                                        }}
                                        className="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-widest hover:bg-blue-500/20 transition-all flex items-center gap-1.5 shadow-lg shadow-blue-500/5"
                                    >
                                        <IonIcon name="add-circle" className="text-sm" />
                                        Additional Colors
                                    </button>
                                </div>

                                {/* Selected Chips (Requirement 5) */}
                                <div className="flex flex-wrap gap-2">
                                    {(variants[activeImageIndex].selections || []).map((sel: any, sIdx: number) => (
                                        <div
                                            key={sIdx}
                                            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2 group hover:border-red-500/50 hover:bg-red-500/5 transition-all cursor-pointer"
                                            onClick={() => {
                                                const newVariants = [...variants];
                                                newVariants[activeImageIndex].selections = newVariants[activeImageIndex].selections.filter((_: any, i: number) => i !== sIdx);
                                                setVariants(newVariants);
                                            }}
                                        >
                                            <span className="text-[10px] font-bold text-white uppercase">{sel.value}</span>
                                            <IonIcon name="close" className="text-[10px] text-slate-500 group-hover:text-red-500" />
                                        </div>
                                    ))}
                                    {imageColors[activeImageIndex] !== 'None' && (
                                        <div className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.find(c => c.name === imageColors[activeImageIndex])?.hex || '#333' }} />
                                            <span className="text-[10px] font-bold text-blue-400 uppercase">{imageColors[activeImageIndex]}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-6">
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                {variants[activeImageIndex].type === 'Size' ? 'Select Sizes' : 'Select UOM'}
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newType = variants[activeImageIndex].type === 'Size' ? 'UOM' : 'Size';
                                                    handleVariantChange(activeImageIndex, 'type', newType);
                                                    handleVariantChange(activeImageIndex, 'selections', []);
                                                }}
                                                className="text-[9px] font-bold text-blue-400 uppercase tracking-widest hover:text-blue-300"
                                            >
                                                Switch to {variants[activeImageIndex].type === 'Size' ? 'UOM' : 'Size'}
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                            {(variants[activeImageIndex].type === 'Size' ? SIZES : UOMS).map((item) => {
                                                const isSelected = variants[activeImageIndex].selections?.some((s: any) => s.value === item);
                                                return (
                                                    <button
                                                        key={item}
                                                        type="button"
                                                        onClick={() => {
                                                            const currentSelections = [...(variants[activeImageIndex].selections || [])];
                                                            if (isSelected) {
                                                                const filtered = currentSelections.filter((s: any) => s.value !== item);
                                                                handleVariantChange(activeImageIndex, 'selections', filtered);
                                                            } else {
                                                                handleVariantChange(activeImageIndex, 'selections', [...currentSelections, { value: item, stock: "10" }]);
                                                            }
                                                        }}
                                                        className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border
                                                            ${isSelected
                                                                ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20'
                                                                : 'bg-white/5 text-slate-400 border-white/5 hover:border-white/20'}`}
                                                    >
                                                        {item}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Requirement 4: Inline Stock Inputs */}
                                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Stock Configuration (Always Visible)</label>
                                        {(variants[activeImageIndex].selections || []).map((sel: any, sIdx: number) => (
                                            <div key={sIdx} className="flex items-center gap-4 bg-black/40 border border-white/5 p-3 rounded-2xl animate-in slide-in-from-right-4 duration-300">
                                                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                                    <span className="text-[10px] font-black text-white">{sel.value}</span>
                                                </div>
                                                <div className="flex-1 flex flex-col">
                                                    <span className="text-[8px] font-black text-slate-600 uppercase mb-1">Quantity in Stock</span>
                                                    <input
                                                        type="number"
                                                        value={sel.stock}
                                                        onChange={(e) => {
                                                            const newVariants = [...variants];
                                                            newVariants[activeImageIndex].selections[sIdx].stock = e.target.value;
                                                            setVariants(newVariants);
                                                        }}
                                                        className="w-full bg-transparent border-0 p-0 text-xs font-bold text-white focus:ring-0 outline-none"
                                                        placeholder="0"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newVariants = [...variants];
                                                        newVariants[activeImageIndex].selections = newVariants[activeImageIndex].selections.filter((_: any, i: number) => i !== sIdx);
                                                        setVariants(newVariants);
                                                    }}
                                                    className="w-8 h-8 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all"
                                                >
                                                    <IonIcon name="trash-outline" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="h-px w-full bg-white/5" />

                        <div className="flex flex-col gap-6">
                            <h3 className="text-lg font-bold text-white italic">Logistics & Payments</h3>

                            <div className="space-y-4">
                                <div className="bg-slate-800/20 p-5 rounded-[2rem] border border-white/5">
                                    <label className="text-[10px] font-black text-slate-500 uppercase">Payment Methods</label>
                                    <div className="flex flex-col gap-2 mt-3">
                                        {PAYMENT_METHODS.map(m => {
                                            const payments = Array.isArray(formData.paymentMethods) ? formData.paymentMethods : [];
                                            const isSelected = payments.includes(m.id);
                                            return (
                                                <div
                                                    key={m.id}
                                                    onClick={() => {
                                                        if (m.id === 'wallet') return; // Cannot unselect Rupeir Payments
                                                        const current = Array.isArray(formData.paymentMethods) ? formData.paymentMethods : [];
                                                        const updated = isSelected ? current.filter(id => id !== m.id) : [...current, m.id];
                                                        setFormData(prev => ({ ...prev, paymentMethods: updated }));
                                                    }}
                                                    className={`p-3 rounded-xl border flex items-center justify-between transition-all ${isSelected ? 'border-white bg-white/10' : 'border-slate-800 bg-slate-800/40'} ${m.id === 'wallet' ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <IonIcon name={m.icon} className={isSelected ? 'text-white' : 'text-slate-500'} />
                                                        <span className="text-xs font-bold text-slate-300">{m.name} {m.id === 'wallet' && <span className="text-[8px] text-gray-500 font-normal">(Default)</span>}</span>
                                                    </div>
                                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'bg-white border-white' : 'border-slate-700'}`}>
                                                        {isSelected && <IonIcon name="checkmark" className="text-black text-[10px] font-black" />}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="bg-slate-800/20 p-5 rounded-[2rem] border border-white/5">
                                    <div className="flex items-center justify-between mb-4">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Shipping Rates (Requirement 10)</label>
                                        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl">
                                            {[
                                                { id: 'free', label: 'Free' },
                                                { id: 'unified', label: 'Unified' },
                                                { id: 'custom', label: 'Custom' }
                                            ].map((opt) => {
                                                const isActive = opt.id === 'free' ? (formData.unifiedShipping && formData.unifiedCharge === '0') :
                                                    opt.id === 'unified' ? (formData.unifiedShipping && formData.unifiedCharge !== '0') :
                                                        !formData.unifiedShipping;
                                                return (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onClick={() => {
                                                            if (opt.id === 'free') {
                                                                setFormData(prev => ({ ...prev, unifiedShipping: true, unifiedCharge: '0' }));
                                                            } else if (opt.id === 'unified') {
                                                                setFormData(prev => ({ ...prev, unifiedShipping: true, unifiedCharge: prev.unifiedCharge === '0' ? '10' : prev.unifiedCharge }));
                                                            } else {
                                                                setFormData(prev => ({ ...prev, unifiedShipping: false }));
                                                            }
                                                        }}
                                                        className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${isActive ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {formData.unifiedShipping && (
                                        <div className="flex gap-2 mb-4 p-3 bg-white/5 rounded-2xl border border-white/10 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div className="flex-1">
                                                <label className="text-[9px] text-white uppercase font-black tracking-wider mb-1 block">
                                                    {formData.unifiedCharge === '0' ? 'Free Shipping Active' : 'Global Price (R)'}
                                                </label>
                                                <input
                                                    disabled={formData.unifiedCharge === '0'}
                                                    type="number"
                                                    value={formData.unifiedCharge}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, unifiedCharge: e.target.value }))}
                                                    className={`w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:ring-1 focus:ring-white/30 outline-none ${formData.unifiedCharge === '0' ? 'opacity-50' : ''}`}
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
                                    )}

                                    {!formData.unifiedShipping && (
                                        <button
                                            type="button"
                                            onClick={() => setOpenPicker({ type: 'shipping', field: '', options: COUNTRIES.filter(c => !(formData.shipping || []).find(s => s.country === c)), title: 'Add Countries', value: '' })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-2 text-[10px] font-black text-gray-300 uppercase tracking-widest mb-3 hover:bg-white/10 transition-all shadow-sm"
                                        >
                                            + Add Shipping Country
                                        </button>
                                    )}

                                    <div className={`mt-2 overflow-y-auto custom-scrollbar pr-1 ${formData.unifiedShipping ? 'max-h-[120px]' : 'max-h-[380px] flex flex-col gap-2'}`}>
                                        {(formData.shipping || []).map((s, i) => (
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
                                        ))}
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
                                                            const price = parseFloat(formData.price) || 0;
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

                                    <div className="bg-slate-800/50 p-4 rounded-2xl border border-white/5">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Prod. Discount (%) *</label>
                                        <input
                                            required
                                            type="number"
                                            name="productDiscount"
                                            value={formData.productDiscount || ""}
                                            onChange={handleInputChange}
                                            className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30 transition-all"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="mt-8 mb-4">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${loading ? 'bg-slate-800 text-slate-500' : 'bg-white text-black shadow-lg hover:bg-gray-200 hover:scale-[1.01]'}`}
                                >
                                    {loading ? 'Processing...' : (initialData ? 'Update Product' : 'Publish Product')}
                                </button>
                            </div>
                        </div>
                    </div>
                </form>
            </div>

            {showModeSelection && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-sm" onClick={() => setShowModeSelection(false)} />
                    <div className="relative bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 p-8">
                        <div className="text-center mb-10">
                            <h3 className="text-xl font-black text-white italic uppercase tracking-[0.2em]">Post Type</h3>
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
            )}

            {showSourceSelection && (
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
            )}

            {showLinkInput && (
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
                                {previews.length >= 1 ? 'Add Another' : 'Add Image'}
                            </button>
                        </div>

                        <button
                            onClick={() => setShowLinkInput(false)}
                            className="w-full mt-6 py-2 text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] hover:text-white transition-colors"
                        >
                            {previews.length >= 1 ? 'Done' : 'Cancel'}
                        </button>
                    </div>
                </div>
            )}

            {openPicker && (
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

                            {(openPicker?.type === 'color'
                                ? COLORS.filter(c => !openPicker?.manualQuery || c.name.toLowerCase().includes(openPicker?.manualQuery as string) || c.hex.toLowerCase().includes(openPicker?.manualQuery as string))
                                : openPicker?.options.filter(o => !openPicker?.manualQuery || o.toLowerCase().includes(openPicker?.manualQuery as string))
                            )?.map((o: any) => {
                                const isColor = openPicker?.type === 'color';
                                const label = isColor ? o.name : o;
                                const isMulti = openPicker?.type === 'variant' || openPicker?.type === 'shipping';
                                const isSelected = isMulti ? tempSelections.includes(label) : openPicker?.value === label;

                                return (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => {
                                            if (openPicker?.type === 'form') {
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
                                                stock: "0"
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
            )}

            {showSuccessPopup && (
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
            )}
        </div>
    );
}
