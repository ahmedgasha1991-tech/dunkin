import { useEffect, useMemo, useRef, useState, useCallback, useDeferredValue } from "react";
import React from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { getMeta, catMeta } from "@/lib/catMeta";
import { uploadProductImage } from "@/lib/supabase";
import { getProductImage, getCategoryFallbackImage, getUploadedProductImage } from "@/lib/productImages";
import type { Product } from "@db/schema";
import { useLanguage } from "@/providers/LanguageContext";
import { useAuth } from "@/providers/AuthContext";
import { AuthModal } from "@/components/AuthModal";
import { ProductStockHistoryModal } from "@/components/ProductStockHistoryModal";
import { GoodsReceivingModal } from "@/components/GoodsReceivingModal";
import { BranchTransferModal } from "@/components/BranchTransferModal";
import { OfflineBanner } from "@/components/OfflineBanner";
import {
  saveCachedProducts,
  getCachedProducts,
  queueMutation,
  getQueuedMutations,
  removeQueuedMutation,
  subscribeOnlineStatus,
} from "@/lib/offlineSync";

type Fields = Partial<Pick<Product, "mode" | "qty" | "packs" | "packSize" | "loose" | "orderQty">>;

const arNum = (n: number) => n.toLocaleString("ar-EG");

export default function Home() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { lang, toggleLang, t, getProductName, getCategoryName, getUnitName, getBranchName, getEmployeeName } = useLanguage();
  const { session, logout, selectedBranch, setSelectedBranch, branchesList, sendAdminSubmission } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const listQuery = trpc.inventory.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const [items, setItems] = useState<Product[]>(() => {
    const cached = getCachedProducts();
    return cached.length > 0 ? cached : [];
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("ALL");
  const [selectedCat, setSelectedCat] = useState("ALL");

  const [promptId, setPromptId] = useState<number | null>(null);
  const [promptQty, setPromptQty] = useState("");
  const [promptUnit, setPromptUnit] = useState<"CTN" | "PKT" | "PCS">("CTN");
  const [orderUnits, setOrderUnits] = useState<Record<number, "CTN" | "PKT" | "PCS">>(() => {
    try {
      const saved = localStorage.getItem("dunkin_order_units");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("dunkin_order_units", JSON.stringify(orderUnits));
    } catch {}
  }, [orderUnits]);

  const [showReset, setShowReset] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [showReceivingModal, setShowReceivingModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  const transfersQuery = trpc.inventory.listTransfers.useQuery(
    { branchCode: selectedBranch || session?.branch_code },
    { refetchInterval: 15000, enabled: !!session }
  );

  const pendingTransfersCount = useMemo(() => {
    if (!transfersQuery.data) return 0;
    const currentBranch = selectedBranch || session?.branch_code;
    return transfersQuery.data.filter((t) => {
      if (t.toBranchCode === currentBranch && t.status === "in_transit") return true;
      if (t.fromBranchCode === currentBranch && t.status === "approved_by_admin") return true;
      return false;
    }).length;
  }, [transfersQuery.data, selectedBranch, session?.branch_code]);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notify = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const getSelectedOrderUnitLabel = (id: number, fallbackUnitCode?: string, fallbackUnitLabel?: string) => {
    const u = orderUnits[id];
    if (u === "CTN") return lang === "en" ? "Carton 📦" : "كرتون 📦";
    if (u === "PKT") return lang === "en" ? "Packet 🗂️" : "باكت 🗂️";
    if (u === "PCS") return lang === "en" ? "Piece 낱" : "حبة 낱";
    return getUnitName(fallbackUnitCode ?? "PCS", fallbackUnitLabel);
  };

  useEffect(() => {
    if (listQuery.data && listQuery.data.length > 0) {
      setItems(listQuery.data);
      saveCachedProducts(listQuery.data);
    }
  }, [listQuery.data]);

  const updateMut = trpc.inventory.update.useMutation({
    onSuccess: () => {
      utils.inventory.list.invalidate();
    },
    onError: (_err, variables) => {
      // Queue offline mutation if failed due to network or server disconnect
      queueMutation({
        productId: variables.id,
        fields: {
          mode: variables.mode,
          qty: variables.qty,
          packs: variables.packs,
          packSize: variables.packSize,
          loose: variables.loose,
          orderQty: variables.orderQty,
        },
        updatedBy: variables.updatedBy || "موظف الفرع",
        branchCode: variables.branchCode,
      });
      notify(lang === "en" ? "Saved offline (will sync when online) 📶" : "تم الحفظ محلياً (سيتم الرفع عند توفر الإنترنت) 📶");
    },
  });

  const handleSyncNow = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      notify(lang === "en" ? "Cannot sync: No internet connection 📶" : "لا يمكن المزامنة: لا يوجد اتصال بالإنترنت 📶");
      return;
    }
    const queue = getQueuedMutations();
    if (queue.length === 0 || isSyncing) return;
    setIsSyncing(true);
    let synced = 0;
    for (const q of queue) {
      try {
        await updateMut.mutateAsync({
          id: q.productId,
          updatedBy: q.updatedBy,
          branchCode: q.branchCode,
          ...q.fields,
        });
        removeQueuedMutation(q.id);
        synced++;
      } catch (err) {
        console.warn("Failed to sync queued mutation:", q, err);
        break;
      }
    }
    setIsSyncing(false);
    if (synced > 0) {
      notify(lang === "en" ? `Synced ${synced} changes successfully! ☁️` : `تمت مزامنة ${synced} تعديلات بنجاح مع السيرفر! ☁️`);
      utils.inventory.list.invalidate();
    }
  }, [isSyncing, updateMut, utils.inventory.list, lang]);

  useEffect(() => {
    const unsub = subscribeOnlineStatus((online) => {
      if (online) {
        handleSyncNow();
      }
    });
    return unsub;
  }, [handleSyncNow]);

  const resetMut = trpc.inventory.resetAll.useMutation({
    onSuccess: () => {
      notify(lang === "en" ? "All stock quantities reset to zero successfully! 🔄" : "تم تصفير جميع كميات المخزون بنجاح! 🔄");
      utils.inventory.list.invalidate();
    },
    onError: () => {
      notify(lang === "en" ? "Failed to reset" : "تعذر التصفير");
      utils.inventory.list.invalidate();
    },
  });
  const snapshotMut = trpc.inventory.saveSnapshot.useMutation({
    onSuccess: () => {
      utils.inventory.snapshots.invalidate();
      notify(lang === "en" ? "Inventory saved successfully" : "تم حفظ الجرد بنجاح");
    },
    onError: () => notify(lang === "en" ? "Failed to save inventory" : "تعذر حفظ الجرد")
  });
  const snapshotsQuery = trpc.inventory.snapshots.useQuery(undefined, { enabled: showSnapshots });

  // Debounce direct typing; step buttons save immediately
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const patch = useCallback((id: number, fields: Fields, debounce = false) => {
    const empName = session?.full_name || (session?.employee_id ? `موظف #${session.employee_id}` : "موظف الفرع");
    setItems((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, ...fields } : p));
      saveCachedProducts(updated);
      return updated;
    });

    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    if (isOffline) {
      queueMutation({
        productId: id,
        fields,
        updatedBy: empName,
        branchCode: selectedBranch,
      });
      notify(lang === "en" ? "Saved offline (will sync when online) 📶" : "تم الحفظ محلياً (سيتم الرفع عند توفر الإنترنت) 📶");
      return;
    }

    const run = () => updateMut.mutate({ id, updatedBy: empName, branchCode: selectedBranch, ...fields });
    const key = `${id}:${Object.keys(fields).join(",")}`;
    if (debounce) {
      clearTimeout(debounceTimers.current.get(key));
      debounceTimers.current.set(key, setTimeout(run, 600));
    } else {
      clearTimeout(debounceTimers.current.get(key));
      run();
    }
  }, [session?.full_name, session?.employee_id, selectedBranch, updateMut, lang]);

  const stepField = useCallback((p: Product, field: "qty" | "packs" | "loose", change: number) => {
    const next = Math.max(0, (p[field] ?? 0) + change);
    patch(p.id, { [field]: next } as Fields);
  }, [patch]);

  const handleOrder = useCallback((id: number) => {
    const prod = items.find((x) => x.id === id);
    setPromptQty(prod?.orderQty != null ? String(prod.orderQty) : "");
    setPromptUnit(orderUnits[id] || (prod?.unitCode as any) || "CTN");
    setPromptId(id);
  }, [items, orderUnits]);

  const handleCopyCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code);
    notify((lang === "en" ? "Code copied: " : "تم نسخ الكود: ") + code);
  }, [lang]);

  const handleOpenHistory = useCallback((prod: Product) => {
    setHistoryProduct(prod);
  }, []);

  const categories = useMemo(() => Array.from(new Set(items.map((p) => p.category))), [items]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < items.length; i++) {
      const c = items[i].category;
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }, [items]);

  const deferredSearch = useDeferredValue(search);

  const filtered = useMemo(() => {
    const term = deferredSearch.toLowerCase().trim();
    return items.filter((p) => {
      const catEn = getCategoryName(p.category).toLowerCase();
      const mSearch =
        !term ||
        p.nameAr.toLowerCase().includes(term) ||
        p.nameEn.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term) ||
        catEn.includes(term) ||
        p.code.includes(term);
      const mCat = selectedCat === "ALL" || p.category === selectedCat;
      const mUnit = unitFilter === "ALL" || p.unitCode === unitFilter;
      return mSearch && mCat && mUnit;
    });
  }, [items, deferredSearch, selectedCat, unitFilter, getCategoryName]);

  const [visibleCount, setVisibleCount] = useState(36);

  useEffect(() => {
    setVisibleCount(36);
  }, [selectedCat, unitFilter, deferredSearch]);

  const displayedProducts = useMemo(() => {
    if (selectedCat !== "ALL" || deferredSearch.trim() !== "") return filtered;
    return filtered.slice(0, visibleCount);
  }, [filtered, selectedCat, deferredSearch, visibleCount]);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 36, filtered.length));
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [filtered.length]);

  const orderedItems = items.filter((p) => p.orderQty != null && p.orderQty > 0);
  const promptProd = promptId != null ? items.find((p) => p.id === promptId) : undefined;

  const stockStats = useMemo(() => {
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    items.forEach((p) => {
      const q = p.qty ?? 0;
      if (q === 0) outOfStock++;
      else if (q <= 10) lowStock++;
      else inStock++;
    });
    return {
      total: items.length,
      inStock,
      lowStock,
      outOfStock,
      inOrder: orderedItems.length,
    };
  }, [items, orderedItems.length]);

  const fallbackCopy = (text: string) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed"; // Avoid scrolling to bottom
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand("copy");
      notify(t("copySuccess"));
    } catch (err) {
      notify(t("copyFail"));
    }
    document.body.removeChild(textarea);
  };

  const handleSendOrderToAdmin = async () => {
    if (orderedItems.length === 0) {
      notify(t("orderListEmpty"));
      return;
    }
    const empName = session?.full_name || (lang === "en" ? "Branch Employee" : "موظف الفرع");
    const empId = session?.employee_id || "#101";
    const bCode = selectedBranch || session?.branch_code || "1011125";
    const bObj = branchesList.find((b) => b.branch_code === bCode);
    const bName = bObj ? bObj.branch_name : `فرع ${bCode}`;

    const res = await sendAdminSubmission({
      type: "cargo_order",
      title: lang === "en" ? "Warehouse Cargo Order" : "طلب بضاعة مستودع",
      employee_name: empName,
      employee_id: empId,
      branch_code: bCode,
      branch_name: bName,
      details: {
        item_count: orderedItems.length,
        items: orderedItems.map((p) => ({
          code: p.code,
          nameAr: p.nameAr,
          nameEn: p.nameEn ?? undefined,
          qty: p.orderQty ?? 0,
          unit: getSelectedOrderUnitLabel(p.id, p.unitCode, p.unitLabel),
        })),
      },
    });

    notify(res.message);
    setShowOrder(false);
  };

  const copyOrderText = () => {
    if (orderedItems.length === 0) {
      notify(t("orderListEmpty"));
      return;
    }
    let text = lang === "en" ? "📋 Next Day Cargo Order List:\n\n" : "📋 قائمة طلبات بضاعة الغد:\n\n";
    orderedItems.forEach((p, i) => {
      const pName = getProductName(p);
      const uName = getSelectedOrderUnitLabel(p.id, p.unitCode, p.unitLabel);
      text += `${i + 1}. [${p.code}] ${pName}\n   👈 ${t("requestedQty")}: ${p.orderQty} (${uName})\n\n`;
    });
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => notify(t("copySuccess")))
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  };

  const printOrderPdf = () => {
    if (orderedItems.length === 0) {
      notify(t("orderListEmpty"));
      return;
    }
    const rows = orderedItems.map((p, i) => `<tr><td>${i + 1}</td><td>${p.code}</td><td><b>${getProductName(p)}</b></td><td>${p.orderQty} ${getSelectedOrderUnitLabel(p.id, p.unitCode, p.unitLabel)}</td></tr>`).join("");
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      notify(lang === "en" ? "Allow popups to generate PDF" : "اسمح بالنوافذ المنبثقة لإنشاء ملف PDF");
      return;
    }
    printWindow.document.write(`<html dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${t("nextDayOrder")}</title><style>body{font-family:sans-serif;padding:32px;color:#172033}h1{text-align:center}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #cbd5e1;padding:10px;text-align:${lang === 'ar' ? 'right' : 'left'}}th{background:#e2e8f0}</style></head><body><h1>${t("nextDayOrder")}</h1><table><thead><tr><th>#</th><th>${t("code")}</th><th>${t("productCatalog")}</th><th>${t("qty")}</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const saveSnapshot = (period: "weekly" | "monthly") => {
    snapshotMut.mutate({ period, data: JSON.stringify(items) });
  };

  if (listQuery.isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-500">
        <i className="ph ph-package text-5xl animate-bounce text-blue-500"></i>
        <p className="font-bold">{lang === "en" ? "Loading inventory data..." : "جاري تحميل المخزون من قاعدة البيانات..."}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div dir={lang === "ar" ? "rtl" : "ltr"} className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none animate-pulse"></div>
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-[500px] h-[500px] bg-amber-600/10 rounded-full blur-3xl pointer-events-none animate-pulse"></div>

        {/* Top Floating Language Switcher */}
        <div className="absolute top-6 right-6 z-20">
          <button
            onClick={toggleLang}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-800/80 hover:bg-slate-800 text-amber-400 font-extrabold border border-slate-700/60 shadow-xl backdrop-blur-md transition text-xs md:text-sm hover:scale-105"
          >
            <i className="ph-bold ph-globe text-base"></i>
            <span>{lang === "ar" ? "English (LTR)" : "العربية (RTL)"}</span>
          </button>
        </div>

        <div className="z-10 w-full max-w-md">
          <AuthModal isOpen={true} onClose={() => {}} allowClose={false} />
        </div>
      </div>
    );
  }

  if (listQuery.isError && items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-500">
        <i className="ph ph-warning-circle text-5xl text-red-500"></i>
        <p className="font-bold">{lang === "en" ? "Database connection error" : "تعذر الاتصال بقاعدة البيانات"}</p>
        <button
          onClick={() => listQuery.refetch()}
          className="bg-blue-600 text-white px-5 py-2 rounded-xl font-bold"
        >
          {lang === "en" ? "Retry" : "إعادة المحاولة"}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" dir={lang === "ar" ? "rtl" : "ltr"}>
      {/* Offline & Sync Status Banner */}
      <OfflineBanner onSyncNow={handleSyncNow} isSyncing={isSyncing} />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm modal-content-enter">
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-2.5 sm:px-4 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            {/* Mobile Sidebar Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden h-9 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-1 text-xs font-black transition active:scale-95 shrink-0"
              aria-label="Toggle sidebar menu"
              title={lang === "en" ? "Open Menu" : "فتح القائمة"}
            >
              <i className="ph-bold ph-list text-base text-blue-600"></i>
              <span className="text-[11px] font-black">{lang === "ar" ? "القائمة" : "Menu"}</span>
            </button>

            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-600/25 shrink-0">
              <i className="ph ph-package text-xl sm:text-2xl"></i>
            </div>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-base md:text-lg font-black text-slate-900 leading-tight flex items-center gap-1.5 truncate">
                <span>{t("appTitle")}</span>
              </h1>
              <p className="text-[10px] sm:text-[11px] text-emerald-600 font-bold flex items-center gap-1 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                <span className="truncate">{selectedBranch} — {items.length} {t("items")}</span>
              </p>
            </div>
          </div>

          {/* Top Quick Actions (Desktop & Tablet) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Language Toggle Button */}
            <button
              onClick={toggleLang}
              title={t("langTitle")}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl font-bold transition flex items-center gap-1.5 text-xs"
            >
              <i className="ph-bold ph-globe text-sm sm:text-base text-blue-600"></i>
              <span>{t("langBtn")}</span>
            </button>

            {/* Order Cart Button */}
            <button
              onClick={() => setShowOrder(true)}
              className="relative bg-blue-600 text-white hover:bg-blue-700 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl font-bold transition flex items-center gap-1.5 text-xs shadow-sm"
              title={t("orderList")}
            >
              <i className="ph-bold ph-shopping-cart text-sm sm:text-base"></i>
              <span>{t("orderList")}</span>
              {orderedItems.length > 0 && (
                <span className="bg-red-500 text-white text-[10px] min-w-4 sm:min-w-5 h-4 sm:h-5 px-1 rounded-full flex items-center justify-center font-black animate-pulse">
                  {orderedItems.length}
                </span>
              )}
            </button>

            {/* Goods Receiving Button (Desktop/Tablet) */}
            <button
              id="btn-goods-receiving"
              onClick={() => {
                if (orderedItems.length === 0) {
                  notify(lang === "en" ? "No pending ordered products to receive. Add items to order first!" : "لا توجد بضاعة في قائمة الطلبات لاستلامها حالياً! حدد كميات الطلب أولاً.");
                  setShowOrder(true);
                } else {
                  setShowReceivingModal(true);
                }
              }}
              className="hidden sm:flex bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl font-bold transition items-center gap-1.5 border border-emerald-300 text-xs shadow-2xs"
              title={lang === "en" ? "Receive and Confirm Delivery into Stock" : "استلام المنتجات وتوريد المخزون"}
            >
              <i className="ph-bold ph-package-receive text-base text-emerald-600"></i>
              <span className="hidden md:inline">{lang === "en" ? "Receive" : "استلام"}</span>
            </button>

            {/* Branch Transfer Workflow Button (Desktop/Tablet) */}
            <button
              id="btn-branch-transfers"
              onClick={() => setShowTransferModal(true)}
              className="hidden sm:flex relative bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl font-bold transition items-center gap-1.5 border border-indigo-200 text-xs shadow-2xs"
              title={lang === "en" ? "Inter-Branch Transfer Requests & Inflow" : "طلب بضاعة من فرع آخر / تحويلات الفروع"}
            >
              <i className="ph-bold ph-arrows-left-right text-base text-indigo-600"></i>
              <span className="hidden md:inline">{lang === "en" ? "Transfers" : "تحويلات"}</span>
              {pendingTransfersCount > 0 && (
                <span className="bg-indigo-600 text-white text-[10px] min-w-5 h-5 px-1 rounded-full flex items-center justify-center font-black animate-pulse">
                  {pendingTransfersCount}
                </span>
              )}
            </button>

            {/* Admin Panel Button — STRICTLY FOR ADMIN ONLY */}
            {session?.role === "admin" && (
              <button
                onClick={() => navigate("/admin")}
                className="hidden sm:flex bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-xl font-bold transition items-center gap-1.5 shadow-md shadow-purple-600/25 text-xs animate-in fade-in"
              >
                <i className="ph-bold ph-shield-check text-base"></i>
                <span className="hidden md:inline">{t("adminPanel")}</span>
              </button>
            )}

            {/* Session Pill */}
            {session && (
              <div className="hidden lg:flex items-center gap-2 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-800">
                <i className="ph-bold ph-user-circle text-base text-blue-600"></i>
                <span className="truncate max-w-[120px]">{getEmployeeName(session.full_name)}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Mobile Quick Action Toolbar (ظاهر فقط على شاشات الجوال لسهولة الوصول) ── */}
        <div className="sm:hidden bg-slate-50 border-t border-slate-200/80 px-2 py-1.5 flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
          {/* Receive Goods Button */}
          <button
            onClick={() => {
              if (orderedItems.length === 0) {
                notify(lang === "en" ? "No items in order list to receive." : "لا توجد بضاعة في قائمة الطلبات لاستلامها حالياً! حدد كميات الطلب أولاً.");
                setShowOrder(true);
              } else {
                setShowReceivingModal(true);
              }
            }}
            className="flex-1 py-1.5 px-2 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1 transition active:scale-95 shadow-xs"
          >
            <i className="ph-bold ph-package-receive text-xs text-emerald-600"></i>
            <span>{lang === "en" ? "Receive" : "استلام"}</span>
          </button>

          {/* Transfers Button */}
          <button
            onClick={() => setShowTransferModal(true)}
            className="flex-1 py-1.5 px-2 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1 transition active:scale-95 shadow-xs relative"
          >
            <i className="ph-bold ph-arrows-left-right text-xs text-indigo-600"></i>
            <span>{lang === "en" ? "Transfers" : "تحويلات"}</span>
            {pendingTransfersCount > 0 && (
              <span className="bg-indigo-600 text-white text-[9px] px-1 rounded-full font-black animate-pulse">
                {pendingTransfersCount}
              </span>
            )}
          </button>

          {/* Admin Panel Button (Mobile) */}
          {session?.role === "admin" && (
            <button
              onClick={() => navigate("/admin")}
              className="py-1.5 px-2.5 bg-purple-600 text-white rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1 shadow-xs active:scale-95 transition shrink-0"
            >
              <i className="ph-bold ph-shield-check text-xs"></i>
              <span>{lang === "en" ? "Admin" : "الإدارة"}</span>
            </button>
          )}

          {/* Quick Order Cart Preview Button */}
          <button
            onClick={() => setShowOrder(true)}
            className="py-1.5 px-2.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-xl font-extrabold text-[11px] flex items-center justify-center gap-1 shadow-xs active:scale-95 transition shrink-0"
          >
            <i className="ph-bold ph-shopping-cart text-xs text-blue-600"></i>
            <span>{lang === "en" ? "Order" : "الطلبات"}</span>
            <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.2 rounded-full font-black">
              {orderedItems.length}
            </span>
          </button>
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
          <div className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-sm lg:sticky lg:top-20">
            {/* Mobile Drawer Top Header & Close Button */}
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100 lg:hidden">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                  <i className="ph-bold ph-package"></i>
                </div>
                <div className="leading-tight">
                  <p className="text-xs font-black text-slate-900">{t("appTitle")}</p>
                  <p className="text-[10px] text-emerald-600 font-bold">{selectedBranch}</p>
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

            {/* Sidebar Brand & Branch Header */}
            <div className="px-2 pb-3 mb-2 border-b border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">
                  {lang === "ar" ? "لوحة تحكم الفرع" : "Branch Control"}
                </span>
                <span className="text-[11px] font-bold text-blue-600 font-mono">
                  {selectedBranch} — {getBranchName(selectedBranch, branchesList.find(b => b.branch_code === selectedBranch)?.branch_name)}
                </span>
              </div>
              <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {lang === "ar" ? "مباشر" : "Live"}
              </span>
            </div>

            {/* Menu Nav Links */}
            <nav className="space-y-1.5">
              {/* 1. Catalog */}
              <button
                onClick={() => {
                  setSelectedCat("ALL");
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-start p-3 rounded-2xl transition flex items-center justify-between gap-3 ${
                  selectedCat === "ALL" && !showOrder && !showSnapshots
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
                    : "text-slate-700 hover:bg-slate-50 border border-transparent hover:border-slate-200"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg transition ${
                    selectedCat === "ALL" && !showOrder && !showSnapshots ? "bg-white/20 text-white" : "bg-blue-50 text-blue-600"
                  }`}>
                    <i className="ph-bold ph-package"></i>
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-black truncate ${selectedCat === "ALL" && !showOrder && !showSnapshots ? "text-white" : "text-slate-900"}`}>
                      {lang === "ar" ? "جرد وتصفح المخزون" : "Inventory Catalog"}
                    </p>
                    <p className={`text-[10px] truncate ${selectedCat === "ALL" && !showOrder && !showSnapshots ? "text-blue-100" : "text-slate-400"}`}>
                      {lang === "ar" ? "عرض المنتجات والعد الفعلي" : "Browse items & audit counts"}
                    </p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-black shrink-0 ${
                  selectedCat === "ALL" && !showOrder && !showSnapshots ? "bg-white text-blue-700" : "bg-slate-100 text-slate-600"
                }`}>
                  {items.length}
                </span>
              </button>

              {/* 2. Next Day Cargo Order */}
              <button
                onClick={() => {
                  setShowOrder(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full text-start p-3 rounded-2xl transition flex items-center justify-between gap-3 text-slate-700 hover:bg-blue-50/60 border border-transparent hover:border-blue-200"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg bg-blue-50 text-blue-600">
                    <i className="ph-bold ph-shopping-cart"></i>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black truncate text-slate-900">
                      {lang === "ar" ? "قائمة طلبات الغد" : "Next-Day Cargo Order"}
                    </p>
                    <p className="text-[10px] truncate text-slate-400">
                      {lang === "ar" ? "مراجعة الطلبية وإرسالها للأدمن" : "Review cart & send to admin"}
                    </p>
                  </div>
                </div>
                {orderedItems.length > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-black shrink-0 bg-red-500 text-white animate-pulse">
                    {orderedItems.length}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 bg-slate-100 text-slate-400">0</span>
                )}
              </button>

              {/* 3. Goods Receiving & Stock Intake */}
              <button
                onClick={() => {
                  if (orderedItems.length === 0) {
                    notify(lang === "en" ? "No pending ordered products to receive. Add items to order first!" : "لا توجد بضاعة في قائمة الطلبات لاستلامها حالياً! حدد كميات الطلب أولاً.");
                    setShowOrder(true);
                  } else {
                    setShowReceivingModal(true);
                  }
                  setMobileMenuOpen(false);
                }}
                className="w-full text-start p-3 rounded-2xl transition flex items-center justify-between gap-3 text-slate-700 hover:bg-emerald-50/60 border border-transparent hover:border-emerald-200"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg bg-emerald-50 text-emerald-600">
                    <i className="ph-bold ph-package-receive"></i>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black truncate text-slate-900">
                      {lang === "ar" ? "استلام وتوريد البضاعة" : "Receive Goods"}
                    </p>
                    <p className="text-[10px] truncate text-slate-400">
                      {lang === "ar" ? "فحص الوارد وتوريد المخزون" : "Confirm delivery into stock"}
                    </p>
                  </div>
                </div>
                {orderedItems.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-black shrink-0 bg-emerald-600 text-white">
                    {orderedItems.length}
                  </span>
                )}
              </button>

              {/* 4. Inter-Branch Transfers */}
              <button
                onClick={() => {
                  setShowTransferModal(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full text-start p-3 rounded-2xl transition flex items-center justify-between gap-3 text-slate-700 hover:bg-indigo-50/60 border border-transparent hover:border-indigo-200"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg bg-indigo-50 text-indigo-600">
                    <i className="ph-bold ph-arrows-left-right"></i>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black truncate text-slate-900">
                      {lang === "ar" ? "التحويلات بين الفروع" : "Branch Transfers"}
                    </p>
                    <p className="text-[10px] truncate text-slate-400">
                      {lang === "ar" ? "طلب من فرع وتتبع الشحنات" : "Request items & track transfers"}
                    </p>
                  </div>
                </div>
                {pendingTransfersCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-black shrink-0 bg-indigo-600 text-white animate-pulse">
                    {pendingTransfersCount}
                  </span>
                )}
              </button>

              {/* 5. Operational Audit */}
              <button
                onClick={() => {
                  navigate("/audit");
                  setMobileMenuOpen(false);
                }}
                className="w-full text-start p-3 rounded-2xl transition flex items-center justify-between gap-3 text-slate-700 hover:bg-orange-50/60 border border-transparent hover:border-orange-200"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg bg-orange-50 text-orange-600">
                    <i className="ph-bold ph-clipboard-text"></i>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black truncate text-slate-900">
                      {lang === "ar" ? "الجرد التشغيلي والتقارير" : "Operational Audit"}
                    </p>
                    <p className="text-[10px] truncate text-slate-400">
                      {lang === "ar" ? "فحص الفائض والعجز والتوثيق" : "Variance check & audit logs"}
                    </p>
                  </div>
                </div>
              </button>

              {/* 6. Save Snapshot */}
              <button
                onClick={() => {
                  setShowSnapshots(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full text-start p-3 rounded-2xl transition flex items-center justify-between gap-3 text-slate-700 hover:bg-slate-100 border border-transparent hover:border-slate-200"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg bg-slate-100 text-slate-700">
                    <i className="ph-bold ph-floppy-disk"></i>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black truncate text-slate-900">
                      {lang === "ar" ? "حفظ واسترجاع الجرد" : "Snapshots & Backups"}
                    </p>
                    <p className="text-[10px] truncate text-slate-400">
                      {lang === "ar" ? "نسخ الجرد الأسبوعي والشهري" : "Save/view periodic backups"}
                    </p>
                  </div>
                </div>
              </button>

              {/* 7. Admin Panel Link for Admins in Sidebar */}
              {session?.role === "admin" && (
                <button
                  onClick={() => {
                    navigate("/admin");
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-start p-3 rounded-2xl transition flex items-center justify-between gap-3 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg bg-purple-600 text-white shadow-sm">
                      <i className="ph-bold ph-shield-check"></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black truncate text-purple-950">
                        {t("adminPanel")}
                      </p>
                      <p className="text-[10px] truncate text-purple-600">
                        {lang === "ar" ? "إدارة الأصناف والفروع والموظفين" : "Manage products, branches & staff"}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-purple-600">❯</span>
                </button>
              )}
            </nav>

            {/* Branch Switcher In Sidebar */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <label className="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                {lang === "ar" ? "تبديل الفرع المختار" : "Switch Branch"}
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

            {/* Reset All Stock Button */}
            <div className="mt-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowReset(true)}
                className="w-full py-2.5 px-3 rounded-xl border border-red-200 bg-red-50/60 hover:bg-red-50 text-red-600 font-bold text-xs transition flex items-center justify-center gap-1.5"
              >
                <i className="ph-bold ph-arrows-counter-clockwise text-sm"></i>
                <span>{t("resetAllBtn")}</span>
              </button>
            </div>

            {/* Employee Session Card at Bottom of Sidebar */}
            {session && (
              <div className="mt-4 pt-3 border-t border-slate-100 bg-slate-50/80 rounded-2xl p-3 border border-slate-200/60 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm shrink-0">
                    <i className="ph-bold ph-user"></i>
                  </div>
                  <div className="min-w-0 leading-tight">
                    <p className="text-xs font-black text-slate-900 truncate">
                      {getEmployeeName(session.full_name)}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      #{session.employee_id} • {session.role === "admin" ? "Admin" : "Employee"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={logout}
                  title={lang === "en" ? "Logout" : "تسجيل الخروج"}
                  className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-600 hover:border-red-200 transition shrink-0"
                >
                  <i className="ph-bold ph-sign-out text-sm"></i>
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ── Main Content Area (منطقة المنتجات وجرد المخزون) ───────── */}
        <main className="flex-1 min-w-0 space-y-3 sm:space-y-6">
          {/* Top Quick KPI Overview - Compact 4-column strip on mobile, spacious cards on desktop */}
          <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
            <div className="bg-white rounded-2xl sm:rounded-3xl p-2 sm:p-4 border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-center sm:justify-between text-center sm:text-start">
              <div className="min-w-0">
                <p className="text-[9.5px] sm:text-[11px] font-bold text-slate-400 truncate">{lang === "ar" ? "إجمالي الأصناف" : "Total Items"}</p>
                <p className="text-sm sm:text-2xl font-black text-slate-900 mt-0.5">{stockStats.total}</p>
              </div>
              <div className="hidden sm:flex w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 items-center justify-center text-xl shrink-0">
                <i className="ph-bold ph-package"></i>
              </div>
            </div>

            <div className="bg-white rounded-2xl sm:rounded-3xl p-2 sm:p-4 border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-center sm:justify-between text-center sm:text-start">
              <div className="min-w-0">
                <p className="text-[9.5px] sm:text-[11px] font-bold text-slate-400 truncate">{lang === "ar" ? "متوفر" : "In Stock"}</p>
                <p className="text-sm sm:text-2xl font-black text-emerald-600 mt-0.5">{stockStats.inStock}</p>
              </div>
              <div className="hidden sm:flex w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 items-center justify-center text-xl shrink-0">
                <i className="ph-bold ph-check-circle"></i>
              </div>
            </div>

            <div className="bg-white rounded-2xl sm:rounded-3xl p-2 sm:p-4 border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-center sm:justify-between text-center sm:text-start">
              <div className="min-w-0">
                <p className="text-[9.5px] sm:text-[11px] font-bold text-slate-400 truncate">{lang === "ar" ? "منخفض/نافد" : "Low / Out"}</p>
                <p className="text-sm sm:text-2xl font-black text-amber-600 mt-0.5">
                  {stockStats.lowStock + stockStats.outOfStock}
                </p>
              </div>
              <div className="hidden sm:flex w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 items-center justify-center text-xl shrink-0">
                <i className="ph-bold ph-warning-circle"></i>
              </div>
            </div>

            <div className="bg-white rounded-2xl sm:rounded-3xl p-2 sm:p-4 border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-center sm:justify-between text-center sm:text-start">
              <div className="min-w-0">
                <p className="text-[9.5px] sm:text-[11px] font-bold text-slate-400 truncate">{lang === "ar" ? "في الطلب" : "In Order"}</p>
                <p className="text-sm sm:text-2xl font-black text-purple-600 mt-0.5">{stockStats.inOrder}</p>
              </div>
              <div className="hidden sm:flex w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 items-center justify-center text-xl shrink-0">
                <i className="ph-bold ph-shopping-cart-simple"></i>
              </div>
            </div>
          </div>

          {/* Search & Filter Bar - Compact single row on mobile */}
          <div className="bg-white rounded-2xl sm:rounded-3xl p-2 sm:p-3.5 border border-slate-200/90 shadow-xs flex flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <i className={`ph ph-magnifying-glass absolute top-1/2 ${lang === 'ar' ? 'right-3 sm:right-4' : 'left-3 sm:left-4'} -translate-y-1/2 text-slate-400 text-base sm:text-lg`}></i>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className={`w-full bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl ${lang === 'ar' ? 'pr-8 sm:pr-11 pl-2.5 sm:pl-4' : 'pl-8 sm:pl-11 pr-2.5 sm:pr-4'} py-2 sm:py-2.5 text-slate-800 font-medium focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition text-xs sm:text-sm`}
              />
            </div>
            <div className="w-28 sm:w-56 shrink-0">
              <select
                value={unitFilter}
                onChange={(e) => setUnitFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl px-2 sm:px-3.5 py-2 sm:py-2.5 text-slate-800 font-medium focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition text-xs sm:text-sm cursor-pointer truncate"
              >
                <option value="ALL">{t("allUnits")}</option>
                <option value="CTN">📦 CTN</option>
                <option value="PKT">📑 PKT</option>
                <option value="PCS">✨ PCS</option>
              </select>
            </div>
          </div>

          {/* Category Navigation Pills */}
          <div className="overflow-x-auto pb-1 -mx-2 px-2 sm:mx-0 sm:px-0">
            <div className="flex gap-2 min-w-max">
              <TabButton active={selectedCat === "ALL"} onClick={() => setSelectedCat("ALL")}>
                {t("allCategories")}{" "}
                <span className={`px-1.5 py-0.5 rounded-md ml-1 text-xs font-mono ${selectedCat === "ALL" ? "bg-white/20" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
                  {items.length}
                </span>
              </TabButton>
              {categories.map((cat) => {
                const meta = getMeta(cat);
                const count = categoryCounts[cat] ?? 0;
                const active = selectedCat === cat;
                const catName = getCategoryName(cat);
                return (
                  <TabButton key={cat} active={active} onClick={() => setSelectedCat(cat)}>
                    {meta.icon} {catName}{" "}
                    <span className={`px-1.5 py-0.5 rounded-md ml-1 text-[11px] font-mono ${active ? "bg-white/20" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
                      {count}
                    </span>
                  </TabButton>
                );
              })}
            </div>
          </div>

          {/* Catalog Header & Count */}
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm sm:text-base font-black text-slate-800 flex items-center gap-2">
              <i className="ph-bold ph-squares-four text-blue-600"></i>
              <span>{t("productCatalog")}</span>
            </h2>
            <span className="bg-blue-50 text-blue-700 border border-blue-200 py-0.5 px-2.5 rounded-full text-xs font-black">
              {filtered.length} {t("items")}
            </span>
          </div>

          {/* Products Grid */}
          {filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-300">
              <i className="ph-duotone ph-package text-6xl mb-3 text-slate-300"></i>
              <h3 className="text-lg font-bold text-slate-700 mb-1">{t("searchNoResults")}</h3>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5">
                {displayedProducts.map((p) => (
                  <ProductCard
                    key={p.id}
                    p={p}
                    orderUnit={orderUnits[p.id]}
                    onPatch={patch}
                    onStep={stepField}
                    onOrder={handleOrder}
                    onCopyCode={handleCopyCode}
                    onOpenHistory={handleOpenHistory}
                  />
                ))}
              </div>

              {/* Progressive Load More indicator & trigger */}
              {filtered.length > displayedProducts.length && (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => Math.min(prev + 36, filtered.length))}
                    className="px-6 py-2.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold text-xs shadow-2xs hover:shadow-md transition flex items-center gap-2 cursor-pointer"
                  >
                    <i className="ph-bold ph-arrow-down text-blue-600"></i>
                    <span>
                      {lang === "en"
                        ? `Load More Products (${filtered.length - displayedProducts.length} remaining)`
                        : `عرض المزيد من المنتجات (متبقي ${filtered.length - displayedProducts.length} صنف)`}
                    </span>
                  </button>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {lang === "en"
                      ? `Showing ${displayedProducts.length} of ${filtered.length} items`
                      : `يتم عرض ${displayedProducts.length} من أصل ${filtered.length} صنف`}
                  </p>
                </div>
              )}
              <div ref={loadMoreRef} className="h-4" />
            </>
          )}
        </main>
      </div>


      {/* MODAL: ORDER QTY & UNIT PROMPT */}
      {promptProd && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 modal-enter" onClick={() => setPromptId(null)}>
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl relative modal-content-enter p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
              <i className="ph-bold ph-shopping-cart text-2xl"></i>
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-1 leading-snug">{getProductName(promptProd)}</h3>
            <p className="text-slate-400 text-xs mb-3 font-mono">
              #{promptProd.code} • {lang === "en" ? "Catalog Unit:" : "الوحدة الأساسية:"} {getUnitName(promptProd.unitCode, promptProd.unitLabel)}
            </p>

            {/* UNIT SELECTOR: كرتون / باكت / حبة */}
            <div className="mb-4 text-right" dir={lang === "ar" ? "rtl" : "ltr"}>
              <label className="block text-xs font-black text-slate-700 mb-2">
                {lang === "en" ? "Choose Order Unit:" : "اختر وحدة الطلب (كرتون / باكت / حبة):"}
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setPromptUnit("CTN")}
                  className={`py-2 px-2 rounded-xl text-xs font-black transition flex flex-col items-center justify-center gap-0.5 ${
                    promptUnit === "CTN"
                      ? "bg-white text-blue-700 shadow-md shadow-blue-500/10 border border-blue-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                  }`}
                >
                  <i className="ph-bold ph-package text-base"></i>
                  <span>{lang === "en" ? "Carton" : "كرتون"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPromptUnit("PKT")}
                  className={`py-2 px-2 rounded-xl text-xs font-black transition flex flex-col items-center justify-center gap-0.5 ${
                    promptUnit === "PKT"
                      ? "bg-white text-amber-700 shadow-md shadow-amber-500/10 border border-amber-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                  }`}
                >
                  <i className="ph-bold ph-squares-four text-base"></i>
                  <span>{lang === "en" ? "Packet" : "باكت"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPromptUnit("PCS")}
                  className={`py-2 px-2 rounded-xl text-xs font-black transition flex flex-col items-center justify-center gap-0.5 ${
                    promptUnit === "PCS"
                      ? "bg-white text-emerald-700 shadow-md shadow-emerald-500/10 border border-emerald-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                  }`}
                >
                  <i className="ph-bold ph-circle text-base"></i>
                  <span>{lang === "en" ? "Piece / Loose" : "حبة / مفرط"}</span>
                </button>
              </div>
            </div>

            <div className="mb-5 text-right" dir={lang === "ar" ? "rtl" : "ltr"}>
              <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center justify-between">
                <span>{lang === "en" ? "Quantity to Order:" : "الكمية المطلوبة:"}</span>
                <span className="text-[11px] font-bold text-blue-600">
                  {promptUnit === "CTN" ? (lang === "en" ? "in Cartons" : "بالكرتون 📦") : promptUnit === "PKT" ? (lang === "en" ? "in Packets" : "بالباكت 🗂️") : (lang === "en" ? "in Pieces" : "بالحبة 낱")}
                </span>
              </label>
              <input
                type="number"
                inputMode="numeric"
                autoFocus
                value={promptQty}
                onChange={(e) => setPromptQty(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder={lang === "en" ? "e.g. 3" : "مثال: 3"}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-center text-xl font-black outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition font-mono"
              />
            </div>

            <div className="flex gap-2.5">
              <button onClick={() => setPromptId(null)} className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 rounded-xl transition text-sm">
                {t("cancel")}
              </button>
              <button
                onClick={() => {
                  const val = parseInt(promptQty, 10);
                  if (isNaN(val) || val <= 0) {
                    patch(promptProd.id, { orderQty: null });
                    setOrderUnits((prev) => {
                      const next = { ...prev };
                      delete next[promptProd.id];
                      return next;
                    });
                    notify(lang === "en" ? "Item removed from order list." : "تمت إزالة المنتج من قائمة الطلبات.");
                  } else {
                    patch(promptProd.id, { orderQty: val });
                    setOrderUnits((prev) => ({ ...prev, [promptProd.id]: promptUnit }));
                    const unitTitle = promptUnit === "CTN" ? (lang === "en" ? "Cartons" : "كرتون") : promptUnit === "PKT" ? (lang === "en" ? "Packets" : "باكت") : (lang === "en" ? "Pieces" : "حبة");
                    notify(lang === "en" ? `Ordered: ${val} ${unitTitle}! 🛒` : `تم تحديد الطلب: ${val} ${unitTitle}! 🛒`);
                  }
                  setPromptId(null);
                }}
                className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl transition shadow-lg shadow-blue-600/30 text-sm flex items-center justify-center gap-1.5"
              >
                <i className="ph-bold ph-check"></i>
                <span>{lang === "en" ? "Save to List" : "حفظ في القائمة"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESET WARNING */}
      {showReset && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 modal-enter" onClick={() => setShowReset(false)}>
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl relative modal-content-enter p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ph-bold ph-warning text-3xl"></i>
            </div>
            <h3 className="text-xl font-extrabold text-slate-800 mb-2">
              {lang === "en" ? "Reset All Quantities?" : "تصفير جميع الكميات؟"}
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              {lang === "en" ? "Are you sure you want to clear and reset all inventory numbers?" : "هل أنت متأكد أنك تريد مسح وتصفير جميع الأرقام المدخلة في الجرد؟"}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowReset(false)} className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 rounded-xl transition">
                {t("cancel")}
              </button>
              <button
                onClick={() => {
                  setItems((prev) => prev.map((p) => ({ ...p, qty: null, packs: null, packSize: null, loose: null, orderQty: null })));
                  resetMut.mutate();
                  setShowReset(false);
                  notify(lang === "en" ? "All quantities reset" : "تم تصفير جميع الكميات");
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-red-600/30"
              >
                {lang === "en" ? "Yes, Reset" : "نعم، صَفِّر"}
              </button>
            </div>
          </div>
        </div>
      )}



      {showSnapshots && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 modal-enter" onClick={() => setShowSnapshots(false)}>
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl relative modal-content-enter flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-3xl">
              <h3 className="text-lg font-extrabold text-slate-800">
                {lang === "en" ? "Weekly & Monthly Audit History" : "سجل الجرد الأسبوعي والشهري"}
              </h3>
              <button onClick={() => setShowSnapshots(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-slate-500 border border-slate-200"><i className="ph-bold ph-x"></i></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3">
              {(snapshotsQuery.data ?? []).length === 0 ? (
                <p className="text-center text-slate-400 font-bold py-8">
                  {lang === "en" ? "No saved audits" : "لا توجد جردات محفوظة"}
                </p>
              ) : snapshotsQuery.data?.map((snapshot) => (
                <div key={snapshot.id} className="flex items-center justify-between border border-slate-200 rounded-xl p-3">
                  <span className="font-bold text-slate-700">
                    {snapshot.period === "weekly" ? (lang === "en" ? "Weekly Audit" : "جرد أسبوعي") : (lang === "en" ? "Monthly Audit" : "جرد شهري")}
                  </span>
                  <span className="text-xs text-slate-400">{new Date(snapshot.capturedAt).toLocaleString(lang === "en" ? "en-US" : "ar-EG")}</span>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-2">
              <button onClick={() => saveSnapshot("weekly")} className="flex-1 bg-emerald-600 text-white font-bold py-3 rounded-xl">
                {lang === "en" ? "Save Weekly" : "حفظ أسبوعي"}
              </button>
              <button onClick={() => saveSnapshot("monthly")} className="flex-1 bg-amber-600 text-white font-bold py-3 rounded-xl">
                {lang === "en" ? "Save Monthly" : "حفظ شهري"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ORDER LIST */}
      {showOrder && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-3 sm:p-4 modal-enter" onClick={() => setShowOrder(false)}>
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl relative modal-content-enter flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 rounded-t-3xl">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shadow-inner text-base">
                  <i className="ph-bold ph-shopping-cart"></i>
                </span>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                    {t("nextDayOrder")}
                    <span className="text-xs bg-blue-100 text-blue-700 font-mono px-2 py-0.5 rounded-full font-bold">
                      {orderedItems.length}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {lang === "en" ? "Review tomorrow's cargo items before dispatching" : "مراجعة كميات وأصناف بضاعة الغد قبل الاعتماد"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowOrder(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-200 border border-slate-200 transition"
              >
                <i className="ph-bold ph-x text-sm"></i>
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-2.5">
              {orderedItems.length === 0 ? (
                <div className="py-16 text-center text-slate-400 font-bold bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                  <i className="ph-duotone ph-shopping-cart text-4xl mb-2 text-slate-300 block"></i>
                  {lang === "en"
                    ? "Order list is currently empty. Click on cart (🛒) icon on any product to set order quantity!"
                    : "قائمة الطلبات فارغة حالياً. اضغط على أيقونة السلة (🛒) في أي صنف لتحديد الكمية المطلوبة!"}
                </div>
              ) : (
                orderedItems.map((p) => {
                  const currentUnitLabel = getSelectedOrderUnitLabel(p.id, p.unitCode, p.unitLabel);
                  const currentQty = p.orderQty ?? 1;
                  return (
                    <div
                      key={p.id}
                      className="bg-white hover:bg-slate-50/80 border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs transition"
                    >
                      {/* Product details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="text-[11px] font-mono font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                            #{p.code}
                          </span>
                          <span className="text-[10.5px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                            {getUnitName(p.unitCode, p.unitLabel)}
                          </span>
                        </div>
                        <h5 className="text-sm font-black text-slate-900 truncate leading-snug">
                          {getProductName(p)}
                        </h5>
                        <p className="text-[11px] font-sans text-slate-400 truncate mt-0.5" dir="ltr">
                          {lang === "en" ? p.nameAr : p.nameEn}
                        </p>
                      </div>

                      {/* Stepper, Quantity Badge, & Delete */}
                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="flex items-center gap-1 bg-amber-50/90 border border-amber-200 p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => {
                              const next = currentQty - 1;
                              patch(p.id, { orderQty: next > 0 ? next : null });
                            }}
                            className="w-7 h-7 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-200/70 flex items-center justify-center font-black active:scale-95 transition text-xs shadow-2xs"
                            title={lang === "en" ? "Decrease" : "إنقاص"}
                          >
                            <i className="ph-bold ph-minus"></i>
                          </button>
                          <div className="px-2.5 py-0.5 text-center min-w-[75px]">
                            <span className="text-sm font-black text-amber-950 font-sans block leading-tight">
                              {currentQty}
                            </span>
                            <span className="text-[10px] font-bold text-amber-800 leading-none block">
                              {currentUnitLabel}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => patch(p.id, { orderQty: currentQty + 1 })}
                            className="w-7 h-7 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-200/70 flex items-center justify-center font-black active:scale-95 transition text-xs shadow-2xs"
                            title={lang === "en" ? "Increase" : "زيادة"}
                          >
                            <i className="ph-bold ph-plus"></i>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => patch(p.id, { orderQty: null })}
                          className="w-8 h-8 flex items-center justify-center text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl border border-transparent hover:border-rose-200 transition shrink-0"
                          title={lang === "en" ? "Remove item" : "حذف الصنف"}
                        >
                          <i className="ph-bold ph-trash text-base"></i>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50/70 rounded-b-3xl space-y-2">
              {/* Primary Actions Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={handleSendOrderToAdmin}
                  disabled={orderedItems.length === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black py-2.5 px-3 rounded-xl transition shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 text-xs sm:text-sm active:scale-[0.99]"
                >
                  <i className="ph-bold ph-paper-plane-tilt text-base"></i>
                  <span>{lang === "en" ? "Send Order to Admin 🚀" : "إرسال الطلب للأدمن 🚀"}</span>
                </button>
                <button
                  onClick={() => {
                    setShowOrder(false);
                    setShowReceivingModal(true);
                  }}
                  disabled={orderedItems.length === 0}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-black py-2.5 px-3 rounded-xl transition shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 text-xs sm:text-sm active:scale-[0.99]"
                  title={lang === "en" ? "Check arrived products and intake to stock" : "فحص المنتجات الواصلة وتوريدها للمخزون"}
                >
                  <i className="ph-bold ph-package-receive text-base"></i>
                  <span>{lang === "en" ? "Receive Products 📥" : "استلام المنتجات وتوريدها 📥"}</span>
                </button>
              </div>

              {/* Secondary Utility Actions Row */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={copyOrderText}
                  disabled={orderedItems.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl transition shadow-sm flex items-center justify-center gap-1.5 text-xs"
                >
                  <i className="ph-bold ph-copy text-sm"></i>
                  <span>{lang === "en" ? "Copy List" : "نسخ القائمة"}</span>
                </button>
                <button
                  onClick={printOrderPdf}
                  disabled={orderedItems.length === 0}
                  className="bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold py-2 rounded-xl transition flex items-center justify-center gap-1.5 text-xs shadow-sm"
                  title="PDF"
                >
                  <i className="ph-bold ph-file-pdf text-sm text-rose-400"></i>
                  <span>PDF</span>
                </button>
                <button
                  onClick={() => setShowOrder(false)}
                  className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold py-2 rounded-xl transition text-xs shadow-2xs"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Goods Receiving & Stock Intake Modal */}
      {showReceivingModal && (
        <GoodsReceivingModal
          isOpen={showReceivingModal}
          onClose={() => setShowReceivingModal(false)}
          orderItems={orderedItems.map((p) => ({
            id: p.id,
            code: p.code,
            nameAr: p.nameAr,
            nameEn: p.nameEn,
            orderQty: p.orderQty ?? 1,
            unitLabel: getSelectedOrderUnitLabel(p.id, p.unitCode, p.unitLabel),
            unitCode: orderUnits[p.id] || p.unitCode,
          }))}
          onSuccess={() => {
            notify(lang === "en" ? "Stock successfully received and updated! 🟢" : "تم استلام البضاعة وتوريد الكميات للمخزون بنجاح! 🟢");
          }}
        />
      )}

      {/* MODAL: RESET ALL STOCK CONFIRMATION */}
      {showReset && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 modal-enter" onClick={() => setShowReset(false)}>
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl relative modal-content-enter p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
              <i className="ph-bold ph-warning text-3xl"></i>
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">
              {lang === "en" ? "Reset All Stock Quantities?" : "تصفير جميع كميات المخزون؟"}
            </h3>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
              {lang === "en"
                ? "This action will reset all product quantities to zero (0) so you can start entering real inventory counts. Are you sure you want to proceed?"
                : "هذا الإجراء سيقوم بتصفير كميات جميع المنتجات بالكامل (صفر) لكي تبدأ بإدخال كميات الجرد الحقيقية. هل تود المتابعة؟"}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowReset(false)}
                disabled={resetMut.isPending}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                disabled={resetMut.isPending}
                onClick={() => {
                  resetMut.mutate(undefined, {
                    onSuccess: () => {
                      setShowReset(false);
                    }
                  });
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black transition flex items-center justify-center gap-2 shadow-lg shadow-red-600/25"
              >
                {resetMut.isPending ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <i className="ph-bold ph-arrows-counter-clockwise"></i>
                )}
                <span>{lang === "en" ? "Yes, Reset All" : "نعم، تصفير الكل"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Auth Modal */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* Product Stock History & Last Update Modal */}
      {historyProduct && (
        <ProductStockHistoryModal
          product={historyProduct}
          branchCode={selectedBranch}
          onClose={() => setHistoryProduct(null)}
        />
      )}

      {/* Inter-Branch Transfer Modal */}
      {showTransferModal && (
        <BranchTransferModal
          isOpen={showTransferModal}
          onClose={() => {
            setShowTransferModal(false);
            transfersQuery.refetch();
            utils.inventory.list.invalidate();
          }}
        />
      )}
    </div>
  );
}

const TabButton = React.memo(function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
        active
          ? "bg-slate-900 text-white shadow-md border border-transparent"
          : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
});

const ProductCard = React.memo(function ProductCard({
  p,
  orderUnit,
  onPatch,
  onStep,
  onOrder,
  onCopyCode,
  onOpenHistory,
}: {
  p: Product;
  orderUnit?: "CTN" | "PKT" | "PCS";
  onPatch: (id: number, fields: Fields, debounce?: boolean) => void;
  onStep: (p: Product, field: "qty" | "packs" | "loose", change: number) => void;
  onOrder: (id: number) => void;
  onCopyCode: (code: string) => void;
  onOpenHistory: (p: Product) => void;
}) {
  const { lang, getProductName, getUnitName, t } = useLanguage();
  const meta = getMeta(p.category);
  const isDetailed = p.mode === "detailed";
  const hasOrder = p.orderQty != null && p.orderQty > 0;

  const numInput = (
    field: "qty" | "packs" | "packSize" | "loose",
    w: string,
    extraCls: string,
    placeholder: string,
  ) => (
    <input
      type="number"
      inputMode="numeric"
      value={p[field] ?? ""}
      placeholder={placeholder}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const raw = e.target.value.trim();
        onPatch(p.id, { [field]: raw === "" ? null : Math.max(0, parseInt(raw, 10) || 0) } as Fields, true);
      }}
      className={`card-input ${w} bg-white border text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition text-center font-black ${extraCls}`}
    />
  );

  const stepBtn = (field: "qty" | "packs" | "loose", change: number, cls: string, icon: string, big = false) => (
    <button
      onClick={() => onStep(p, field, change)}
      className={`${big ? "w-9 h-9 text-sm" : "w-7 h-7 text-xs"} rounded-xl font-black flex items-center justify-center active:scale-95 transition shrink-0 ${cls}`}
    >
      <i className={`ph-bold ${icon}`}></i>
    </button>
  );

  const qtyVal = p.qty ?? 0;
  const packs = p.packs ?? 0;
  const packSize = p.packSize ?? 0;
  const loose = p.loose ?? 0;

  let total = 0;
  let formulaText = "";
  if (packs > 0 && packSize > 0) {
    total = packs * packSize + loose;
    formulaText = `(${packs} × ${packSize}) + ${loose}`;
  } else if (packs > 0) {
    total = loose;
    formulaText = t("writeCapacity");
  } else {
    total = loose;
    formulaText = `${loose} ${t("pcs")}`;
  }

  const productName = getProductName(p);
  const secondaryName = lang === "en" ? p.nameAr : p.nameEn;
  const unitName = getUnitName(p.unitCode, p.unitLabel);

  return (
    <div
      className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-200/90 hover:border-blue-500/50 hover:shadow-lg transition-all duration-200 flex flex-col justify-between h-full relative group"
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 220px" }}
    >
      <div>
        {/* Top Header Row of the Card: Code, Unit, and Stock Status */}
        <div className="flex items-center justify-between gap-1.5 mb-1.5">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onCopyCode(p.code)}
              title={lang === "en" ? "Click to copy code" : "اضغط لنسخ الكود"}
              className="text-[11px] sm:text-xs font-mono font-black bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 px-1.5 py-0.5 rounded-lg text-slate-700 transition flex items-center gap-1 shadow-2xs"
            >
              <span>#{p.code}</span>
              <i className="ph-bold ph-copy text-[9px] text-slate-400"></i>
            </button>
            <span className="text-[9.5px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
              {unitName}
            </span>
          </div>

          {/* Smart Stock Status Badge */}
          {qtyVal === 0 ? (
            <span className="inline-flex items-center gap-1 text-[9.5px] sm:text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
              {lang === "ar" ? "نفد" : "Out"}
            </span>
          ) : qtyVal <= 10 ? (
            <span className="inline-flex items-center gap-1 text-[9.5px] sm:text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              {lang === "ar" ? "منخفض" : "Low"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[9.5px] sm:text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {lang === "ar" ? "متوفر" : "In Stock"}
            </span>
          )}
        </div>

        {/* Product Media Layout: Horizontal side-by-side on mobile, stacked on desktop */}
        <div className="flex items-center gap-2.5 sm:block mb-2">
          {/* Product Image preview */}
          {(() => {
            const displayImg = p.imageUrl || getProductImage(p);
            return (
              <div className="sm:flex sm:justify-center sm:my-2 shrink-0">
                <div
                  className="w-16 h-16 sm:w-32 sm:h-32 rounded-xl sm:rounded-2xl border border-slate-200/90 bg-slate-50/50 p-1 sm:p-2 flex items-center justify-center overflow-hidden cursor-pointer group/img shadow-2xs hover:shadow-md hover:border-blue-400/60 transition duration-200 relative"
                  onClick={() => onOpenHistory(p)}
                  title={lang === "en" ? "Click to view stock history & latest update" : "اضغط لمعاينة آخر تحديث وسجل الحركات"}
                >
                  <img
                    src={displayImg}
                    alt={productName}
                    loading="lazy"
                    className="w-full h-full object-cover rounded-lg sm:rounded-xl group-hover/img:scale-105 transition duration-300"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      const fallback = getCategoryFallbackImage(p.category);
                      if (target.src !== fallback) {
                        target.src = fallback;
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity rounded-xl sm:rounded-2xl hidden sm:flex items-end justify-center pb-1.5">
                    <span className="text-[10px] font-bold text-white bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                      <i className="ph-bold ph-eye"></i>
                      {lang === "en" ? "Details" : "سجل الحركة"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Product Info (Title, Category, Last Update) */}
          <div className="flex-1 min-w-0">
            {/* Category Chip */}
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-[9.5px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                <span>{meta.icon}</span>
                <span className="truncate max-w-[110px]">{p.category}</span>
              </span>
            </div>

            {/* Product Title */}
            <div
              className="cursor-pointer group/title"
              onClick={() => onOpenHistory(p)}
              title={lang === "en" ? "Click to view stock history & latest update" : "اضغط لمعاينة آخر تحديث وسجل الحركات"}
            >
              <h4 className="text-xs sm:text-sm font-black text-slate-900 leading-tight sm:leading-snug group-hover/title:text-blue-600 transition line-clamp-2">
                {productName}
              </h4>
              {secondaryName && (
                <p className="text-[9.5px] sm:text-[10.5px] font-semibold text-slate-400 truncate mt-0.5" dir="ltr">
                  {secondaryName}
                </p>
              )}
            </div>

            {/* Latest Stock Update Snippet */}
            {p.lastStockUpdate ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenHistory(p);
                }}
                className="mt-1 w-full flex items-center justify-between text-[9.5px] sm:text-[10.5px] font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg sm:rounded-xl bg-slate-50 hover:bg-blue-50/50 text-slate-700 transition border border-slate-200/80 shadow-2xs"
                title={lang === "en" ? "Click to view full stock update details & history" : "اضغط لمعاينة تفاصيل آخر تحديث وسجل الحركات"}
              >
                <span className="flex items-center gap-1 text-slate-500 truncate">
                  <i className="ph-bold ph-clock text-blue-600"></i>
                  <span className="hidden sm:inline">{lang === "en" ? "Last Update:" : "آخر حركة:"}</span>
                </span>
                <span className={`font-black shrink-0 ${p.lastStockUpdate.changeType === "increase" ? "text-emerald-700" : "text-rose-600"}`}>
                  {p.lastStockUpdate.changeType === "increase" ? `+${p.lastStockUpdate.delta}` : p.lastStockUpdate.delta} {unitName}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenHistory(p);
                }}
                className="mt-1 w-full flex items-center justify-between text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-lg sm:rounded-xl bg-slate-50/60 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition border border-dashed border-slate-200"
                title={lang === "en" ? "Click to view stock history" : "اضغط لمعاينة سجل حركات الصنف"}
              >
                <span className="flex items-center gap-1">
                  <i className="ph-bold ph-clock-counter-clockwise text-slate-400"></i>
                  <span>{lang === "en" ? "Log" : "سجل الحركة"}</span>
                </span>
                <span className="text-blue-600 font-black text-[9px]">❯</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Card Controls & Stock Mutation Area */}
      <div className="mt-auto space-y-1.5 pt-1.5 border-t border-slate-100">
        {/* Mode Switcher Toggle */}
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[10px] sm:text-[10.5px] font-bold text-slate-500">
            {lang === "en" ? "Count Mode:" : "طريقة الجرد:"}
          </span>
          <button
            onClick={() => onPatch(p.id, { mode: isDetailed ? "simple" : "detailed" })}
            title={lang === "en" ? "Switch view mode" : "تبديل طريقة الجرد"}
            className="text-[9.5px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 flex items-center gap-1 transition shadow-2xs"
          >
            <i className="ph-bold ph-arrows-clockwise text-blue-600"></i>
            {isDetailed ? (lang === "en" ? "Detailed" : "تفصيلي") : (lang === "en" ? "Simple" : "بسيط")}
          </button>
        </div>

        {!isDetailed ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-1 shadow-inner">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 px-1 flex items-center gap-1">
                <i className="ph-bold ph-tag text-blue-600"></i> {t("availableQty")}:
              </span>
              <div className="flex items-center gap-1">
                {stepBtn("qty", -1, "bg-white hover:bg-rose-50 hover:text-rose-600 text-slate-600 border border-slate-200 shadow-2xs", "ph-minus", false)}
                {numInput("qty", "w-12 sm:w-14 text-sm sm:text-base py-0.5 border-slate-200 rounded-lg", "", "0")}
                {stepBtn("qty", 1, "bg-blue-600 hover:bg-blue-700 text-white shadow-sm", "ph-plus", false)}
              </div>
            </div>
            <div className="bg-slate-900 text-white py-1 px-2 sm:py-1.5 sm:px-2.5 rounded-xl shadow-sm flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] sm:text-[9.5px] font-bold text-slate-400">{t("totalStock")}</span>
                <span className="hidden sm:inline text-[9px] text-emerald-400 font-bold">• {t("directAudit")}</span>
              </div>
              <span className="text-xs sm:text-sm font-black font-sans text-amber-300">
                {lang === 'ar' ? arNum(qtyVal) : qtyVal.toLocaleString("en-US")} <span className="text-[9px] sm:text-[9.5px] text-white font-normal">{unitName}</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-1 shadow-2xs">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 px-1 flex items-center gap-1">
                <i className="ph-bold ph-package text-blue-600 text-xs"></i> {t("numPacks")}:
              </span>
              <div className="flex items-center gap-1">
                {stepBtn("packs", -1, "bg-white hover:bg-rose-50 hover:text-rose-600 text-slate-600 border border-slate-200", "ph-minus")}
                {numInput("packs", "w-11 sm:w-12 py-0.5 border-slate-200 rounded-md text-xs sm:text-sm", "", "0")}
                {stepBtn("packs", 1, "bg-white hover:bg-blue-50 hover:text-blue-600 text-slate-600 border border-slate-200", "ph-plus")}
              </div>
            </div>
            <div className="flex items-center justify-between bg-amber-50/80 border border-amber-300/80 rounded-lg p-1 shadow-2xs">
              <span className="text-[10px] sm:text-[11px] font-bold text-amber-900 px-1 flex items-center gap-1">
                <i className="ph-bold ph-squares-four text-amber-600 text-xs"></i> {t("packSizeLabel")}:
              </span>
              <div className="flex items-center pl-0.5">
                {numInput("packSize", "w-16 sm:w-20 py-0.5 border-amber-300 rounded-md text-amber-900 placeholder:text-[9px] placeholder:font-normal focus:border-amber-500 text-xs sm:text-sm", "", t("writeCapacity"))}
              </div>
            </div>
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-1 shadow-2xs">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 px-1 flex items-center gap-1">
                <i className="ph-bold ph-stack text-emerald-600 text-xs"></i> {t("loosePiecesCount")}:
              </span>
              <div className="flex items-center gap-1">
                {stepBtn("loose", -1, "bg-white hover:bg-rose-50 hover:text-rose-600 text-slate-600 border border-slate-200", "ph-minus")}
                {numInput("loose", "w-11 sm:w-12 py-0.5 border-slate-200 rounded-md text-xs sm:text-sm", "", "0")}
                {stepBtn("loose", 1, "bg-white hover:bg-emerald-50 hover:text-emerald-600 text-slate-600 border border-slate-200", "ph-plus")}
              </div>
            </div>
            <div className="bg-slate-900 text-white py-1 px-2 sm:py-1.5 sm:px-2.5 rounded-xl shadow-sm flex items-center justify-between text-xs">
              <div>
                <span className="text-[9px] font-bold text-slate-400 block leading-none">{t("actualTotal")}</span>
                <span className="text-[9px] text-amber-400 font-mono">{formulaText}</span>
              </div>
              <span className="text-xs sm:text-sm font-black font-sans text-amber-300">
                {lang === 'ar' ? arNum(total) : total.toLocaleString("en-US")} <span className="text-[9px] text-white font-normal">{t("pcs")}</span>
              </span>
            </div>
          </div>
        )}

        {/* Order Cart Action Button */}
        <button
          onClick={() => onOrder(p.id)}
          className={`w-full py-1.5 px-2 sm:py-2 sm:px-2.5 rounded-xl font-bold text-xs transition flex items-center justify-between shadow-2xs ${
            hasOrder
              ? "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/25"
              : "bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200/80"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <i className="ph-bold ph-shopping-cart text-xs sm:text-sm"></i>
            <span>{hasOrder ? (lang === "en" ? "Order Added:" : "مطلوب لطلبية الغد:") : (lang === "en" ? "Add to Order" : "إضافة لقائمة الطلب")}</span>
          </span>
          {hasOrder ? (
            <span className="bg-white/20 px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] font-black">
              {p.orderQty} {orderUnit === "CTN" ? (lang === "en" ? "CTN" : "كرتون") : orderUnit === "PKT" ? (lang === "en" ? "PKT" : "باكت") : (lang === "en" ? "PCS" : "حبة")}
            </span>
          ) : (
            <span className="text-blue-600 font-black text-sm">+</span>
          )}
        </button>
      </div>
    </div>
  );
});

export function AddProductModal({
  title,
  product,
  categories,
  existingCodes,
  onClose,
  onSave,
  isLoading,
}: {
  title?: string;
  product?: Product;
  categories: string[];
  existingCodes: string[];
  onClose: () => void;
  onSave: (input: {
    code: string;
    nameAr: string;
    nameEn: string;
    category: string;
    mode: "simple" | "detailed";
    unitCode: "CTN" | "PKT" | "PCS";
    unitLabel: string;
    imageUrl?: string | null;
  }) => void;
  isLoading: boolean;
}) {
  const { lang, getCategoryName, t } = useLanguage();
  const modalTitle = title || (lang === "en" ? "Add New Product" : "إضافة منتج جديد");
  const [code, setCode] = useState(product?.code ?? "");
  const [nameAr, setNameAr] = useState(product?.nameAr ?? "");
  const [nameEn, setNameEn] = useState(product?.nameEn ?? "");
  const [imageUrl, setImageUrl] = useState(
    product?.imageUrl || (product?.code ? getUploadedProductImage(product.code) : "") || ""
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const allCategories = useMemo(() => {
    const predefined = Object.keys(catMeta);
    return Array.from(new Set([...predefined, ...categories]));
  }, [categories]);

  const [category, setCategory] = useState(product?.category ?? allCategories[0] ?? "عام");
  const [unitCode, setUnitCode] = useState<"CTN" | "PKT" | "PCS">(product?.unitCode ?? "CTN");
  const [mode, setMode] = useState<"simple" | "detailed">(product?.mode ?? "simple");

  const unitLabels = {
    CTN: lang === "en" ? "Carton (CTN)" : "كرتون (CTN)",
    PKT: lang === "en" ? "Packet (PKT)" : "باكيت (PKT)",
    PCS: lang === "en" ? "Piece (PCS)" : "حبة (PCS)",
  } as const;

  const fieldCls =
    "w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 transition-all outline-none text-base focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20";

  const isDuplicate = useMemo(() => {
    return existingCodes.includes(code.trim());
  }, [code, existingCodes]);

  const isNumeric = useMemo(() => {
    return /^\d+$/.test(code.trim());
  }, [code]);

  const codeError = useMemo(() => {
    if (!code.trim()) return null;
    if (!isNumeric) return lang === "en" ? "Code must contain numbers only" : "الكود يجب أن يحتوي على أرقام فقط";
    if (isDuplicate) return lang === "en" ? "This code is already in use by another product" : "هذا الكود مستخدم بالفعل لمنتج آخر";
    return null;
  }, [code, isNumeric, isDuplicate, lang]);

  const valid = code.trim() && nameAr.trim() && nameEn.trim() && isNumeric && !isDuplicate;

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 modal-enter" dir={lang === "ar" ? "rtl" : "ltr"} onClick={isLoading ? undefined : onClose}>
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl relative modal-content-enter flex flex-col max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-3xl">
          <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <span className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
              <i className="ph-bold ph-plus"></i>
            </span>
            {modalTitle}
          </h3>
          <button onClick={onClose} disabled={isLoading} className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-slate-500 hover:bg-slate-200 border border-slate-200 transition disabled:opacity-50">
            <i className="ph-bold ph-x"></i>
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              {lang === "en" ? "Product Code" : "رقم المنتج (الكود)"} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. 13011011"
              disabled={isLoading}
              className={`${fieldCls} font-sans ${codeError ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : ""}`}
              dir="ltr"
            />
            {codeError && (
              <p className="text-xs text-red-500 font-bold mt-1.5 flex items-center gap-1">
                <i className="ph-bold ph-warning-circle"></i>
                {codeError}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              {lang === "en" ? "Product Name (Arabic)" : "اسم المنتج (عربي)"} <span className="text-red-500">*</span>
            </label>
            <input type="text" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder={lang === "en" ? "Arabic Name" : "مثال: أكياس تسوق دانكن"} disabled={isLoading} className={fieldCls} />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              {lang === "en" ? "Product Name (English)" : "اسم المنتج (إنجليزي)"} <span className="text-red-500">*</span>
            </label>
            <input type="text" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Shopping Bags" disabled={isLoading} className={fieldCls + " font-sans"} dir="ltr" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              {lang === "en" ? "Product Image (Optional)" : "صورة المنتج (اختياري)"}
            </label>
            <div className="space-y-2">
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/product.jpg"
                disabled={isLoading || isUploading}
                className={fieldCls + " font-sans"}
                dir="ltr"
              />
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-violet-300 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setIsUploading(true);
                      setUploadError(null);
                      const publicUrl = await uploadProductImage(file);
                      setImageUrl(publicUrl);
                    } catch (error) {
                      setUploadError(error instanceof Error ? error.message : (lang === "en" ? "Failed to upload image" : "تعذر رفع الصورة"));
                    } finally {
                      setIsUploading(false);
                    }
                  }}
                />
                <i className="ph-bold ph-upload-simple"></i>
                {isUploading ? (lang === "en" ? "Uploading image..." : "جاري رفع الصورة...") : (lang === "en" ? "Upload from Gallery" : "رفع من المعرض")}
              </label>
              {uploadError && <p className="text-xs font-bold text-red-500">{uploadError}</p>}
            </div>
            {imageUrl.trim() && (
              <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2.5 flex items-center justify-between gap-3 shadow-2xs">
                <div className="h-16 w-16 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                  <img
                    src={imageUrl}
                    alt="Product preview"
                    className="max-h-full max-w-full object-contain"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700 truncate" dir="ltr">{imageUrl}</p>
                  <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <i className="ph-bold ph-check-circle"></i>
                    <span>{lang === "en" ? "Image attached" : "تم إرفاق الصورة"}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold transition flex items-center gap-1 shrink-0"
                  title={lang === "en" ? "Remove image" : "حذف الصورة"}
                >
                  <i className="ph-bold ph-trash text-sm"></i>
                  <span>{lang === "en" ? "Remove" : "حذف"}</span>
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              {lang === "en" ? "Group Category" : "تصنيف المجموعة"} <span className="text-red-500">*</span>
            </label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={isLoading} className={fieldCls}>
              {allCategories.map((c) => (
                <option key={c} value={c}>
                  {getMeta(c).icon} {getCategoryName(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              {lang === "en" ? "Unit Type" : "نوع الوحدة"} <span className="text-red-500">*</span>
            </label>
            <select value={unitCode} onChange={(e) => setUnitCode(e.target.value as typeof unitCode)} disabled={isLoading} className={fieldCls}>
              <option value="CTN">{lang === "en" ? "Carton (CTN)" : "كرتون (CTN)"}</option>
              <option value="PKT">{lang === "en" ? "Packet (PKT)" : "باكيت (PKT)"}</option>
              <option value="PCS">{lang === "en" ? "Piece (PCS)" : "حبة (PCS)"}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              {lang === "en" ? "Default Audit Mode" : "طريقة الجرد الافتراضية"} <span className="text-red-500">*</span>
            </label>
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} disabled={isLoading} className={fieldCls}>
              <option value="simple">{lang === "en" ? "Simple & Direct (Carton or Piece only)" : "جرد بسيط ومباشر (كرتون أو حبة فقط)"}</option>
              <option value="detailed">{lang === "en" ? "Detailed Composite (Packets + Loose Pieces)" : "جرد مركب تفصيلي (باكيتات + حبات مفرطة)"}</option>
            </select>
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3 bg-white rounded-b-3xl">
          <button onClick={onClose} disabled={isLoading} className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-bold py-3.5 rounded-xl transition">
            {t("cancel")}
          </button>
          <button
            disabled={!valid || isLoading}
            onClick={() => onSave({ code: code.trim(), nameAr: nameAr.trim(), nameEn: nameEn.trim(), category, mode, unitCode, unitLabel: unitLabels[unitCode], imageUrl: imageUrl.trim() || null })}
            className="flex-[2] bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <i className="ph-bold ph-check"></i>
            )}
            {lang === "en" ? "Save Product" : "حفظ المنتج"}
          </button>
        </div>
      </div>
    </div>
  );
}
