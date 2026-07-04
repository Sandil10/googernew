"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";
import { verificationService, VerificationRecord } from "@/services/verificationService";
import { authService } from "@/services/authService";

// ─── Constants ───────────────────────────────────────────────────────────────
const STEPS = [
    { key: "personal",      label: "Personal Info" },
    { key: "identity",      label: "Identity" },
    { key: "authenticity",  label: "Authenticity" },
    { key: "business",      label: "Business" },
] as const;
type StepKey = typeof STEPS[number]["key"];

const DOCUMENT_TYPES = ["NIC", "Passport", "Driving License"] as const;

const COUNTRIES = [
    { name: "Afghanistan",           code: "AF" },
    { name: "Albania",               code: "AL" },
    { name: "Algeria",               code: "DZ" },
    { name: "Argentina",             code: "AR" },
    { name: "Australia",             code: "AU" },
    { name: "Austria",               code: "AT" },
    { name: "Bangladesh",            code: "BD" },
    { name: "Belgium",               code: "BE" },
    { name: "Brazil",                code: "BR" },
    { name: "Cambodia",              code: "KH" },
    { name: "Canada",                code: "CA" },
    { name: "Chile",                 code: "CL" },
    { name: "China",                 code: "CN" },
    { name: "Colombia",              code: "CO" },
    { name: "Croatia",               code: "HR" },
    { name: "Czech Republic",        code: "CZ" },
    { name: "Denmark",               code: "DK" },
    { name: "Egypt",                 code: "EG" },
    { name: "Ethiopia",              code: "ET" },
    { name: "Finland",               code: "FI" },
    { name: "France",                code: "FR" },
    { name: "Germany",               code: "DE" },
    { name: "Ghana",                 code: "GH" },
    { name: "Greece",                code: "GR" },
    { name: "Hungary",               code: "HU" },
    { name: "India",                 code: "IN" },
    { name: "Indonesia",             code: "ID" },
    { name: "Iran",                  code: "IR" },
    { name: "Iraq",                  code: "IQ" },
    { name: "Ireland",               code: "IE" },
    { name: "Israel",                code: "IL" },
    { name: "Italy",                 code: "IT" },
    { name: "Japan",                 code: "JP" },
    { name: "Jordan",                code: "JO" },
    { name: "Kenya",                 code: "KE" },
    { name: "Kuwait",                code: "KW" },
    { name: "Lebanon",               code: "LB" },
    { name: "Malaysia",              code: "MY" },
    { name: "Mexico",                code: "MX" },
    { name: "Morocco",               code: "MA" },
    { name: "Myanmar",               code: "MM" },
    { name: "Nepal",                 code: "NP" },
    { name: "Netherlands",           code: "NL" },
    { name: "New Zealand",           code: "NZ" },
    { name: "Nigeria",               code: "NG" },
    { name: "Norway",                code: "NO" },
    { name: "Pakistan",              code: "PK" },
    { name: "Philippines",           code: "PH" },
    { name: "Poland",                code: "PL" },
    { name: "Portugal",              code: "PT" },
    { name: "Qatar",                 code: "QA" },
    { name: "Romania",               code: "RO" },
    { name: "Russia",                code: "RU" },
    { name: "Saudi Arabia",          code: "SA" },
    { name: "Singapore",             code: "SG" },
    { name: "South Africa",          code: "ZA" },
    { name: "South Korea",           code: "KR" },
    { name: "Spain",                 code: "ES" },
    { name: "Sri Lanka",             code: "LK" },
    { name: "Sweden",                code: "SE" },
    { name: "Switzerland",           code: "CH" },
    { name: "Taiwan",                code: "TW" },
    { name: "Thailand",              code: "TH" },
    { name: "Turkey",                code: "TR" },
    { name: "Ukraine",               code: "UA" },
    { name: "United Arab Emirates",  code: "AE" },
    { name: "United Kingdom",        code: "GB" },
    { name: "United States",         code: "US" },
    { name: "Vietnam",               code: "VN" },
    { name: "Zimbabwe",              code: "ZW" },
] as const;

const toFlag = (code: string) =>
    [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");

// ─── Styles ───────────────────────────────────────────────────────────────────
const inputCls =
    "w-full bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 text-white text-sm font-bold focus:outline-none focus:ring-1 focus:ring-white/30 shadow-inner transition-all hover:bg-[#0b0b0b] placeholder-gray-600";

const labelCls = "block text-gray-400 text-xs font-semibold mb-2 tracking-wider uppercase";

// ─── Country selector ─────────────────────────────────────────────────────────
function CountrySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
                setSearch("");
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const filtered = COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );
    const selected = COUNTRIES.find(c => c.name === value);

    return (
        <div className="relative" ref={wrapRef}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 text-white text-sm font-bold focus:outline-none focus:ring-1 focus:ring-white/30 shadow-inner transition-all hover:bg-[#0b0b0b] flex items-center gap-2.5"
            >
                {selected ? (
                    <>
                        <span className="text-base leading-none">{toFlag(selected.code)}</span>
                        <span className="flex-1 text-left">{selected.name}</span>
                    </>
                ) : (
                    <span className="flex-1 text-left text-gray-600">Select country</span>
                )}
                <IonIcon name="chevron-down-outline" className="text-gray-500 shrink-0" />
            </button>
            {open && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#111] border border-gray-700/50 rounded-xl overflow-hidden shadow-2xl">
                    <div className="p-2 border-b border-gray-800">
                        <input
                            autoFocus
                            className="w-full bg-[#030303] border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none placeholder-gray-600"
                            placeholder="Search country…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                        {filtered.map(c => (
                            <button
                                key={c.code}
                                type="button"
                                onClick={() => { onChange(c.name); setOpen(false); setSearch(""); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left ${value === c.name ? "bg-white/[0.08] text-white" : "text-gray-300 hover:bg-white/[0.04]"}`}
                            >
                                <span className="text-base leading-none">{toFlag(c.code)}</span>
                                <span>{c.name}</span>
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <p className="px-3 py-5 text-xs text-gray-600 text-center">No countries found</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── File upload box ──────────────────────────────────────────────────────────
type UploadFile = { file: File; preview: string } | null;

function FileUploadBox({
    label, sublabel, name, value, onChange, required,
}: {
    label: string; sublabel: string; name: string;
    value: UploadFile; onChange: (f: UploadFile) => void; required?: boolean;
}) {
    const ref = useRef<HTMLInputElement>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        // Revoke previous object URL to avoid memory leaks
        if (value?.preview && value.preview.startsWith("blob:")) URL.revokeObjectURL(value.preview);
        const preview = URL.createObjectURL(f);
        onChange({ file: f, preview });
        // Reset input so same file can be re-selected
        e.target.value = "";
    };

    return (
        <div className="relative w-full">
            <input
                ref={ref}
                type="file"
                name={name}
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleChange}
            />
            <button
                type="button"
                onClick={() => ref.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 w-full rounded-xl border px-4 py-5 text-center transition-all shadow-inner ${
                    value
                        ? "border-emerald-500/30 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.07]"
                        : "border-gray-700/50 bg-[#030303] hover:bg-[#0b0b0b] hover:border-gray-600"
                }`}
            >
                {value ? (
                    <>
                        {value.file.type.startsWith("image/") ? (
                            // key forces img to remount when preview URL changes
                            <img
                                key={value.preview}
                                src={value.preview}
                                alt="preview"
                                className="h-24 w-full rounded-lg object-cover"
                                onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }}
                            />
                        ) : (
                            <div className="flex h-16 w-full items-center justify-center rounded-lg bg-white/5">
                                <IonIcon name="document-outline" className="text-3xl text-gray-500" />
                            </div>
                        )}
                        <div className="flex items-center gap-1.5">
                            <IonIcon name="checkmark-circle" className="text-emerald-400 text-sm shrink-0" />
                            <p className="truncate text-[10px] font-semibold text-emerald-400 max-w-full">{value.file.name}</p>
                        </div>
                        <p className="text-[9px] text-gray-600">Click to change</p>
                    </>
                ) : (
                    <>
                        <IonIcon name="cloud-upload-outline" className="text-2xl text-gray-600" />
                        <p className="text-xs font-bold text-gray-400">
                            {label}
                            {required && <span className="text-red-400 ml-1">*</span>}
                        </p>
                        <p className="text-[10px] text-gray-600">{sublabel}</p>
                    </>
                )}
            </button>
        </div>
    );
}

// ─── Status banner ────────────────────────────────────────────────────────────
function StatusBanner({ record, onResubmit }: { record: VerificationRecord; onResubmit: () => void }) {
    const configMap = {
        "Under Review": {
            icon: "time-outline", iconColor: "text-amber-400",
            border: "border-amber-400/20", bg: "bg-amber-400/[0.07]",
            title: "Under Review", titleColor: "text-amber-400",
            body: "Your verification application is currently being reviewed. We'll notify you within 7 business days.",
        },
        Verified: {
            icon: "shield-checkmark", iconColor: "text-emerald-400",
            border: "border-emerald-400/20", bg: "bg-emerald-400/[0.07]",
            title: "Account Verified", titleColor: "text-emerald-400",
            body: "Your account has been verified. A blue badge now appears next to your name.",
        },
        Rejected: {
            icon: "close-circle-outline", iconColor: "text-red-400",
            border: "border-red-500/20", bg: "bg-red-500/[0.07]",
            title: "Verification Rejected", titleColor: "text-red-400",
            body: record.rejection_reason || "Your application was not approved. Please review and resubmit.",
        },
    };
    const map = configMap[record.status as keyof typeof configMap];

    if (!map) return null;

    return (
        <div className={`rounded-2xl border ${map.border} ${map.bg} p-6 mb-6`}>
            <div className="flex items-start gap-4">
                <div className="shrink-0">
                    <IonIcon name={map.icon} className={`text-3xl ${map.iconColor}`} />
                </div>
                <div className="flex-1">
                    <p className={`text-sm font-bold mb-1 ${map.titleColor}`}>{map.title}</p>
                    <p className="text-xs text-gray-400 leading-relaxed">{map.body}</p>
                    {record.submitted_at && (
                        <p className="text-[10px] text-gray-600 mt-2">
                            Submitted: {new Date(record.submitted_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                        </p>
                    )}
                </div>
            </div>
            {record.status === "Rejected" && (
                <button
                    type="button"
                    onClick={onResubmit}
                    className="mt-4 w-full bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 text-white text-xs font-bold tracking-widest uppercase transition hover:bg-[#0b0b0b] shadow-inner"
                >
                    Resubmit Application
                </button>
            )}
        </div>
    );
}

// ─── Success popup ────────────────────────────────────────────────────────────
function SuccessPopup({ onDone }: { onDone: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="bg-[#070707] border border-gray-800 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-400/10 border border-emerald-400/20 mx-auto mb-5">
                    <IonIcon name="shield-checkmark" className="text-4xl text-emerald-400" />
                </div>
                <h2 className="text-lg font-bold text-white mb-3">Application Submitted</h2>
                <p className="text-sm text-gray-400 leading-relaxed mb-6">
                    Your verification request has been submitted successfully. The review process may take up to 7 business days.
                </p>
                <button
                    onClick={onDone}
                    className="w-full bg-white text-black rounded-xl py-3 text-xs font-bold uppercase tracking-widest transition hover:bg-gray-200"
                >
                    Done
                </button>
            </div>
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function VerificationPage() {
    const router = useRouter();
    const [existing, setExisting] = useState<VerificationRecord | null | undefined>(undefined);
    const [showForm, setShowForm] = useState(false);
    const [step, setStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [showSuccessPopup, setShowSuccessPopup] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── Form state ──
    const [fullName, setFullName]               = useState("");
    const [email, setEmail]                     = useState("");
    const [phone, setPhone]                     = useState("");
    const [address, setAddress]                 = useState("");
    const [dob, setDob]                         = useState("");
    const [country, setCountry]                 = useState("");
    const [docType, setDocType]                 = useState<typeof DOCUMENT_TYPES[number]>("NIC");
    const [docFront, setDocFront]               = useState<UploadFile>(null);
    const [docBack, setDocBack]                 = useState<UploadFile>(null);
    const [officialWebsite, setOfficialWebsite] = useState("");
    const [socialLinks, setSocialLinks]         = useState("");
    const [newsLinks, setNewsLinks]             = useState("");
    const [brandProof, setBrandProof]           = useState<UploadFile>(null);
    const [vatNumber, setVatNumber]             = useState("");
    const [businessWebsite, setBusinessWebsite] = useState("");
    const [businessReg, setBusinessReg]         = useState<UploadFile>(null);
    const [companyDocs, setCompanyDocs]         = useState<UploadFile>(null);

    const requiresBack = docType !== "Passport";

    useEffect(() => {
        verificationService.getStatus()
            .then((rec) => {
                setExisting(rec);
                if (!rec) setShowForm(true);
            })
            .catch(() => setExisting(null));

        authService.getProfile().then((p) => {
            setFullName(p.full_name || p.username || "");
            setEmail(p.email || "");
            setPhone(p.phone_number || "");
            setCountry(p.country || "");
        }).catch(() => {});
    }, []);

    // Reset back photo when switching away from NIC/DL
    useEffect(() => {
        if (!requiresBack) setDocBack(null);
    }, [docType, requiresBack]);

    const handleSubmit = async () => {
        if (!fullName || !email || !docType || !docFront || (requiresBack && !docBack)) {
            setError("Please fill in all required fields.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const fd = new FormData();
            fd.append("fullName", fullName);
            fd.append("email", email);
            fd.append("phone", phone);
            fd.append("address", address);
            fd.append("dateOfBirth", dob);
            fd.append("country", country);
            fd.append("documentType", docType);
            fd.append("officialWebsite", officialWebsite);
            fd.append("socialLinks", socialLinks);
            fd.append("newsLinks", newsLinks);
            fd.append("vatNumber", vatNumber);
            fd.append("businessWebsite", businessWebsite);
            if (docFront?.file)    fd.append("docFront",    docFront.file);
            if (docBack?.file)     fd.append("docBack",     docBack.file);
            if (brandProof?.file)  fd.append("brandProof",  brandProof.file);
            if (businessReg?.file) fd.append("businessReg", businessReg.file);
            if (companyDocs?.file) fd.append("companyDocs", companyDocs.file);

            await verificationService.submit(fd);
            setShowForm(false);
            setExisting({ status: "Under Review", submitted_at: new Date().toISOString() } as any);
            setShowSuccessPopup(true);
        } catch (err: any) {
            setError(err?.message || "Submission failed. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const isLoading = existing === undefined;
    const currentStep = STEPS[step].key as StepKey;

    const canProceed = () => {
        if (currentStep === "personal")
            return !!fullName && !!email && !!address && !!dob && !!country;
        if (currentStep === "identity")
            return !!docType && !!docFront && (!requiresBack || !!docBack);
        return true;
    };

    return (
        <div className="pb-10 relative min-h-screen">
            {/* Success popup */}
            {showSuccessPopup && (
                <SuccessPopup onDone={() => { setShowSuccessPopup(false); router.push("/wallet"); }} />
            )}

            {/* Back navigation */}
            <div className="mb-4">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
                >
                    <IonIcon name="chevron-back-outline" className="text-xl" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Back</span>
                </button>
            </div>

            {/* Apply button — shown only when no existing record */}
            {!isLoading && !existing && !showForm && (
                <button
                    onClick={() => setShowForm(true)}
                    className="w-full mb-6 flex items-center justify-center gap-2 bg-white text-black rounded-xl py-3.5 text-xs font-bold uppercase tracking-widest transition hover:bg-gray-200"
                >
                    <IonIcon name="shield-checkmark-outline" className="text-sm" />
                    Apply for Verification
                </button>
            )}

            {/* Status banner */}
            {!isLoading && existing && !showForm && (
                <StatusBanner record={existing} onResubmit={() => { setShowForm(true); setStep(0); }} />
            )}

            {/* Loading */}
            {isLoading && (
                <div className="bg-[#070707] border border-gray-800 rounded-2xl p-16 flex items-center justify-center shadow-lg">
                    <IonIcon name="reload-outline" className="animate-spin text-3xl text-gray-600" />
                </div>
            )}

            {/* Main form card */}
            {!isLoading && showForm && (
                <div className="bg-[#070707] border border-gray-800 rounded-2xl overflow-hidden mb-20 shadow-lg">

                    {/* Step tabs */}
                    <div className="border-b border-gray-800 px-6">
                        <div className="flex gap-6 overflow-x-auto scrollbar-hide">
                            {STEPS.map((s, i) => (
                                <button
                                    key={s.key}
                                    type="button"
                                    onClick={() => { if (i < step || (i === step + 1 && canProceed())) setStep(i); }}
                                    className={`pb-3 pt-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${
                                        step === i
                                            ? "text-white border-white"
                                            : i < step
                                            ? "text-emerald-400 border-transparent"
                                            : "text-gray-500 border-transparent"
                                    }`}
                                >
                                    {i < step ? (
                                        <span className="flex items-center gap-1.5">
                                            <IonIcon name="checkmark-circle" className="text-emerald-400 text-base" />
                                            {s.label}
                                        </span>
                                    ) : s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Step content */}
                    <div className="p-6 md:p-8 min-h-[420px]">
                        <div className="max-w-md mx-auto">

                            {/* ── Step 1: Personal Info ── */}
                            {currentStep === "personal" && (
                                <div>
                                    <h4 className="text-lg font-bold text-white mb-1">Personal Information</h4>
                                    <p className="text-xs text-gray-500 mb-6">
                                        Provide your personal details to confirm your identity. Fields marked <span className="text-red-400">*</span> are required.
                                    </p>

                                    <div className="space-y-5">
                                        <div>
                                            <label className={labelCls}>Full Name <span className="text-red-400">*</span></label>
                                            <input className={inputCls} placeholder="Enter your legal full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Email Address <span className="text-red-400">*</span></label>
                                            <input className={inputCls} type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Phone Number <span className="text-gray-600">(optional)</span></label>
                                            <input className={inputCls} type="tel" placeholder="+1 234 567 8900" value={phone} onChange={(e) => setPhone(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Address <span className="text-red-400">*</span></label>
                                            <textarea className={`${inputCls} resize-none`} rows={2} placeholder="Your residential address" value={address} onChange={(e) => setAddress(e.target.value)} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className={labelCls}>Date of Birth <span className="text-red-400">*</span></label>
                                                <input className={inputCls} type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                                            </div>
                                            <div>
                                                <label className={labelCls}>Country <span className="text-red-400">*</span></label>
                                                <CountrySelect value={country} onChange={setCountry} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── Step 2: Identity ── */}
                            {currentStep === "identity" && (
                                <div>
                                    <h4 className="text-lg font-bold text-white mb-1">Identity Documents</h4>
                                    <p className="text-xs text-gray-500 mb-6">
                                        Upload clear photos of your identification document. Photos must be legible and unobstructed.
                                    </p>

                                    <div className="space-y-5">
                                        <div>
                                            <label className={labelCls}>Document Type <span className="text-red-400">*</span></label>
                                            <div className="flex gap-2">
                                                {DOCUMENT_TYPES.map(d => (
                                                    <button
                                                        key={d}
                                                        type="button"
                                                        onClick={() => setDocType(d)}
                                                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                                                            docType === d
                                                                ? "bg-white text-black border-transparent"
                                                                : "bg-[#030303] border-gray-700/50 text-gray-400 hover:bg-[#0b0b0b]"
                                                        }`}
                                                    >
                                                        {d}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label className={labelCls}>
                                                Upload Photos <span className="text-red-400">*</span>
                                                {docType === "Passport" && (
                                                    <span className="ml-2 text-gray-600 normal-case tracking-normal font-normal">Front only</span>
                                                )}
                                                {requiresBack && (
                                                    <span className="ml-2 text-gray-600 normal-case tracking-normal font-normal">Front &amp; Back required</span>
                                                )}
                                            </label>
                                            <div className={`grid gap-3 ${requiresBack ? "grid-cols-2" : "grid-cols-1"}`}>
                                                <FileUploadBox
                                                    label={`Front of ${docType}`}
                                                    sublabel="JPG, PNG or PDF"
                                                    name="docFront"
                                                    value={docFront}
                                                    onChange={setDocFront}
                                                    required
                                                />
                                                {requiresBack && (
                                                    <FileUploadBox
                                                        label={`Back of ${docType}`}
                                                        sublabel="JPG, PNG or PDF"
                                                        name="docBack"
                                                        value={docBack}
                                                        onChange={setDocBack}
                                                        required
                                                    />
                                                )}
                                            </div>
                                        </div>

                                        <div className="bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 shadow-inner">
                                            <p className="text-[10px] text-gray-500 leading-relaxed">
                                                Photos will only be used to confirm your identity and will be submitted for deletion when the review process is complete.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── Step 3: Authenticity Proof (all optional) ── */}
                            {currentStep === "authenticity" && (
                                <div>
                                    <h4 className="text-lg font-bold text-white mb-1">Confirm Notability</h4>
                                    <p className="text-xs text-gray-500 mb-1">
                                        Show that the public figure, celebrity, or brand your account represents is in the public interest.
                                    </p>
                                    <p className="text-[10px] text-gray-600 mb-6 uppercase tracking-wider font-semibold">All fields optional</p>

                                    <div className="space-y-5">
                                        <div>
                                            <label className={labelCls}>Official Website</label>
                                            <input className={inputCls} type="url" placeholder="https://yourwebsite.com" value={officialWebsite} onChange={(e) => setOfficialWebsite(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Instagram / YouTube / Social Links</label>
                                            <textarea
                                                className={`${inputCls} resize-none`}
                                                rows={3}
                                                placeholder={"https://instagram.com/yourhandle\nhttps://youtube.com/@yourchannel"}
                                                value={socialLinks}
                                                onChange={(e) => setSocialLinks(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelCls}>News / Article Links</label>
                                            <textarea
                                                className={`${inputCls} resize-none`}
                                                rows={3}
                                                placeholder={"https://news.com/article-about-you\nhttps://magazine.com/feature"}
                                                value={newsLinks}
                                                onChange={(e) => setNewsLinks(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Brand Ownership Proof</label>
                                            <FileUploadBox
                                                label="Upload brand proof"
                                                sublabel="Trademark cert, logo rights, etc."
                                                name="brandProof"
                                                value={brandProof}
                                                onChange={setBrandProof}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── Step 4: Business (all optional) ── */}
                            {currentStep === "business" && (
                                <div>
                                    <h4 className="text-lg font-bold text-white mb-1">Business Verification</h4>
                                    <p className="text-xs text-gray-500 mb-1">Recommended for business sellers, brands, and organisations.</p>
                                    <p className="text-[10px] text-gray-600 mb-6 uppercase tracking-wider font-semibold">All fields optional — skip if not applicable</p>

                                    <div className="space-y-5">
                                        <div>
                                            <label className={labelCls}>VAT / Tax Number</label>
                                            <input className={inputCls} placeholder="Your VAT or tax registration number" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Official Business Website</label>
                                            <input className={inputCls} type="url" placeholder="https://business.com" value={businessWebsite} onChange={(e) => setBusinessWebsite(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Business Registration Certificate</label>
                                            <FileUploadBox
                                                label="Upload registration certificate"
                                                sublabel="PDF or image"
                                                name="businessReg"
                                                value={businessReg}
                                                onChange={setBusinessReg}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Company Documents</label>
                                            <FileUploadBox
                                                label="Upload company documents"
                                                sublabel="Memorandum, articles, etc."
                                                name="companyDocs"
                                                value={companyDocs}
                                                onChange={setCompanyDocs}
                                            />
                                        </div>
                                    </div>

                                    {/* Summary before submit */}
                                    <div className="mt-6 bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-4 shadow-inner space-y-1.5">
                                        <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">Review Summary</p>
                                        {[
                                            { label: "Full Name",  value: fullName },
                                            { label: "Email",      value: email },
                                            { label: "Document",   value: docType },
                                            { label: "Country",    value: country || "—" },
                                            { label: "Address",    value: address || "—" },
                                        ].map(({ label, value }) => (
                                            <div key={label} className="flex items-center justify-between gap-3">
                                                <span className="text-[10px] text-gray-500">{label}</span>
                                                <span className="text-[10px] font-bold text-gray-300 text-right truncate max-w-[200px]">{value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="mt-4 bg-[#030303] border border-red-500/20 rounded-xl px-4 py-3 flex items-start gap-3 shadow-inner">
                                    <IonIcon name="alert-circle-outline" className="text-red-400 text-base shrink-0 mt-0.5" />
                                    <p className="text-xs text-red-300">{error}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Navigation footer */}
                    <div className="border-t border-gray-800 px-6 md:px-8 py-5">
                        <div className="max-w-md mx-auto flex items-center gap-3">
                            {step > 0 && (
                                <button
                                    type="button"
                                    onClick={() => { setError(null); setStep((s) => s - 1); }}
                                    className="flex items-center gap-2 bg-[#030303] border border-gray-700/50 rounded-xl px-5 py-3 text-white text-xs font-bold uppercase tracking-widest transition-all hover:bg-[#0b0b0b] shadow-inner"
                                >
                                    <IonIcon name="chevron-back-outline" className="text-sm" />
                                    Previous
                                </button>
                            )}

                            {step < STEPS.length - 1 ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!canProceed()) {
                                            setError("Please fill in all required fields before continuing.");
                                            return;
                                        }
                                        setError(null);
                                        setStep((s) => s + 1);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 bg-white text-black rounded-xl px-5 py-3 text-xs font-bold uppercase tracking-widest transition-all hover:bg-gray-200 shadow-inner"
                                >
                                    Next Step
                                    <IonIcon name="chevron-forward-outline" className="text-sm" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={submitting}
                                    className="flex-1 flex items-center justify-center gap-2 bg-white text-black rounded-xl px-5 py-3 text-xs font-bold uppercase tracking-widest transition-all hover:bg-gray-200 shadow-inner disabled:opacity-50"
                                >
                                    {submitting ? (
                                        <>
                                            <IonIcon name="reload-outline" className="animate-spin text-sm" />
                                            Submitting…
                                        </>
                                    ) : (
                                        <>
                                            <IonIcon name="shield-checkmark-outline" className="text-sm" />
                                            Submit Application
                                        </>
                                    )}
                                </button>
                            )}
                        </div>

                        {/* Step dots */}
                        <div className="flex items-center justify-center gap-2 mt-4">
                            {STEPS.map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-white" : i < step ? "w-3 bg-emerald-400" : "w-3 bg-gray-700"}`}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
