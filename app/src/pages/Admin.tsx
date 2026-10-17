import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { AddProductModal } from "./Home";
import type { Product } from "@db/schema";
import { useLanguage } from "@/providers/LanguageContext";
import { useAuth } from "@/providers/AuthContext";
import { AdminRequestsPanel } from "@/components/AdminRequestsPanel";
import { ProductStockHistoryModal, formatStockDateDetails } from "@/components/ProductStockHistoryModal";
import { getMeta } from "@/lib/catMeta";
import { getProductImage, getCategoryFallbackImage } from "@/lib/productImages";

type AdminMenuTab = "products" | "branches" | "employees" | "requests" | "submissions" | "transfers";

export default function Admin() {
  const navigate = useNavigate();
  const { lang, toggleLang, t, getProductName, getCategoryName, getBranchName, getUnitName } = useLanguage();
  const { session, logout, selectedBranch, setSelectedBranch, branchesList } = useAuth();

  useEffect(() => {
    if (!session || session.role !== "admin") {
      navigate("/");
    }
  }, [session, navigate]);

  if (!session || session.role !== "admin") return null;

  // Selected Sidebar Tab (Default: products or branches)
  const [activeMenu, setActiveMenu] = useState<AdminMenuTab>("products");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Transfers query for sidebar badge
  const transfersQuery = trpc.inventory.listTransfers.useQuery();
  const allTransfers = transfersQuery.data ?? [];
  const pendingTransfersCount = allTransfers.filter(
    (t) => t.status === "pending_admin_initial" || t.status === "dispatched_by_source"
  ).length;

  // Dynamic counts for sidebar badges
  const [counts, setCounts] = useState({
    pendingRequests: 0,
    pendingSubmissions: 0,
    employeesCount: 0,
    branchesCount: branchesList.length,
  });

  const utils = trpc.useUtils();
  const listQuery = trpc.inventory.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  // Search & Category & Visibility filter states for Products
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState("ALL");
  const [visibilityFilter, setVisibilityFilter] = useState<"ALL" | "VISIBLE" | "HIDDEN">("ALL");

  const addMut = trpc.inventory.add.useMutation({
    onSuccess: () => {
      utils.inventory.list.invalidate();
      setShowAdd(false);
    },
  });

  const editMut = trpc.inventory.edit.useMutation({
    onSuccess: () => {
      utils.inventory.list.invalidate();
      setEditing(null);
    },
  });

  const toggleVisibilityMut = trpc.inventory.toggleVisibility.useMutation({
    onSuccess: () => {
      utils.inventory.list.invalidate();
    },
  });

  const removeMut = trpc.inventory.remove.useMutation({
    onSuccess: () => utils.inventory.list.invalidate(),
  });

  const products = listQuery.data ?? [];
  const allCategories = useMemo(() => Array.from(new Set(products.map((p) => p.category))), [products]);
  const hiddenCount = useMemo(() => products.filter((p) => !!p.isHidden).length, [products]);
  const visibleCount = useMemo(() => products.filter((p) => !p.isHidden).length, [products]);

  // Filter products by search term (name / code), category tab, and visibility
  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase().trim();
    return products.filter((p) => {
      const catEn = getCategoryName(p.category).toLowerCase();
      const matchSearch =
        !term ||
        p.nameAr.toLowerCase().includes(term) ||
        (p.nameEn && p.nameEn.toLowerCase().includes(term)) ||
        p.code.includes(term) ||
        p.category.toLowerCase().includes(term) ||
        catEn.includes(term);

      const matchCat = selectedCat === "ALL" || p.category === selectedCat;
      const matchVisibility =
        visibilityFilter === "ALL" ||
        (visibilityFilter === "VISIBLE" && !p.isHidden) ||
        (visibilityFilter === "HIDDEN" && !!p.isHidden);

      return matchSearch && matchCat && matchVisibility;
    });
  }, [products, search, selectedCat, visibilityFilter, getCategoryName]);

  // Group filtered products by category in a single O(N) pass
  const groupedProducts = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (let i = 0; i < filteredProducts.length; i++) {
      const p = filteredProducts[i];
      let arr = map.get(p.category);
      if (!arr) {
        arr = [];
        map.set(p.category, arr);
      }
      arr.push(p);
    }
    const groups: { category: string; items: Product[] }[] = [];
    map.forEach((items, category) => {
      groups.push({ category, items });
    });
    return groups;
  }, [filteredProducts]);

  // Sidebar Menu Items
  const menuItems: {
    id: AdminMenuTab;
    label: string;
    subLabel: string;
    icon: string;
    badge?: number;
    badgeTone?: "purple" | "orange" | "emerald" | "slate";
  }[] = [
    {
      id: "products",
      label: lang === "ar" ? "كتالوج المنتجات" : "Product Catalog",
      subLabel: lang === "ar" ? "إضافة وتعديل وحذف الأصناف" : "Add, Edit, and Manage Products",
      icon: "ph-package",
      badge: products.length,
      badgeTone: "purple",
    },
    {
      id: "branches",
      label: lang === "ar" ? "إدارة الفروع" : "Branches Management",
      subLabel: lang === "ar" ? "الفروع والتحكم ودخول الفرع" : "Control branches & direct entry",
      icon: "ph-storefront",
      badge: counts.branchesCount || branchesList.length,
      badgeTone: "slate",
    },
    {
      id: "employees",
      label: lang === "ar" ? "الموظفين المعتمدين" : "Active Employees",
      subLabel: lang === "ar" ? "قائمة الحسابات والنقل والصلاحيات" : "Accounts, transfer & permissions",
      icon: "ph-users",
      badge: counts.employeesCount || undefined,
      badgeTone: "slate",
    },
    {
      id: "requests",
      label: lang === "ar" ? "طلبات التسجيل" : "Pending Requests",
      subLabel: lang === "ar" ? "موافقة ورفض طلبات الانضمام" : "Approve/reject staff requests",
      icon: "ph-clock",
      badge: counts.pendingRequests,
      badgeTone: counts.pendingRequests > 0 ? "orange" : "slate",
    },
    {
      id: "submissions",
      label: lang === "ar" ? "تنبيهات البضاعة والجرد" : "Orders & Audits",
      subLabel: lang === "ar" ? "طلبات المستودع وتقارير الجرد" : "Warehouse orders & audit reports",
      icon: "ph-bell-ringing",
      badge: counts.pendingSubmissions,
      badgeTone: counts.pendingSubmissions > 0 ? "emerald" : "slate",
    },
    {
      id: "transfers",
      label: lang === "ar" ? "التحويلات بين الفروع" : "Branch Transfers",
      subLabel: lang === "ar" ? "اعتماد طلبات النقل والأرشيف" : "Approve transfers & archive",
      icon: "ph-arrows-left-right",
      badge: pendingTransfersCount > 0 ? pendingTransfersCount : (allTransfers.length || undefined),
      badgeTone: pendingTransfersCount > 0 ? "orange" : "slate",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col" dir={lang === "ar" ? "rtl" : "ltr"}>
      {/* ── Top Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
        <div className="mx-auto flex w-full items-center justify-between px-2.5 sm:px-4 py-2.5 sm:py-3.5">
          {/* Logo & Sidebar Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden w-9 h-9 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center transition shrink-0 active:scale-95"
              title="Toggle Menu"
            >
              <i className="ph-bold ph-list text-xl"></i>
            </button>

            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-purple-700 shadow-md shadow-purple-700/30 shrink-0">
              <i className="ph-bold ph-shield-check text-white text-lg sm:text-xl"></i>
            </div>
            <div className="min-w-0">
              <p className="text-[9.5px] sm:text-[10px] font-bold uppercase tracking-[0.18em] text-purple-600 truncate">Admin Control</p>
              <h1 className="text-sm sm:text-lg font-black text-slate-900 leading-tight truncate">{t("adminPanel")}</h1>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Branch Selector Dropdown (Desktop) */}
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 shadow-sm">
              <i className="ph-bold ph-storefront text-slate-500 text-base"></i>
              <span className="text-[11px] text-slate-500 font-normal">{lang === "en" ? "Branch:" : "الفرع:"}</span>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="bg-transparent border-none outline-none font-black text-xs cursor-pointer text-slate-900"
                title={lang === "en" ? "Select branch to manage all products" : "اختر الفرع للتحكم بمنتجاته بالكامل"}
              >
                {branchesList.map((b) => (
                  <option key={b.branch_code} value={b.branch_code}>
                    {b.branch_code} - {getBranchName(b.branch_code, b.branch_name)}
                  </option>
                ))}
              </select>
            </div>

            {/* Enter Branch Button */}
            <button
              onClick={() => navigate("/")}
              title={lang === "en" ? "Enter Selected Branch & Inventory" : "دخول الفرع والجرد"}
              className="rounded-xl bg-emerald-600 px-2.5 sm:px-3 py-1.5 sm:py-2 font-bold text-white shadow-sm hover:bg-emerald-700 text-xs flex items-center gap-1 sm:gap-1.5 transition active:scale-95"
            >
              <i className="ph-bold ph-storefront text-sm"></i>
              <span className="hidden sm:inline">{lang === "ar" ? "دخول الفرع" : "Enter Branch"}</span>
            </button>

            {/* Language toggle */}
            <button
              onClick={toggleLang}
              title={t("langTitle")}
              className="rounded-xl bg-blue-600 px-2.5 sm:px-3 py-1.5 sm:py-2 font-black text-white shadow-sm hover:bg-blue-700 text-xs flex items-center gap-1 sm:gap-1.5 transition active:scale-95"
            >
              <i className="ph-bold ph-globe text-sm sm:text-base"></i>
              <span className="hidden sm:inline">{t("langBtn")}</span>
            </button>

            {/* Admin session badge + logout (Desktop) */}
            {session && (
              <div className="hidden sm:flex items-center gap-2 bg-purple-50 border border-purple-200 px-2.5 py-1.5 rounded-xl text-xs font-bold text-purple-900 shadow-sm">
                <i className="ph-bold ph-shield-check text-base text-purple-600"></i>
                <div className="hidden md:flex flex-col leading-tight">
                  <span className="font-extrabold text-purple-950">{lang === "en" ? "System Admin" : "مدير النظام"}</span>
                  <span className="text-[10px] text-purple-600 font-mono">#{session.employee_id}</span>
                </div>
                <button
                  onClick={logout}
                  title={lang === "en" ? "Logout" : "تسجيل الخروج"}
                  className="text-slate-400 hover:text-red-600 transition"
                >
                  <i className="ph-bold ph-sign-out text-base"></i>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Mobile Sidebar Drawer Backdrop ───────────────────── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Main Dashboard Container with Sidebar ─────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row w-full max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-6 gap-3 sm:gap-6">
        
        {/* ── Sidebar (Slide-Over Drawer on Mobile, Column on Desktop) ── */}
        <aside
          className={`fixed inset-y-0 ${
            lang === "ar" ? "right-0" : "left-0"
          } z-50 w-72 max-w-[85vw] bg-white p-4 shadow-2xl overflow-y-auto transition-transform duration-300 ease-in-out lg:static lg:z-auto lg:w-72 lg:p-0 lg:bg-transparent lg:shadow-none lg:overflow-visible shrink-0 ${
            mobileMenuOpen
              ? "translate-x-0"
              : lang === "ar"
              ? "translate-x-full lg:translate-x-0 pointer-events-none lg:pointer-events-auto"
              : "-translate-x-full lg:translate-x-0 pointer-events-none lg:pointer-events-auto"
          }`}
        >
          <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm lg:sticky lg:top-20">
            {/* Mobile Drawer Top Bar with Close Button */}
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100 lg:hidden">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-700 text-white flex items-center justify-center font-bold text-sm">
                  <i className="ph-bold ph-shield-check"></i>
                </div>
                <div className="leading-tight">
                  <p className="text-xs font-black text-slate-900">{t("adminPanel")}</p>
                  <p className="text-[10px] text-purple-600 font-bold">Admin Console</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition active:scale-95"
                aria-label="Close menu"
              >
                <i className="ph-bold ph-x text-base"></i>
              </button>
            </div>

            <div className="flex items-center justify-between px-2 pb-3 mb-2 border-b border-slate-100">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                {lang === "ar" ? "أقسام الإدارة" : "Admin Sections"}
              </span>
              <span className="text-[11px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md">
                Dunkin' Control
              </span>
            </div>

            {/* Menu Nav Links */}
            <nav className="space-y-1.5">
              {menuItems.map((item) => {
                const isActive = activeMenu === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveMenu(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-start p-3 rounded-2xl transition flex items-center justify-between gap-3 ${
                      isActive
                        ? "bg-purple-700 text-white shadow-md shadow-purple-700/25"
                        : "text-slate-700 hover:bg-slate-50 border border-transparent hover:border-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg transition ${
                          isActive
                            ? "bg-white/20 text-white"
                            : "bg-purple-50 text-purple-700"
                        }`}
                      >
                        <i className={`ph-bold ${item.icon}`}></i>
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-black truncate ${isActive ? "text-white" : "text-slate-900"}`}>
                          {item.label}
                        </p>
                        <p className={`text-[10px] truncate ${isActive ? "text-purple-200" : "text-slate-400"}`}>
                          {item.subLabel}
                        </p>
                      </div>
                    </div>

                    {/* Badge */}
                    {item.badge != null && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-black shrink-0 ${
                          isActive
                            ? "bg-white text-purple-900"
                            : item.badgeTone === "orange"
                            ? "bg-orange-500 text-white animate-pulse"
                            : item.badgeTone === "emerald"
                            ? "bg-emerald-500 text-white animate-pulse"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Quick Action in Sidebar */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  setShowAdd(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs flex items-center justify-center gap-2 transition"
              >
                <i className="ph-bold ph-plus-circle text-base"></i>
                <span>{t("addProduct")}</span>
              </button>
            </div>

            {/* Mobile Branch Selector & Logout in Drawer */}
            <div className="mt-4 pt-3 border-t border-slate-100 lg:hidden space-y-3">
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                  {lang === "ar" ? "الفرع المحدد" : "Selected Branch"}
                </label>
                <div className="relative bg-slate-50 border border-slate-200 rounded-2xl p-1.5 flex items-center gap-2">
                  <i className="ph-bold ph-storefront text-slate-500 text-lg shrink-0 mr-1"></i>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="bg-transparent border-none outline-none font-bold text-xs text-slate-800 w-full cursor-pointer"
                  >
                    {branchesList.map((b) => (
                      <option key={b.branch_code} value={b.branch_code}>
                        {b.branch_code} - {getBranchName(b.branch_code, b.branch_name)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {session && (
                <div className="bg-purple-50/80 border border-purple-200/80 rounded-2xl p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                      <i className="ph-bold ph-shield-check"></i>
                    </div>
                    <div className="min-w-0 leading-tight">
                      <p className="text-xs font-black text-purple-950 truncate">
                        {session.full_name}
                      </p>
                      <p className="text-[10px] text-purple-700 font-mono">
                        #{session.employee_id} • Admin
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={logout}
                    title={lang === "en" ? "Logout" : "تسجيل الخروج"}
                    className="w-8 h-8 rounded-xl bg-white border border-purple-200 flex items-center justify-center text-slate-400 hover:text-red-600 transition shrink-0"
                  >
                    <i className="ph-bold ph-sign-out text-sm"></i>
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ── Main Content Area (يُعرض القسم المطلوب فقط) ──────── */}
        <main className="flex-1 min-w-0">
          {/* 1. Products Section */}
          {activeMenu === "products" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Stat Cards */}
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                <StatCard label={t("totalProducts")} value={String(products.length)} icon="ph-package" tone="violet" />
                <StatCard label={lang === "ar" ? "الظاهرة للموظفين" : "Visible"} value={String(visibleCount)} icon="ph-eye" tone="emerald" />
                <StatCard label={lang === "ar" ? "المخفية عن الموظفين" : "Hidden"} value={String(hiddenCount)} icon="ph-eye-slash" tone="violet" />
                <StatCard label={t("categoriesCount")} value={String(allCategories.length)} icon="ph-folder" tone="blue" />
              </div>

              {/* Products Management Card */}
              <section className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black text-slate-900">{t("productCatalog")}</h2>
                      <span className="rounded-full bg-purple-100 px-3 py-0.5 text-xs font-bold text-purple-700">
                        {filteredProducts.length} {t("items")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {lang === "ar"
                        ? "إدارة وتعديل المنتجات وإخفائها عن الموظفين مع إمكانية البحث والفلترة السريعة"
                        : "Manage, edit and hide products from staff with fast search and filters"}
                    </p>
                  </div>

                  <button
                    onClick={() => setShowAdd(true)}
                    className="rounded-xl bg-purple-600 px-4 py-2 font-bold text-white shadow-md shadow-purple-600/30 hover:bg-purple-700 text-xs sm:text-sm flex items-center gap-2 transition shrink-0"
                  >
                    <i className="ph-bold ph-plus"></i>
                    <span>{t("addProduct")}</span>
                  </button>
                </div>

                {/* Search Box */}
                <div className="relative">
                  <i
                    className={`ph-bold ph-magnifying-glass absolute top-1/2 ${
                      lang === "ar" ? "right-4" : "left-4"
                    } -translate-y-1/2 text-slate-400 text-lg`}
                  ></i>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={lang === "ar" ? "ابحث برقم المنتج (الكود) أو اسم المنتج..." : "Search by product code or product name..."}
                    className={`w-full bg-slate-50 border border-slate-200 rounded-2xl ${
                      lang === "ar" ? "pr-11 pl-10" : "pl-11 pr-10"
                    } py-3 text-slate-800 font-medium focus:bg-white focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition text-sm`}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className={`absolute top-1/2 ${lang === "ar" ? "left-3" : "right-3"} -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1`}
                      title={lang === "ar" ? "مسح البحث" : "Clear search"}
                    >
                      <i className="ph-bold ph-x text-sm"></i>
                    </button>
                  )}
                </div>

                {/* Visibility Filter Selector (الكل / الظاهرة للموظفين / المخفية عن الموظفين) */}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="text-xs font-black text-slate-500 flex items-center gap-1">
                    <i className="ph-bold ph-eye"></i>
                    {lang === "ar" ? "حالة الظهور للموظف:" : "Visibility filter:"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setVisibilityFilter("ALL")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      visibilityFilter === "ALL"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <span>{lang === "ar" ? "الكل" : "All"}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${visibilityFilter === "ALL" ? "bg-white/20 text-white" : "bg-white text-slate-500"}`}>
                      {products.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibilityFilter("VISIBLE")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      visibilityFilter === "VISIBLE"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                    }`}
                  >
                    <i className="ph-bold ph-eye text-[12px]"></i>
                    <span>{lang === "ar" ? "الظاهرة فقط" : "Visible only"}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${visibilityFilter === "VISIBLE" ? "bg-white/20 text-white" : "bg-white text-emerald-700"}`}>
                      {visibleCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibilityFilter("HIDDEN")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      visibilityFilter === "HIDDEN"
                        ? "bg-purple-700 text-white shadow-xs"
                        : "bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200"
                    }`}
                  >
                    <i className="ph-bold ph-eye-slash text-[12px]"></i>
                    <span>{lang === "ar" ? "المخفية عن الموظفين" : "Hidden from staff"}</span>
                    <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-md ${visibilityFilter === "HIDDEN" ? "bg-white/20 text-white" : "bg-purple-200 text-purple-900"}`}>
                      {hiddenCount}
                    </span>
                  </button>
                </div>

                {/* Category Filter Tabs */}
                <div className="overflow-x-auto pb-2 -mx-2 px-2">
                  <div className="flex gap-2 min-w-max">
                    <button
                      onClick={() => setSelectedCat("ALL")}
                      className={`px-3.5 py-2 rounded-xl font-bold text-xs transition flex items-center gap-1.5 ${
                        selectedCat === "ALL"
                          ? "bg-purple-700 text-white shadow-md shadow-purple-700/20"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <span>{t("allCategories")}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[11px] ${
                          selectedCat === "ALL" ? "bg-white/20 text-white" : "bg-white text-slate-600 border border-slate-200"
                        }`}
                      >
                        {products.length}
                      </span>
                    </button>

                    {allCategories.map((cat) => {
                      const meta = getMeta(cat);
                      const count = products.filter((p) => p.category === cat).length;
                      const active = selectedCat === cat;
                      const catName = getCategoryName(cat);

                      return (
                        <button
                          key={cat}
                          onClick={() => setSelectedCat(cat)}
                          className={`px-3.5 py-2 rounded-xl font-bold text-xs transition flex items-center gap-1.5 ${
                            active
                              ? "bg-purple-700 text-white shadow-md shadow-purple-700/20"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          <span>{meta.icon}</span>
                          <span>{catName}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[11px] ${
                              active ? "bg-white/20 text-white" : "bg-white text-slate-600 border border-slate-200"
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Categorized Products List */}
                {groupedProducts.length === 0 ? (
                  <div className="py-14 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <i className="ph-duotone ph-magnifying-glass text-5xl mb-2 text-slate-300"></i>
                    <p className="font-bold text-slate-600">{t("searchNoResults")}</p>
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        className="mt-3 text-xs font-bold text-purple-600 hover:underline"
                      >
                        {lang === "ar" ? "إعادة تعيين البحث" : "Reset search"}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groupedProducts.map(({ category, items }) => {
                      const meta = getMeta(category);
                      const catName = getCategoryName(category);

                      return (
                        <div
                          key={category}
                          className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm"
                          style={{ contentVisibility: "auto", containIntrinsicSize: "0 280px" }}
                        >
                          {/* Category Header Banner */}
                          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="text-xl">{meta.icon}</span>
                              <h3 className="font-black text-slate-900 text-base">{catName}</h3>
                              <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                                {items.length} {t("items")}
                              </span>
                            </div>
                          </div>

                          {/* Products Grid in this Category */}
                          <div className="divide-y divide-slate-100 bg-white">
                            {items.map((product) => {
                              const productName = getProductName(product);
                              const secondaryName = lang === "en" ? product.nameAr : product.nameEn;
                              const unitLabel = getUnitName(product.unitCode, product.unitLabel);

                              return (
                                <div
                                  key={product.id}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 hover:bg-slate-50/70 transition"
                                >
                                  {/* Product Info & Image */}
                                  <div className="flex items-center gap-3 min-w-0">
                                    <img
                                      src={product.imageUrl || getProductImage(product)}
                                      alt={productName}
                                      className="h-12 w-12 rounded-xl object-contain bg-white p-0.5 shrink-0 border border-slate-200"
                                      onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).src = getCategoryFallbackImage(product.category);
                                      }}
                                    />

                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-xs font-black text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md">
                                          #{product.code}
                                        </span>
                                        <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                          {unitLabel}
                                        </span>
                                        {product.isHidden && (
                                          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-300">
                                            <i className="ph-bold ph-eye-slash text-xs"></i>
                                            {lang === "ar" ? "مخفي عن الموظفين" : "Hidden from staff"}
                                          </span>
                                        )}
                                        {product.lastStockUpdate && (
                                          <button
                                            onClick={() => setHistoryProduct(product)}
                                            className={`text-[10.5px] font-black px-2 py-0.5 rounded-md border transition flex items-center gap-1 ${
                                              product.lastStockUpdate.changeType === "increase"
                                                ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                                                : "bg-red-50 text-red-800 border-red-200 hover:bg-red-100"
                                            }`}
                                            title={lang === "ar" ? "اضغط لمعاينة تفاصيل آخر تحديث" : "Click to view latest update details"}
                                          >
                                            <i className={`ph-bold ${product.lastStockUpdate.changeType === "increase" ? "ph-trend-up" : "ph-trend-down"}`}></i>
                                            <span>
                                              {product.lastStockUpdate.changeType === "increase" ? `+${product.lastStockUpdate.delta}` : product.lastStockUpdate.delta}
                                            </span>
                                            <span className="text-[10px] opacity-75 font-normal">
                                              ({formatStockDateDetails(product.lastStockUpdate.timestamp, lang as "ar" | "en").dayName}{" "}
                                              {formatStockDateDetails(product.lastStockUpdate.timestamp, lang as "ar" | "en").time})
                                            </span>
                                          </button>
                                        )}
                                      </div>
                                      <p
                                        onClick={() => setHistoryProduct(product)}
                                        className="font-black text-slate-900 text-sm mt-0.5 truncate cursor-pointer hover:text-blue-600 transition"
                                        title={lang === "ar" ? "اضغط لمعاينة سجل حركات الصنف" : "Click to view stock history"}
                                      >
                                        {productName}
                                      </p>
                                      {secondaryName && (
                                        <p className="text-xs text-slate-400 truncate">{secondaryName}</p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Actions */}
                                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center flex-wrap">
                                    {/* Toggle Visibility Button */}
                                    <button
                                      type="button"
                                      onClick={() => toggleVisibilityMut.mutate({ id: product.id, isHidden: !product.isHidden })}
                                      disabled={toggleVisibilityMut.isPending}
                                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer ${
                                        product.isHidden
                                          ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                                          : "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
                                      }`}
                                      title={
                                        product.isHidden
                                          ? (lang === "ar" ? "إظهار المنتج للموظفين" : "Show product to staff")
                                          : (lang === "ar" ? "إخفاء المنتج عن الموظفين" : "Hide product from staff")
                                      }
                                    >
                                      <i className={`ph-bold ${product.isHidden ? "ph-eye text-emerald-700" : "ph-eye-slash text-purple-700"}`}></i>
                                      <span>
                                        {product.isHidden
                                          ? (lang === "ar" ? "إظهار للموظفين" : "Show to Staff")
                                          : (lang === "ar" ? "إخفاء عن الموظفين" : "Hide from Staff")}
                                      </span>
                                    </button>

                                    <button
                                      onClick={() => setHistoryProduct(product)}
                                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition flex items-center gap-1 shadow-sm"
                                      title={lang === "ar" ? "معاينة تفاصيل آخر تحديث وسجل الحركات" : "View latest stock update & history"}
                                    >
                                      <i className="ph-bold ph-clock-counter-clockwise"></i>
                                      <span>{lang === "ar" ? "آخر تحديث" : "Stock Log"}</span>
                                    </button>
                                    <button
                                      onClick={() => setEditing(product)}
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition flex items-center gap-1 shadow-sm"
                                    >
                                      <i className="ph-bold ph-pencil-simple text-purple-600"></i>
                                      <span>{t("editProduct")}</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (window.confirm(t("confirmDelete"))) {
                                          removeMut.mutate({ id: product.id });
                                        }
                                      }}
                                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition flex items-center gap-1 shadow-sm"
                                    >
                                      <i className="ph-bold ph-trash"></i>
                                      <span>{t("deleteProduct")}</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* 2. Branches Management Section */}
          {activeMenu === "branches" && (
            <div className="animate-in fade-in duration-200">
              <AdminRequestsPanel
                forcedTab="branches"
                hideTabsNav={true}
                onCountsChange={setCounts}
              />
            </div>
          )}

          {/* 3. Employees Management Section */}
          {activeMenu === "employees" && (
            <div className="animate-in fade-in duration-200">
              <AdminRequestsPanel
                forcedTab="employees"
                hideTabsNav={true}
                onCountsChange={setCounts}
              />
            </div>
          )}

          {/* 4. Registration Requests Section */}
          {activeMenu === "requests" && (
            <div className="animate-in fade-in duration-200">
              <AdminRequestsPanel
                forcedTab="requests"
                hideTabsNav={true}
                onCountsChange={setCounts}
              />
            </div>
          )}

          {/* 5. Orders & Audit Alerts Section */}
          {activeMenu === "submissions" && (
            <div className="animate-in fade-in duration-200">
              <AdminRequestsPanel
                forcedTab="submissions"
                hideTabsNav={true}
                onCountsChange={setCounts}
              />
            </div>
          )}

          {/* 6. Inter-Branch Transfers Section */}
          {activeMenu === "transfers" && (
            <div className="animate-in fade-in duration-200">
              <AdminRequestsPanel
                forcedTab="transfers"
                hideTabsNav={true}
                onCountsChange={setCounts}
              />
            </div>
          )}
        </main>
      </div>

      {/* ── Modals ──────────────────────────────────────────── */}
      {showAdd && (
        <AddProductModal
          categories={allCategories}
          existingCodes={products.map((p) => p.code)}
          onClose={() => setShowAdd(false)}
          onSave={(input) => addMut.mutate(input)}
          isLoading={addMut.isPending}
        />
      )}

      {editing && (
        <AddProductModal
          title={lang === "en" ? "Edit Product" : "تعديل المنتج"}
          product={editing}
          categories={allCategories}
          existingCodes={products.filter((p) => p.id !== editing.id).map((p) => p.code)}
          onClose={() => setEditing(null)}
          onSave={(input) => editMut.mutate({ id: editing.id, ...input })}
          isLoading={editMut.isPending}
        />
      )}

      {/* Product Stock History & Latest Update Modal */}
      {historyProduct && (
        <ProductStockHistoryModal
          product={historyProduct}
          branchCode={selectedBranch}
          onClose={() => setHistoryProduct(null)}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: string;
  tone: "violet" | "blue" | "emerald";
}) {
  const palette = {
    violet: "bg-violet-100 text-violet-700",
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${palette[tone]}`}>
          <i className={`ph-bold ${icon} text-xl`}></i>
        </div>
      </div>
    </div>
  );
}
