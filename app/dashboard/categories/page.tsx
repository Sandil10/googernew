"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";
import { authService } from "@/services/authService";
import { categoryService, notifyCategoryTreeChanged } from "@/services/categoryService";

type AdminUser = {
    id?: number;
    user_type?: string;
    username?: string;
    full_name?: string;
    email?: string;
};

type ManagedCategoryNode = {
    id: number;
    name: string;
    parent_id: number | null;
    level: number;
    commission_percentage: number;
    sort_order: number;
    is_active: boolean;
    children?: ManagedCategoryNode[];
};

type CategoryFormState = {
    name: string;
    parentId: string;
    commissionPercentage: string;
    sortOrder: string;
    isActive: boolean;
};

const emptyForm = (): CategoryFormState => ({
    name: "",
    parentId: "",
    commissionPercentage: "0",
    sortOrder: "0",
    isActive: true,
});

const CATEGORY_SYNC_EVENT = "googer-categories-updated";

const flattenCategories = (nodes: ManagedCategoryNode[], parentLabel = "Root"): Array<{ node: ManagedCategoryNode; parentLabel: string }> => {
    const result: Array<{ node: ManagedCategoryNode; parentLabel: string }> = [];

    const walk = (items: ManagedCategoryNode[], currentParent: string) => {
        items.forEach((node) => {
            result.push({ node, parentLabel: currentParent });
            if (node.children?.length) {
                walk(node.children, node.name);
            }
        });
    };

    walk(nodes, parentLabel);
    return result;
};

const formatCommission = (value: number | string) => {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric.toFixed(numeric % 1 === 0 ? 0 : 2) : "0";
};

export default function DashboardCategoriesPage() {
    const router = useRouter();
    const [user, setUser] = useState<AdminUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingGlobalCommission, setSavingGlobalCommission] = useState(false);
    const [savingManualCommissionEnabled, setSavingManualCommissionEnabled] = useState(false);
    const [error, setError] = useState("");
    const [tree, setTree] = useState<ManagedCategoryNode[]>([]);
    const [globalCommission, setGlobalCommission] = useState("0");
    const [manualCommissionEnabled, setManualCommissionEnabled] = useState(false);
    const [form, setForm] = useState<CategoryFormState>(emptyForm());
    const [editingId, setEditingId] = useState<number | null>(null);

    const loadPage = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            if (!authService.isAuthenticated()) {
                router.push("/dashboard/settings");
                return;
            }

            const profile = await authService.getProfile();
            if (profile?.user_type !== "admin") {
                router.push("/dashboard/settings");
                return;
            }

            setUser(profile);
            const [categories, commission, manualEnabled] = await Promise.all([
                categoryService.getAdminTree(),
                categoryService.getGlobalCategoryCommission().catch(() => 0),
                categoryService.getManualCategoryCommissionEnabled().catch(() => false),
            ]);
            setTree(Array.isArray(categories) ? categories : []);
            setGlobalCommission(String(Number.isFinite(Number(commission)) ? commission : 0));
            setManualCommissionEnabled(Boolean(manualEnabled));
        } catch (err: any) {
            console.error("Failed to load admin categories:", err);
            setError(err?.message || "Failed to load categories.");
            if (String(err?.message || "").toLowerCase().includes("admin")) {
                router.push("/dashboard/settings");
            }
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        loadPage();
    }, [loadPage]);

    const flatNodes = useMemo(() => flattenCategories(tree), [tree]);
    const parentOptions = useMemo(() => flatNodes.filter(({ node }) => node.level < 3 && node.is_active), [flatNodes]);

    const dispatchRefresh = useCallback(() => {
        notifyCategoryTreeChanged();
    }, []);

    const saveGlobalCommission = async () => {
        try {
            setSavingGlobalCommission(true);
            setError("");
            const commission = Number(globalCommission);
            await categoryService.setGlobalCategoryCommission(Number.isFinite(commission) ? commission : 0);
            notifyCategoryTreeChanged();
        } catch (err: any) {
            setError(err?.message || "Failed to save global commission.");
        } finally {
            setSavingGlobalCommission(false);
        }
    };

    const saveManualCommissionEnabled = async (nextEnabled: boolean) => {
        try {
            setSavingManualCommissionEnabled(true);
            setError("");
            await categoryService.setManualCategoryCommissionEnabled(nextEnabled);
            setManualCommissionEnabled(nextEnabled);
            notifyCategoryTreeChanged();
        } catch (err: any) {
            setError(err?.message || "Failed to save manual commission toggle.");
        } finally {
            setSavingManualCommissionEnabled(false);
        }
    };

    const startCreate = (parentId: string = "") => {
        setEditingId(null);
        setForm({
            ...emptyForm(),
            parentId,
        });
    };

    const startEdit = (node: ManagedCategoryNode) => {
        setEditingId(node.id);
        setForm({
            name: node.name,
            parentId: node.parent_id ? String(node.parent_id) : "",
            commissionPercentage: String(node.commission_percentage ?? 0),
            sortOrder: String(node.sort_order ?? 0),
            isActive: node.is_active !== false,
        });
    };

    const submitCategory = async () => {
        if (!form.name.trim()) {
            setError("Category name is required.");
            return;
        }

        try {
            setSaving(true);
            setError("");

            const payload = {
                name: form.name.trim(),
                parentId: form.parentId ? Number(form.parentId) : null,
                commissionPercentage: form.commissionPercentage,
                sortOrder: form.sortOrder,
                isActive: form.isActive,
            };

            if (editingId) {
                await categoryService.updateCategory(editingId, {
                    name: payload.name,
                    commissionPercentage: payload.commissionPercentage,
                    sortOrder: payload.sortOrder,
                    isActive: payload.isActive,
                });
            } else {
                await categoryService.createCategory(payload);
            }

            const categories = await categoryService.getAdminTree();
            setTree(Array.isArray(categories) ? categories : []);
            setForm(emptyForm());
            setEditingId(null);
            dispatchRefresh();
        } catch (err: any) {
            setError(err?.message || "Failed to save category.");
        } finally {
            setSaving(false);
        }
    };

    const deleteCategory = async (node: ManagedCategoryNode) => {
        const confirmed = window.confirm(`Delete ${node.name}? This will hide the category and its children.`);
        if (!confirmed) return;

        try {
            setSaving(true);
            setError("");
            await categoryService.deleteCategory(node.id);
            const categories = await categoryService.getAdminTree();
            setTree(Array.isArray(categories) ? categories : []);
            if (editingId === node.id) {
                setEditingId(null);
                setForm(emptyForm());
            }
            dispatchRefresh();
        } catch (err: any) {
            setError(err?.message || "Failed to delete category.");
        } finally {
            setSaving(false);
        }
    };

    const renderTree = (nodes: ManagedCategoryNode[], depth = 0) => (
        <div className="space-y-3">
            {nodes.map((node) => (
                <div key={node.id} className="rounded-3xl border border-white/8 bg-white/[0.03] p-4" style={{ marginLeft: depth * 14 }}>
                    <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-sm font-black text-white">{node.name}</h3>
                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${node.is_active ? "bg-emerald-500/15 text-emerald-300" : "bg-white/8 text-white/45"}`}>
                                    Level {node.level}
                                </span>
                                {!node.is_active && (
                                    <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-red-300">
                                        Inactive
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-xs text-white/45">
                                Parent: {node.parent_id ? flatNodes.find((item) => item.node.id === node.parent_id)?.node.name || "Unknown" : "Root"}
                            </p>
                            <p className="mt-1 text-xs text-white/45">
                                Commission: {formatCommission(node.commission_percentage)}%
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {node.level < 3 && node.is_active && (
                                <button
                                    type="button"
                                    onClick={() => startCreate(String(node.id))}
                                    className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.08]"
                                >
                                    Add Child
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => startEdit(node)}
                                className="rounded-xl bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-black transition hover:bg-zinc-200"
                            >
                                Edit
                            </button>
                            <button
                                type="button"
                                onClick={() => deleteCategory(node)}
                                className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-red-200 transition hover:bg-red-500/15"
                            >
                                Delete
                            </button>
                        </div>
                    </div>

                    {node.children?.length ? (
                        <div className="mt-4 space-y-3">
                            {renderTree(node.children, depth + 1)}
                        </div>
                    ) : null}
                </div>
            ))}
        </div>
    );

    if (loading) {
        return <div className="flex min-h-[60vh] items-center justify-center text-white/50">Loading categories...</div>;
    }

    return (
        <div className="mx-auto max-w-7xl px-4 py-6 text-white md:px-6">
            <div className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-white/8 bg-[#0c0c0f] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.35)] min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
                <div>
                    <h1 className="text-xl font-black tracking-tight">Managed Categories</h1>
                    <p className="mt-1 text-sm text-white/45">Edit the DB-backed category tree and commissions used by product creation.</p>
                    {user?.username ? <p className="mt-2 text-xs text-white/35">Signed in as @{user.username}</p> : null}
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => router.push("/dashboard/settings")}
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-white/[0.08]"
                    >
                        Back
                    </button>
                    <button
                        type="button"
                        onClick={() => startCreate()}
                        className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-black transition hover:bg-zinc-200"
                    >
                        Add Category
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {error}
                </div>
            )}

            <div className="grid gap-5 min-[1100px]:grid-cols-[360px_minmax(0,1fr)]">
                <section className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-5">
                    <div className="mb-4">
                        <h2 className="text-base font-black text-white">{editingId ? "Edit Category" : "Add Category"}</h2>
                        <p className="mt-1 text-xs text-white/45">
                            {editingId ? "Update the selected category's name, commission, order, or active state." : "Create a root category or a child category under an existing node."}
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                            <div className="mb-3">
                                <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Global Category Commission</span>
                                <p className="mt-1 text-[11px] text-white/45">This value is shown in Add Product as Googer Comm. (%) when manual entry is off.</p>
                            </div>
                            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Manual Googer Comm.</p>
                                    <p className="mt-1 text-[11px] text-white/45">
                                        {manualCommissionEnabled ? "Add Product can type any commission value." : "Add Product will show the saved global commission value."}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => saveManualCommissionEnabled(!manualCommissionEnabled)}
                                    disabled={savingManualCommissionEnabled}
                                    className={`inline-flex min-w-[110px] items-center justify-center rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-60 ${manualCommissionEnabled ? "bg-emerald-500/15 text-emerald-300" : "bg-white/8 text-white/45"}`}
                                >
                                    {savingManualCommissionEnabled ? "Saving..." : manualCommissionEnabled ? "On" : "Off"}
                                </button>
                            </div>
                            <div className="flex gap-3">
                                <input
                                    type="number"
                                    value={globalCommission}
                                    onChange={(e) => setGlobalCommission(e.target.value)}
                                    className="w-full rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                                    placeholder="0"
                                />
                                <button
                                    type="button"
                                    onClick={saveGlobalCommission}
                                    disabled={savingGlobalCommission}
                                    className="rounded-2xl bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {savingGlobalCommission ? "Saving..." : "Save"}
                                </button>
                            </div>
                        </div>

                        <label className="block space-y-2">
                            <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Name</span>
                            <input
                                value={form.name}
                                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                className="w-full rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                                placeholder="Category name"
                            />
                        </label>

                        <label className="block space-y-2">
                            <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Parent</span>
                            <select
                                value={form.parentId}
                                onChange={(e) => setForm((prev) => ({ ...prev, parentId: e.target.value }))}
                                disabled={!!editingId}
                                className="w-full rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <option value="">Root</option>
                                {parentOptions.map(({ node }) => (
                                    <option key={node.id} value={node.id}>
                                        {node.name} (Level {node.level})
                                    </option>
                                ))}
                            </select>
                            {editingId && <p className="text-[11px] text-white/35">Parent is locked while editing to keep product categories stable.</p>}
                        </label>

                        <div className="grid gap-4 min-[900px]:grid-cols-2">
                            <label className="block space-y-2">
                                <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Commission %</span>
                                <input
                                    type="number"
                                    value={form.commissionPercentage}
                                    onChange={(e) => setForm((prev) => ({ ...prev, commissionPercentage: e.target.value }))}
                                    className="w-full rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                                    placeholder="0"
                                />
                            </label>
                            <label className="block space-y-2">
                                <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Sort Order</span>
                                <input
                                    type="number"
                                    value={form.sortOrder}
                                    onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                                    className="w-full rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                                    placeholder="0"
                                />
                            </label>
                        </div>

                        <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                            <div>
                                <span className="block text-[11px] font-semibold uppercase tracking-widest text-white/35">Active</span>
                                <span className="block text-xs text-white/45">Inactive categories stay hidden from product creation.</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setForm((prev) => ({ ...prev, isActive: !prev.isActive }))}
                                className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] transition ${form.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-white/8 text-white/45"}`}
                            >
                                {form.isActive ? "Active" : "Hidden"}
                            </button>
                        </label>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={submitCategory}
                                disabled={saving}
                                className="flex-1 rounded-2xl bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {saving ? "Saving..." : editingId ? "Update Category" : "Create Category"}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingId(null);
                                    setForm(emptyForm());
                                }}
                                className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/[0.08]"
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                </section>

                <section className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-base font-black text-white">Managed Category Tree</h2>
                            <p className="mt-1 text-xs text-white/45">Changes here update the live category picker for product creation.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => loadPage()}
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.08]"
                        >
                            Refresh
                        </button>
                    </div>

                    {tree.length > 0 ? renderTree(tree) : (
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-6 text-sm text-white/45">
                            No categories found.
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
