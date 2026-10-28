import { useState, useEffect, useMemo } from "react";
import { useLanguage } from "@/providers/LanguageContext";
import { useAuth, type AdminSubmission } from "@/providers/AuthContext";
import { GoodsReceivingModal } from "./GoodsReceivingModal";

export interface CargoOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderReceived?: (data?: any) => void;
  initialTab?: "new" | "archive";
}

export function CargoOrdersModal({
  isOpen,
  onClose,
  onOrderReceived,
  initialTab = "new",
}: CargoOrdersModalProps) {
  const { lang, t, getEmployeeName } = useLanguage();
  const { session, selectedBranch, fetchAdminSubmissions } = useAuth();
  
  const [activeTab, setActiveTab] = useState<"new" | "archive">(initialTab);
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<AdminSubmission | null>(null);
  const [search, setSearch] = useState("");

  const loadSubmissions = async () => {
    setIsLoading(true);
    try {
      const list = await fetchAdminSubmissions();
      setSubmissions(list);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSubmissions();
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const isAdmin = session?.role === "admin";
  const currentBranchCode = selectedBranch || session?.branch_code || "1011125";

  // Filter cargo orders for current branch (or all branches for Admin)
  const branchCargoOrders = useMemo(() => {
    return submissions.filter((s) => {
      if (s.type !== "cargo_order") return false;
      if (!isAdmin && s.branch_code !== currentBranchCode) return false;
      return true;
    });
  }, [submissions, isAdmin, currentBranchCode]);

  const pendingOrders = useMemo(() => {
    return branchCargoOrders.filter((s) => s.status === "pending");
  }, [branchCargoOrders]);

  const archivedOrders = useMemo(() => {
    return branchCargoOrders.filter((s) => s.status === "received" || s.status === "reviewed");
  }, [branchCargoOrders]);

  const displayedOrders = activeTab === "new" ? pendingOrders : archivedOrders;

  const filteredOrders = useMemo(() => {
    if (!search.trim()) return displayedOrders;
    const term = search.toLowerCase().trim();
    return displayedOrders.filter((o) => {
      const matchTitle = o.title.toLowerCase().includes(term);
      const matchEmp = o.employee_name.toLowerCase().includes(term);
      const matchBranch = o.branch_name.toLowerCase().includes(term) || o.branch_code.includes(term);
      const matchItems = o.details.items?.some((i) =>
        i.nameAr.toLowerCase().includes(term) ||
        (i.nameEn && i.nameEn.toLowerCase().includes(term)) ||
        i.code.includes(term)
      );
      return matchTitle || matchEmp || matchBranch || matchItems;
    });
  }, [displayedOrders, search]);

  const copyOrderDetails = (order: AdminSubmission) => {
    let text = `${order.title} [${order.id}]\n`;
    text += `🏢 ${lang === "en" ? "Branch:" : "الفرع:"} ${order.branch_name} (${order.branch_code})\n`;
    text += `👤 ${lang === "en" ? "Ordered By:" : "الموظف:"} ${order.employee_name}\n`;
    text += `📅 ${lang === "en" ? "Date:" : "التاريخ:"} ${new Date(order.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}\n\n`;
    text += `${lang === "en" ? "Items List:" : "قائمة الأصناف المطلوبة:"}\n`;

    order.details.items?.forEach((item, idx) => {
      text += `${idx + 1}. [${item.code}] ${item.nameAr} - ${item.qty ?? 1} ${item.unit || ""}\n`;
    });

    if (order.status === "received") {
      text += `\n✅ ${lang === "en" ? "Delivered & Received Into Stock" : "تم الاستلام والتوريد الفعلي للمخزون"}\n`;
      if (order.received_by) text += `📥 ${lang === "en" ? "Received By:" : "المستلم:"} ${order.received_by}\n`;
      if (order.received_at) text += `🕒 ${lang === "en" ? "Received At:" : "وقت الاستلام:"} ${new Date(order.received_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}\n`;
    }

    navigator.clipboard.writeText(text);
    alert(lang === "en" ? "Order details copied to clipboard!" : "تم نسخ تفاصيل الطلبية بنجاح!");
  };

  const printOrderPdf = (order: AdminSubmission) => {
    const rows = order.details.items?.map((item, idx) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td style="font-family: monospace;">${item.code}</td>
        <td><b>${item.nameAr}</b> ${item.nameEn ? `<br/><span style="color:#64748b;font-size:11px;">${item.nameEn}</span>` : ""}</td>
        <td style="text-align: center; font-weight: bold;">${item.qty ?? 1} ${item.unit || ""}</td>
      </tr>
    `).join("") || "";

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      alert(lang === "en" ? "Allow popups to print" : "يرجى السماح بالنوافذ المنبثقة للطباعة");
      return;
    }

    const title = activeTab === "new" ? "طلب بضاعة جديد (بانتظار الاستلام)" : "سند استلام وأرشيف طلبية بضاعة";

    printWindow.document.write(`
      <html dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
      <head>
        <meta charset="utf-8">
        <title>${title} - ${order.id}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 32px; color: #0f172a; line-height: 1.5; }
          .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
          .title { font-size: 20px; font-weight: 900; margin: 0; color: #1e293b; }
          .meta { margin-top: 8px; font-size: 13px; color: #475569; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: bold; }
          .badge-pending { background: #fef3c7; color: #92400e; }
          .badge-received { background: #d1fae5; color: #065f46; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px 12px; font-size: 13px; text-align: ${lang === 'ar' ? 'right' : 'left'}; }
          th { background: #f8fafc; font-weight: 800; color: #334155; }
          .footer { margin-top: 32px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h1 class="title">${title}</h1>
            <span class="badge ${order.status === 'received' ? 'badge-received' : 'badge-pending'}">
              ${order.status === 'received' ? 'تم الاستلام والتوريد للمخزون ✅' : 'بانتظار وصول الشحنة والاستلام ⏳'}
            </span>
          </div>
          <div class="meta">
            <div><strong>الفرع:</strong> ${order.branch_name} (${order.branch_code})</div>
            <div><strong>الموظف محرر الطلب:</strong> ${order.employee_name} (${order.employee_id})</div>
            <div><strong>رقم الطلب:</strong> ${order.id}</div>
            <div><strong>تاريخ الإنشاء:</strong> ${new Date(order.created_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}</div>
            ${order.received_at ? `<div><strong>تاريخ الاستلام:</strong> ${new Date(order.received_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}</div>` : ''}
            ${order.received_by ? `<div><strong>تم الاستلام والتوريد بواسطة:</strong> ${order.received_by}</div>` : ''}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 50px; text-align: center;">#</th>
              <th style="width: 120px;">كود الصنف</th>
              <th>اسم الصنف</th>
              <th style="width: 130px; text-align: center;">الكمية المطلوبة</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div class="footer">
          نظام دانكن لإدارة المستودعات والجرد • تم إصدار هذا التقرير آلياً
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200"
      dir={lang === "ar" ? "rtl" : "ltr"}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-amber-500/20 border border-amber-400/30 text-amber-400 flex items-center justify-center text-xl shrink-0 shadow-inner">
              <i className="ph-bold ph-package"></i>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black truncate">
                  {lang === "en" ? "Warehouse Cargo Orders & Archives" : "إدارة طلبات البضاعة والتوريد والأرشيف"}
                </h3>
                <span className="bg-white/10 text-slate-200 border border-white/20 text-[10px] font-bold px-2 py-0.5 rounded-md">
                  {isAdmin ? (lang === "en" ? "All Branches (Admin)" : "جميع الفروع (الأدمن)") : `فرع ${currentBranchCode}`}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-semibold truncate mt-0.5">
                {lang === "en"
                  ? "Track pending orders, intake stock upon arrival, and view past archives"
                  : "متابعة الطلبات الجديدة، استلام وتوريد البضاعة للمخزون، وتصفح الأرشيف السابق"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition border border-slate-700 shrink-0"
          >
            <i className="ph-bold ph-x text-base"></i>
          </button>
        </div>

        {/* Tab Controls & Filters */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex p-1 bg-slate-200/80 rounded-2xl border border-slate-300/80 shrink-0">
            {/* Tab 1: الطلبات الجديدة بانتظار الاستلام */}
            <button
              onClick={() => setActiveTab("new")}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 ${
                activeTab === "new"
                  ? "bg-white text-amber-900 shadow-md shadow-slate-400/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              <i className="ph-bold ph-hourglass text-amber-600 text-base"></i>
              <span>{lang === "en" ? "New Orders (Awaiting Receipt)" : "الطلبات الجديدة (بانتظار الاستلام)"}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                pendingOrders.length > 0 ? "bg-amber-500 text-white animate-pulse" : "bg-slate-200 text-slate-600"
              }`}>
                {pendingOrders.length}
              </span>
            </button>

            {/* Tab 2: الطلبات السابقة / الأرشيف */}
            <button
              onClick={() => setActiveTab("archive")}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 ${
                activeTab === "archive"
                  ? "bg-white text-emerald-900 shadow-md shadow-slate-400/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              <i className="ph-bold ph-archive text-emerald-600 text-base"></i>
              <span>{lang === "en" ? "Past Orders (Archive)" : "الطلبات السابقة (الأرشيف)"}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-200 text-slate-600">
                {archivedOrders.length}
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 max-w-sm">
            <i className={`ph-bold ph-magnifying-glass absolute top-1/2 ${lang === 'ar' ? 'right-3' : 'left-3'} -translate-y-1/2 text-slate-400 text-sm`}></i>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === "en" ? "Search orders or products..." : "بحث في الطلبات أو الأصناف..."}
              className={`w-full bg-white border border-slate-300 rounded-xl ${lang === 'ar' ? 'pr-9 pl-3' : 'pl-9 pr-3'} py-1.5 text-xs font-semibold focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20`}
            />
          </div>
        </div>

        {/* Orders Content List */}
        <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 space-y-4 bg-slate-100/60">
          {isLoading ? (
            <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
              <i className="ph-bold ph-spinner animate-spin text-3xl text-blue-600"></i>
              <p className="text-xs font-bold">{lang === "en" ? "Loading orders..." : "جاري تحميل الطلبات..."}</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-16 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-300 p-8">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center text-3xl mx-auto mb-3 shadow-inner">
                <i className={activeTab === "new" ? "ph-bold ph-check-circle" : "ph-bold ph-archive"}></i>
              </div>
              <h4 className="text-base font-black text-slate-700 mb-1">
                {activeTab === "new"
                  ? (lang === "en" ? "No Pending Orders" : "لا توجد طلبات جديدة بانتظار الاستلام")
                  : (lang === "en" ? "Archive is Empty" : "لا توجد طلبات سابقة في الأرشيف")}
              </h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {activeTab === "new"
                  ? (lang === "en" ? "When you confirm next-day cargo orders from the catalog cart, they will appear here." : "عند تأكيد طلب المنتجات من قائمة بضاعة الغد، ستظهر الطلبية هنا مباشرة لحين وصولها واستلامها.")
                  : (lang === "en" ? "Received orders will automatically move here once delivered into stock." : "الطلبات التي يتم استلامها وتوريدها للمخزون تنتقل تلقائياً إلى هنا موثقة بالكامل.")}
              </p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const itemCount = order.details.items?.length || 0;
              const isReceived = order.status === "received" || order.status === "reviewed";

              return (
                <div
                  key={order.id}
                  className="bg-white border border-slate-200/90 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs hover:shadow-md transition space-y-3"
                >
                  {/* Top Bar of the Order Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black shrink-0 ${
                        isReceived ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}>
                        <i className={isReceived ? "ph-bold ph-check-circle" : "ph-bold ph-clock-countdown"}></i>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm sm:text-base font-black text-slate-900 truncate">
                            {order.title}
                          </h4>
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold">
                            #{order.id.slice(-6)}
                          </span>
                          {isReceived ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-300">
                              <i className="ph-bold ph-check"></i>
                              <span>{lang === "en" ? "Received & Added to Stock" : "تم الاستلام والتوريد للمخزون ✅"}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse"></span>
                              <span>{lang === "en" ? "Awaiting Delivery & Intake" : "بانتظار الاستلام والتوريد ⏳"}</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 font-semibold mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>🏢 {order.branch_name} ({order.branch_code})</span>
                          <span>•</span>
                          <span>👤 {getEmployeeName(order.employee_name)}</span>
                          <span>•</span>
                          <span>📅 {new Date(order.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</span>
                        </p>
                      </div>
                    </div>

                    {/* Receipt Metadata (if received) */}
                    {isReceived && (order.received_by || order.received_at) && (
                      <div className="bg-emerald-50/80 border border-emerald-200 px-3 py-1.5 rounded-xl text-[11px] font-bold text-emerald-900 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <i className="ph-bold ph-user-check text-emerald-600"></i>
                          <span>{lang === "en" ? "Received by:" : "استلم بواسطة:"} {order.received_by || order.employee_name}</span>
                        </div>
                        {order.received_at && (
                          <div className="text-[10px] text-emerald-700 font-normal">
                            🕒 {new Date(order.received_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Items Preview Table */}
                  <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl overflow-hidden">
                    <div className="px-3 py-2 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between text-xs font-black text-slate-700">
                      <span>{lang === "en" ? `Ordered Items (${itemCount})` : `الأصناف المطلوبة (${itemCount})`}</span>
                      <span className="text-[11px] text-slate-500 font-normal">
                        {lang === "en" ? "Product Code & Requested Quantities" : "كود المنتج والكمية المطلوبة"}
                      </span>
                    </div>
                    <div className="p-2 sm:p-3 divide-y divide-slate-100 max-h-48 overflow-y-auto">
                      {order.details.items?.map((item, idx) => (
                        <div key={idx} className="py-2 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-[11px] text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
                              #{item.code}
                            </span>
                            <span className="font-bold text-slate-800 truncate">
                              {lang === "en" && item.nameEn ? item.nameEn : item.nameAr}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-mono font-black text-slate-900 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                              {item.qty ?? 1}
                            </span>
                            <span className="text-[11px] font-bold text-slate-500">
                              {item.unit || (lang === "en" ? "PCS" : "حبة")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Order Actions */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                    {/* Primary Intake Button (Only for Pending Orders) */}
                    {!isReceived ? (
                      <button
                        onClick={() => setReceivingOrder(order)}
                        className="bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black py-2.5 px-4 rounded-xl text-xs sm:text-sm transition shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2"
                      >
                        <i className="ph-bold ph-package-receive text-base"></i>
                        <span>{lang === "en" ? "Receive & Intake to Stock 📥" : "استلام وتوريد البضاعة للمخزون 📥"}</span>
                      </button>
                    ) : (
                      <div className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 py-1">
                        <i className="ph-bold ph-shield-check text-base text-emerald-600"></i>
                        <span>{lang === "en" ? "Fully Intaken & Logged in Archive" : "تم توريد الكميات وأرشفة المعاملة بالكامل"}</span>
                      </div>
                    )}

                    {/* Secondary Utility Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyOrderDetails(order)}
                        className="flex-1 sm:flex-initial bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2 px-3 rounded-xl transition text-xs flex items-center justify-center gap-1.5 shadow-2xs"
                        title={lang === "en" ? "Copy details" : "نسخ تفاصيل الطلب"}
                      >
                        <i className="ph-bold ph-copy text-sm text-blue-600"></i>
                        <span>{lang === "en" ? "Copy" : "نسخ"}</span>
                      </button>
                      <button
                        onClick={() => printOrderPdf(order)}
                        className="flex-1 sm:flex-initial bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2 px-3 rounded-xl transition text-xs flex items-center justify-center gap-1.5 shadow-2xs"
                        title="PDF"
                      >
                        <i className="ph-bold ph-printer text-sm text-rose-500"></i>
                        <span>PDF</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3.5 sm:p-4 border-t border-slate-200 bg-white flex items-center justify-between text-xs">
          <span className="text-slate-500 font-semibold flex items-center gap-1.5">
            <i className="ph-bold ph-info text-blue-600 text-sm"></i>
            <span>
              {activeTab === "new"
                ? (lang === "en" ? "Items in pending orders disappear upon receipt and move to archive." : "الطلبات الجديدة تختفي فور تأكيد استلامها وتنتقل تلقائياً للأرشيف مع زيادة المخزون.")
                : (lang === "en" ? "Archive maintains complete receipt records." : "الأرشيف يحتفظ بجميع الطلبات المستلمة السابقة وتواريخها.")}
            </span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition text-xs"
          >
            {t("cancel")}
          </button>
        </div>
      </div>

      {/* Goods Receiving Modal for specific pending order */}
      {receivingOrder && receivingOrder.details.items && (
        <GoodsReceivingModal
          isOpen={!!receivingOrder}
          onClose={() => setReceivingOrder(null)}
          submissionId={receivingOrder.id}
          orderTitle={receivingOrder.title}
          orderItems={receivingOrder.details.items.map((item) => ({
            code: item.code,
            nameAr: item.nameAr,
            nameEn: item.nameEn,
            orderQty: item.qty ?? 1,
            unitLabel: item.unit,
          }))}
          onSuccess={(res) => {
            setReceivingOrder(null);
            loadSubmissions();
            onOrderReceived?.(res);
          }}
        />
      )}
    </div>
  );
}
