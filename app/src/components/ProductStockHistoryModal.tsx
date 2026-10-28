import { useMemo } from "react";
import type { Product, StockLog } from "@db/schema";
import { useLanguage } from "@/providers/LanguageContext";
import { trpc } from "@/providers/trpc";
import { getProductImage, getCategoryFallbackImage } from "@/lib/productImages";

export interface ProductStockHistoryModalProps {
  product: Product;
  branchCode?: string;
  onClose: () => void;
}

export function formatStockDateDetails(isoString: string, lang: "ar" | "en" = "ar") {
  try {
    const d = new Date(isoString);
    const dayName = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-US", {
      weekday: "long",
    }).format(d);

    const time = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(d);

    const fullDate = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);

    return { dayName, time, fullDate, raw: d };
  } catch {
    return { dayName: "", time: isoString, fullDate: isoString, raw: new Date() };
  }
}

export function ProductStockHistoryModal({
  product,
  branchCode: _branchCode,
  onClose,
}: ProductStockHistoryModalProps) {
  const { lang, getProductName, getUnitName, getCategoryName, getBranchName, getEmployeeName } = useLanguage();
  const logsQuery = trpc.inventory.stockLogs.useQuery({ productId: product.id });

  const logs = logsQuery.data ?? [];
  const latestLog: StockLog | null = (logs.length > 0 ? logs[0] : null) ?? (product.lastStockUpdate ?? null);

  const productName = getProductName(product);
  const secondaryName = lang === "en" ? product.nameAr : product.nameEn;
  const unitLabel = getUnitName(product.unitCode, product.unitLabel);

  const latestDetails = useMemo(() => {
    if (!latestLog) return null;
    return formatStockDateDetails(latestLog.timestamp, lang as "ar" | "en");
  }, [latestLog, lang]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      dir={lang === "ar" ? "rtl" : "ltr"}
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl overflow-hidden border border-slate-700 bg-slate-800 shrink-0 shadow-md">
              <img
                src={product.imageUrl || getProductImage(product)}
                alt={productName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = getCategoryFallbackImage(product.category);
                }}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-bold">
                  #{product.code}
                </span>
                <span className="text-xs font-bold text-slate-400">
                  {getCategoryName(product.category)}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black mt-0.5 text-slate-100">{productName}</h3>
              {secondaryName && <p className="text-xs text-slate-400">{secondaryName}</p>}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <i className="ph-bold ph-x text-lg"></i>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* Main Hero Card: Latest Update Details */}
          <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <i className="ph-bold ph-lightning text-amber-500 text-base"></i>
                {lang === "ar" ? "تفاصيل آخر تحديث للمخزون" : "Latest Stock Update Details"}
              </span>
              <span className="text-xs font-mono font-bold bg-white border border-slate-200 px-2.5 py-1 rounded-xl text-slate-700">
                {unitLabel}
              </span>
            </div>

            {latestLog && latestDetails ? (
              <div className="space-y-4">
                {/* Addition / Reduction Banner */}
                <div
                  className={`rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border ${
                    latestLog.changeType === "increase"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                      : "bg-red-50 border-red-200 text-red-950"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${
                        latestLog.changeType === "increase"
                          ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30"
                          : "bg-red-500 text-white shadow-md shadow-red-500/30"
                      }`}
                    >
                      <i className={`ph-bold ${latestLog.changeType === "increase" ? "ph-trend-up" : "ph-trend-down"}`}></i>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                            latestLog.changeType === "increase"
                              ? "bg-emerald-200/80 text-emerald-900"
                              : "bg-red-200/80 text-red-900"
                          }`}
                        >
                          {latestLog.changeType === "increase"
                            ? (lang === "ar" ? "🟢 إضافة كمية في المخزون" : "🟢 Stock Added")
                            : (lang === "ar" ? "🔴 نقص / صرف كمية من المخزون" : "🔴 Stock Reduced")}
                        </span>
                      </div>
                      <h4 className="text-base font-black mt-1">
                        {latestLog.changeType === "increase"
                          ? (lang === "ar" ? `تمت إضافة +${latestLog.delta} ${unitLabel}` : `Added +${latestLog.delta} ${unitLabel}`)
                          : (lang === "ar" ? `تم نقص ${latestLog.delta} ${unitLabel}` : `Reduced ${latestLog.delta} ${unitLabel}`)}
                      </h4>
                    </div>
                  </div>

                  {/* Previous -> New */}
                  <div className="flex items-center gap-2 self-end sm:self-center bg-white/90 border border-black/10 px-3 py-2 rounded-2xl shadow-sm text-xs font-mono">
                    <div className="text-center">
                      <span className="text-[10px] text-slate-400 block">{lang === "ar" ? "السابق" : "Prev"}</span>
                      <strong className="text-slate-600 font-black">{latestLog.prevQty ?? 0}</strong>
                    </div>
                    <i className={`ph-bold ${lang === "ar" ? "ph-arrow-left" : "ph-arrow-right"} text-slate-400 text-sm`}></i>
                    <div className="text-center">
                      <span className="text-[10px] text-slate-400 block">{lang === "ar" ? "الحالي" : "Now"}</span>
                      <strong className="text-slate-950 font-black text-sm">{latestLog.newQty ?? 0}</strong>
                    </div>
                  </div>
                </div>

                {/* Exact Date, Day, Hour, Minute Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="bg-white border border-slate-200 p-3 rounded-2xl">
                    <span className="text-slate-400 block text-[11px] mb-0.5">
                      <i className="ph-bold ph-calendar text-blue-600"></i> {lang === "ar" ? "اليوم" : "Day"}
                    </span>
                    <strong className="text-slate-800 text-sm font-black">{latestDetails.dayName}</strong>
                  </div>

                  <div className="bg-white border border-slate-200 p-3 rounded-2xl">
                    <span className="text-slate-400 block text-[11px] mb-0.5">
                      <i className="ph-bold ph-clock text-purple-600"></i> {lang === "ar" ? "الساعة والدقيقة" : "Time"}
                    </span>
                    <strong className="text-slate-800 text-sm font-black font-mono">{latestDetails.time}</strong>
                  </div>

                  <div className="bg-white border border-slate-200 p-3 rounded-2xl">
                    <span className="text-slate-400 block text-[11px] mb-0.5">
                      <i className="ph-bold ph-calendar-check text-emerald-600"></i> {lang === "ar" ? "التاريخ الكامل" : "Date"}
                    </span>
                    <strong className="text-slate-800 text-xs font-extrabold">{latestDetails.fullDate}</strong>
                  </div>

                  <div className="bg-white border border-slate-200 p-3 rounded-2xl">
                    <span className="text-slate-400 block text-[11px] mb-0.5">
                      <i className="ph-bold ph-user text-amber-600"></i> {lang === "ar" ? "القائم بالتحديث" : "Updated By"}
                    </span>
                    <strong className="text-slate-800 text-xs font-extrabold truncate block">
                      {getEmployeeName(latestLog.updatedBy)}
                    </strong>
                  </div>
                </div>

                {latestLog.branchCode && (
                  <p className="text-[11px] text-slate-500 font-bold flex items-center gap-1.5 px-1">
                    <i className="ph-bold ph-storefront text-slate-400"></i>
                    <span>{lang === "ar" ? "الفرع المسجل:" : "Branch:"}</span>
                    <span className="text-slate-800">
                      [{latestLog.branchCode}] {getBranchName(latestLog.branchCode)}
                    </span>
                  </p>
                )}
              </div>
            ) : (
              <div className="py-8 text-center bg-white border border-dashed border-slate-200 rounded-2xl text-slate-400">
                <i className="ph-bold ph-info text-3xl mb-1 text-slate-300"></i>
                <p className="font-bold text-xs text-slate-600">
                  {lang === "ar"
                    ? "الرصيد الافتتاحي - لم تُسجل حركات إضافة أو خصم جديدة بعد"
                    : "Opening Stock - No recent additions or deductions recorded yet"}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {lang === "ar"
                    ? `الرصيد الحالي بالمستودع: ${product.qty ?? 0} ${unitLabel}`
                    : `Current stock: ${product.qty ?? 0} ${unitLabel}`}
                </p>
              </div>
            )}
          </div>

          {/* Chronological History Log */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
              <i className="ph-bold ph-list-dashes text-base"></i>
              {lang === "ar" ? "سجل الحركات السابقة لهذا الصنف" : "Stock Change History"} ({logs.length})
            </h4>

            {logs.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs bg-slate-50 border border-slate-200 rounded-2xl font-medium">
                {lang === "ar"
                  ? "لا توجد حركات سابقة مسجلة لهذا الصنف حتى الآن"
                  : "No prior changes recorded for this item"}
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-xs text-right" dir={lang === "ar" ? "rtl" : "ltr"}>
                  <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">{lang === "ar" ? "اليوم والوقت" : "Day & Time"}</th>
                      <th className="p-3">{lang === "ar" ? "نوع الحركة" : "Type"}</th>
                      <th className="p-3">{lang === "ar" ? "الكمية" : "Qty Change"}</th>
                      <th className="p-3">{lang === "ar" ? "المسؤول" : "By"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-bold text-slate-800">
                    {logs.map((log, index) => {
                      const dt = formatStockDateDetails(log.timestamp, lang as "ar" | "en");
                      const isInc = log.changeType === "increase";
                      return (
                        <tr key={log.id || index} className="hover:bg-slate-50 transition">
                          <td className="p-3 text-slate-400 font-mono">{index + 1}</td>
                          <td className="p-3">
                            <div className="font-black text-slate-900">{dt.dayName} {dt.time}</div>
                            <div className="text-[10px] text-slate-400 font-normal">{dt.fullDate}</div>
                          </td>
                          <td className="p-3">
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                isInc ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                              }`}
                            >
                              {isInc ? (lang === "ar" ? "+ إضافة" : "+ Added") : (lang === "ar" ? "- نقص" : "- Reduced")}
                            </span>
                          </td>
                          <td className="p-3 font-mono">
                            <span className={isInc ? "text-emerald-600 font-black" : "text-red-600 font-black"}>
                              {isInc ? `+${log.delta}` : log.delta} {unitLabel}
                            </span>
                            <span className="text-[10px] text-slate-400 block font-normal">
                              ({log.prevQty ?? 0} ⬅️ {log.newQty ?? 0})
                            </span>
                          </td>
                          <td className="p-3 text-slate-700 text-[11px] font-extrabold">
                            {getEmployeeName(log.updatedBy)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">
            {lang === "ar" ? "تتبع دقيق لمنع نسيان أي إضافة أو نقص" : "Detailed tracking to prevent forgotten stock changes"}
          </span>
          <button
            onClick={onClose}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-2 rounded-xl transition text-xs"
          >
            {lang === "ar" ? "إغلاق" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
