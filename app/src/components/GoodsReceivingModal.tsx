import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useLanguage } from "@/providers/LanguageContext";
import { useAuth } from "@/providers/AuthContext";

export interface ReceivingItem {
  productId?: number;
  productCode: string;
  nameAr: string;
  nameEn?: string;
  orderedQty: number;
  receivedQty: number;
  unit: string;
  status: "received_full" | "received_partial" | "not_received";
  notes?: string;
}

export interface GoodsReceivingModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderItems: Array<{
    id?: number;
    code: string;
    nameAr: string;
    nameEn?: string;
    orderQty: number;
    unitLabel?: string;
    unitCode?: string;
  }>;
  submissionId?: string;
  orderTitle?: string;
  onSuccess?: (data?: any) => void;
}

export function GoodsReceivingModal({
  isOpen,
  onClose,
  orderItems,
  submissionId,
  orderTitle: _orderTitle,
  onSuccess,
}: GoodsReceivingModalProps) {
  const { lang, t, getBranchName, getEmployeeName } = useLanguage();
  const { session, selectedBranch, branchesList, markSubmissionReceived } = useAuth();
  const utils = trpc.useUtils();

  // Initialize receiving items from order
  const [items, setItems] = useState<ReceivingItem[]>(() =>
    orderItems.map((item) => ({
      productId: item.id,
      productCode: item.code,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      orderedQty: item.orderQty,
      receivedQty: item.orderQty, // Default to full receipt
      unit: item.unitLabel || item.unitCode || (lang === "en" ? "PCS" : "حبة"),
      status: "received_full",
      notes: "",
    }))
  );

  const receiveMut = trpc.inventory.receiveOrder.useMutation({
    onSuccess: (data) => {
      utils.inventory.list.invalidate();
      utils.inventory.stockLogs.invalidate();
      onSuccess?.(data);
      onClose();
    },
  });

  if (!isOpen) return null;

  // Counters
  const totalOrdered = items.length;
  const fullyReceivedCount = items.filter((i) => i.status === "received_full").length;
  const notReceivedCount = items.filter((i) => i.status === "not_received").length;

  // Actions per item
  const markFull = (index: number) => {
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              receivedQty: item.orderedQty,
              status: "received_full",
            }
          : item
      )
    );
  };

  const markNotReceived = (index: number) => {
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              receivedQty: 0,
              status: "not_received",
            }
          : item
      )
    );
  };

  const setCustomQty = (index: number, val: number) => {
    const cleanVal = isNaN(val) ? 0 : Math.max(0, val);
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        let status: "received_full" | "received_partial" | "not_received" = "received_partial";
        if (cleanVal === 0) status = "not_received";
        else if (cleanVal >= item.orderedQty) status = "received_full";
        return {
          ...item,
          receivedQty: cleanVal,
          status,
        };
      })
    );
  };

  const updateItemNote = (index: number, note: string) => {
    setItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, notes: note } : item))
    );
  };

  // Batch actions
  const markAllFull = () => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        receivedQty: item.orderedQty,
        status: "received_full",
      }))
    );
  };

  const markAllNotReceived = () => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        receivedQty: 0,
        status: "not_received",
      }))
    );
  };

  const handleConfirmIntake = async () => {
    if (items.length === 0) return;

    const receiverName = session?.full_name || (session?.employee_id ? `موظف #${session.employee_id}` : "موظف الاستلام");
    await receiveMut.mutateAsync({
      branchCode: selectedBranch || session?.branch_code || "1011125",
      receivedBy: receiverName,
      submissionId,
      items: items.map((i) => ({
        productId: i.productId,
        productCode: i.productCode,
        orderedQty: i.orderedQty,
        receivedQty: i.receivedQty,
        unit: i.unit,
        status: i.status,
        notes: i.notes || null,
      })),
    });

    if (submissionId) {
      await markSubmissionReceived(submissionId, {
        receivedBy: receiverName,
        receivedAt: new Date().toISOString(),
        receivedItems: items,
      });
    }
  };

  const branchObj = branchesList.find((b) => b.branch_code === selectedBranch);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-800"
        dir={lang === "ar" ? "rtl" : "ltr"}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 flex items-center justify-center text-xl shrink-0 shadow-inner">
              <i className="ph-bold ph-tray-arrow-down"></i>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black truncate">
                  {lang === "en" ? "Goods Receipt & Intake Confirmation" : "استلام المنتجات وتوريد المخزون الفعلي"}
                </h3>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-md">
                  {lang === "en" ? "Stock Inflow" : "إضافة للمخزون"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-semibold truncate mt-0.5">
                {branchObj ? getBranchName(branchObj.branch_code, branchObj.branch_name) : `فرع ${selectedBranch}`} • {getEmployeeName(session?.full_name || "")}
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

        {/* Operational Status Dashboard & Quick Batch Controls */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 sm:p-4 space-y-2.5">
          {/* KPI 3-column Cards */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-white border border-slate-200 p-2 sm:p-2.5 rounded-xl text-center shadow-2xs">
              <span className="block text-[10px] sm:text-xs text-slate-500 font-bold truncate">
                {lang === "en" ? "Total Items" : "إجمالي الأصناف"}
              </span>
              <span className="font-mono text-slate-900 font-black text-sm sm:text-base">{totalOrdered}</span>
            </div>

            <div className="bg-emerald-50/80 border border-emerald-200 p-2 sm:p-2.5 rounded-xl text-center shadow-2xs">
              <span className="block text-[10px] sm:text-xs text-emerald-700 font-bold truncate">
                {lang === "en" ? "Received" : "تم الاستلام"}
              </span>
              <span className="font-mono text-emerald-800 font-black text-sm sm:text-base">{fullyReceivedCount}</span>
            </div>

            <div className="bg-rose-50/80 border border-rose-200 p-2 sm:p-2.5 rounded-xl text-center shadow-2xs">
              <span className="block text-[10px] sm:text-xs text-rose-700 font-bold truncate">
                {lang === "en" ? "Missing" : "لم يصل"}
              </span>
              <span className="font-mono text-rose-800 font-black text-sm sm:text-base">{notReceivedCount}</span>
            </div>
          </div>

          {/* Quick Batch Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={markAllFull}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98]"
              title={lang === "en" ? "Mark all items as fully arrived" : "تأكيد وصول جميع الأصناف بالكامل"}
            >
              <i className="ph-bold ph-check-circle text-sm"></i>
              <span>{lang === "en" ? "All Arrived" : "استلام الكل بالكامل"}</span>
            </button>

            <button
              type="button"
              onClick={markAllNotReceived}
              className="flex-1 bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-200 text-xs font-black py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs active:scale-[0.98]"
              title={lang === "en" ? "Mark all items as not arrived" : "تحديد الكل كـ لم يصل"}
            >
              <i className="ph-bold ph-x-circle text-sm"></i>
              <span>{lang === "en" ? "None Arrived" : "لم يصل شيء"}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Items Cards List */}
        <div className="p-3 sm:p-5 overflow-y-auto flex-1 space-y-3 bg-slate-100/60">
          {items.length === 0 ? (
            <div className="py-16 text-center text-slate-400 font-bold bg-white rounded-2xl border border-slate-200">
              <i className="ph-bold ph-tray text-4xl text-slate-300 mb-2 block"></i>
              {lang === "en" ? "No items in this order to receive." : "لا توجد مواد في هذه الطلبية للاستلام."}
            </div>
          ) : (
            items.map((item, idx) => {
              const isNotReceived = item.status === "not_received";
              const isFull = item.status === "received_full";
              const isPartial = item.status === "received_partial";

              return (
                <div
                  key={idx}
                  className={`border rounded-2xl p-3 sm:p-4 transition-all space-y-2.5 ${
                    isNotReceived
                      ? "bg-rose-50/60 border-rose-300/80 shadow-2xs"
                      : isFull
                      ? "bg-white border-emerald-200 hover:border-emerald-300 shadow-2xs"
                      : "bg-amber-50/60 border-amber-300/80 shadow-2xs"
                  }`}
                >
                  {/* Item Header: Code, Unit, Status Badge */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-black text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
                        #{item.productCode}
                      </span>
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg">
                        {item.unit}
                      </span>
                    </div>

                    {/* Status Badges */}
                    {isNotReceived ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300 px-2.5 py-0.5 rounded-full">
                        <i className="ph-bold ph-x-circle text-xs"></i>
                        {lang === "en" ? "Not Received" : "لم يتم الاستلام"}
                      </span>
                    ) : isFull ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                        <i className="ph-bold ph-check-circle text-xs"></i>
                        {lang === "en" ? "Fully Received" : "تم الاستلام بالكامل"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full">
                        <i className="ph-bold ph-warning-circle text-xs"></i>
                        {lang === "en" ? "Partial Receipt" : "استلام جزئي"}
                      </span>
                    )}
                  </div>

                  {/* Product Title */}
                  <div>
                    <h4 className="text-sm sm:text-base font-black text-slate-900 leading-snug">
                      {lang === "en" ? item.nameEn || item.nameAr : item.nameAr}
                    </h4>
                    {(item.nameEn && item.nameAr) && (
                      <p className="text-[11px] text-slate-400 font-sans mt-0.5" dir="ltr">
                        {lang === "en" ? item.nameAr : item.nameEn}
                      </p>
                    )}
                  </div>

                  {/* Interactive Control Row */}
                  <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-2 sm:p-2.5 flex items-center justify-between gap-2 flex-wrap">
                    {/* Quantities: Ordered & Received */}
                    <div className="flex items-center gap-2">
                      <div className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-center shadow-2xs">
                        <span className="block text-[9px] text-slate-400 font-bold uppercase">
                          {lang === "en" ? "Ordered" : "المطلوب"}
                        </span>
                        <span className="text-xs sm:text-sm font-black font-mono text-slate-700">
                          {item.orderedQty}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <div className="bg-white border border-emerald-300 px-2 py-1 rounded-lg flex items-center gap-1.5 shadow-2xs">
                          <span className="text-[10px] text-emerald-800 font-black">
                            {lang === "en" ? "Arrived:" : "الواصل:"}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCustomQty(idx, Math.max(0, item.receivedQty - 1))}
                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded font-black text-xs flex items-center justify-center text-slate-700 active:scale-95"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={0}
                            value={item.receivedQty}
                            onChange={(e) => setCustomQty(idx, parseInt(e.target.value, 10))}
                            className="w-12 text-center font-mono font-black text-xs sm:text-sm text-emerald-950 bg-transparent outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setCustomQty(idx, item.receivedQty + 1)}
                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded font-black text-xs flex items-center justify-center text-slate-700 active:scale-95"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Quick Action Toggle Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => markFull(idx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1 active:scale-95 ${
                          isFull
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300"
                        }`}
                        title={lang === "en" ? "Full Delivery" : "تأكيد وصول الكمية كاملة"}
                      >
                        <i className="ph-bold ph-check text-xs"></i>
                        <span>{lang === "en" ? "Full" : "وصل"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => markNotReceived(idx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1 active:scale-95 ${
                          isNotReceived
                            ? "bg-rose-600 text-white shadow-sm"
                            : "bg-white hover:bg-rose-50 text-rose-700 border border-rose-300"
                        }`}
                        title={lang === "en" ? "Mark as Not Arrived" : "تأكيد عدم وصول المنتج"}
                      >
                        <i className="ph-bold ph-x text-xs"></i>
                        <span>{lang === "en" ? "Missing" : "لم يصل"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Notes / Reason Field for Unreceived or Partial Items */}
                  {(isNotReceived || isPartial) && (
                    <div className="pt-1 flex items-center gap-2">
                      <i className="ph-bold ph-chat-text text-slate-400 text-sm shrink-0"></i>
                      <input
                        type="text"
                        value={item.notes || ""}
                        onChange={(e) => updateItemNote(idx, e.target.value)}
                        placeholder={
                          isNotReceived
                            ? (lang === "en" ? "Reason not arrived..." : "سبب عدم الاستلام (مثال: غير متوفر بالمستودع، تالف...)")
                            : (lang === "en" ? "Reason for partial..." : "سبب النقص في الكمية المستلمة...")
                        }
                        className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-amber-400"
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 sm:p-4 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="text-[11px] text-slate-500 font-semibold flex items-center gap-1.5 text-center sm:text-right">
            <i className="ph-bold ph-info text-emerald-600 text-sm shrink-0"></i>
            <span>
              {lang === "en"
                ? "Received items will be automatically added to your live branch stock."
                : "تأكيد الاستلام سيقوم بتوريد الكميات فوراً وتحديث رصيد المخزون الفعلي."}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={receiveMut.isPending}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold transition text-xs"
            >
              {t("cancel")}
            </button>

            <button
              type="button"
              onClick={handleConfirmIntake}
              disabled={receiveMut.isPending || items.length === 0}
              className="flex-[2] sm:flex-initial px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black transition shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 text-xs sm:text-sm disabled:opacity-50 active:scale-[0.98]"
            >
              <i className="ph-bold ph-check-circle text-base"></i>
              <span>
                {receiveMut.isPending
                  ? (lang === "en" ? "Adding to Stock..." : "جاري إضافة الكميات للمخزون...")
                  : (lang === "en" ? "Confirm & Intake Stock 📥" : "تأكيد الاستلام وتوريد المخزون 📥")}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
