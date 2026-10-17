import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth, type EmployeeRequest, type EmployeeRecord, type BranchRecord, type AdminSubmission } from "@/providers/AuthContext";
import { useLanguage } from "@/providers/LanguageContext";
import { trpc } from "@/providers/trpc";
import { generateAuditPdf } from "@/lib/auditPdfGenerator";
import { GoodsReceivingModal } from "@/components/GoodsReceivingModal";
import type { BranchTransfer } from "../../api/queries/products";

export interface AdminRequestsPanelProps {
  forcedTab?: "requests" | "submissions" | "employees" | "branches" | "transfers";
  hideTabsNav?: boolean;
  onCountsChange?: (counts: {
    pendingRequests: number;
    pendingSubmissions: number;
    employeesCount: number;
    branchesCount: number;
  }) => void;
}

export function AdminRequestsPanel({ forcedTab, hideTabsNav = false, onCountsChange }: AdminRequestsPanelProps = {}) {
  const navigate = useNavigate();
  const {
    fetchPendingRequests,
    fetchEmployeesList,
    fetchBranchesList,
    approveRequest,
    rejectRequest,
    toggleActive,
    transferEmployee,
    selectedBranch,
    setSelectedBranch,
    addBranch,
    updateBranch,
    deleteBranch,
    toggleBranchActive,
    fetchAdminSubmissions,
    markSubmissionStatus,
    deleteAdminSubmission,
  } = useAuth();
  const { lang, getBranchName, getEmployeeName } = useLanguage();

  const [requests, setRequests] = useState<EmployeeRequest[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<AdminSubmission | null>(null);
  const [receivingSubmission, setReceivingSubmission] = useState<AdminSubmission | null>(null);
  const [subFilter, setSubFilter] = useState<"ALL" | "cargo_order" | "audit">("ALL");

  const [activeTab, setActiveTab] = useState<"requests" | "submissions" | "employees" | "branches" | "transfers">("submissions");
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Inter-Branch Transfer State
  const transfersQuery = trpc.inventory.listTransfers.useQuery();
  const allTransfers = transfersQuery.data ?? [];
  const [transferMainTab, setTransferMainTab] = useState<"active" | "archive">("active");
  const [transferSearch, setTransferSearch] = useState<string>("");
  const [transferFilterStatus, setTransferFilterStatus] = useState<string>("ALL");
  const [transferFilterBranch, setTransferFilterBranch] = useState<string>("ALL");
  const [adminReviewingTransfer, setAdminReviewingTransfer] = useState<BranchTransfer | null>(null);
  const [adminApprovedQtys, setAdminApprovedQtys] = useState<Record<string, number>>({});
  const [adminReviewNotes, setAdminReviewNotes] = useState("");
  const [selectedTransferTimeline, setSelectedTransferTimeline] = useState<BranchTransfer | null>(null);

  const adminApproveMut = trpc.inventory.adminInitialApproveTransfer.useMutation({
    onSuccess: () => {
      transfersQuery.refetch();
      setAdminReviewingTransfer(null);
      notify(lang === "en" ? "Transfer approved and forwarded to source branch!" : "تمت الموافقة على التحويل وإحالته للفرع المرسل للتجهيز!");
    },
  });

  const adminFinalApproveMut = trpc.inventory.adminFinalApproveTransfer.useMutation({
    onSuccess: () => {
      transfersQuery.refetch();
      notify(lang === "en" ? "Shipment confirmed & in-transit!" : "تم تأكيد الشحن وترحيل الشحنة في الطريق للفرع المستلم!");
    },
  });

  const rejectTransferMut = trpc.inventory.rejectTransfer.useMutation({
    onSuccess: () => {
      transfersQuery.refetch();
      setAdminReviewingTransfer(null);
      notify(lang === "en" ? "Transfer rejected" : "تم رفض طلب التحويل");
    },
  });

  const closeTransferMut = trpc.inventory.closeOrArchiveTransfer.useMutation({
    onSuccess: () => {
      transfersQuery.refetch();
      notify(lang === "en" ? "Transfer closed and moved to archive successfully! 📁" : "تم إغلاق المعاملة ونقلها إلى سجل المعاملات السابقة والمؤرشفة بنجاح! 📁");
    },
    onError: () => {
      notify(lang === "en" ? "Failed to close transfer" : "تعذر إغلاق وأرشفة المعاملة");
    }
  });

  // Transfer Employee Modal State
  const [transferringEmployee, setTransferringEmployee] = useState<EmployeeRecord | null>(null);
  const [targetBranchCode, setTargetBranchCode] = useState<string>("");

  // Branch Details Modal State
  const [viewingBranch, setViewingBranch] = useState<BranchRecord | null>(null);

  // New Branch Form
  const [newBranchCode, setNewBranchCode] = useState("");
  const [newBranchName, setNewBranchName] = useState("");

  // Edit Branch Form State
  const [editingBranch, setEditingBranch] = useState<BranchRecord | null>(null);
  const [editBranchCode, setEditBranchCode] = useState("");
  const [editBranchName, setEditBranchName] = useState("");

  const loadData = async () => {
    setIsLoading(true);
    const reqData = await fetchPendingRequests();
    const empData = await fetchEmployeesList();
    const branchData = await fetchBranchesList();
    const subsData = await fetchAdminSubmissions();
    setRequests(reqData);
    setEmployees(empData);
    setBranches(branchData);
    setSubmissions(subsData);
    setIsLoading(false);

    onCountsChange?.({
      pendingRequests: reqData.filter((r) => r.status === "pending").length,
      pendingSubmissions: subsData.filter((s) => s.status === "pending").length,
      employeesCount: empData.length,
      branchesCount: branchData.length,
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleApprove = async (id: string, role = "staff") => {
    const res = await approveRequest(id, role);
    notify(res.message);
    loadData();
  };

  const handleReject = async (id: string) => {
    const reason = window.prompt(lang === "en" ? "Reason for rejection:" : "سبب الرفض (اختياري):") || "رفض من قبل الإدارة";
    const res = await rejectRequest(id, reason);
    notify(res.message);
    loadData();
  };

  const handleToggleActive = async (employeeId: string, currentActive: boolean) => {
    const res = await toggleActive(employeeId, !currentActive);
    notify(res.message);
    loadData();
  };

  const openTransferModal = (emp: EmployeeRecord) => {
    setTransferringEmployee(emp);
    setTargetBranchCode(emp.branch_code);
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferringEmployee || !targetBranchCode) return;
    const res = await transferEmployee(transferringEmployee.employee_id, targetBranchCode);
    notify(res.message);
    setTransferringEmployee(null);
    loadData();
  };

  const handleAddBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchCode.trim() || !newBranchName.trim()) {
      notify(lang === "en" ? "Please fill branch code and name" : "يرجى تعبئة رمز واسم الفرع");
      return;
    }
    const res = await addBranch(newBranchCode, newBranchName);
    notify(res.message);
    setNewBranchCode("");
    setNewBranchName("");
    loadData();
  };

  const openEditBranchModal = (b: BranchRecord) => {
    setEditingBranch(b);
    setEditBranchCode(b.branch_code);
    setEditBranchName(b.branch_name);
  };

  const handleUpdateBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch) return;
    if (!editBranchCode.trim() || !editBranchName.trim()) {
      notify(lang === "en" ? "Please fill branch code and name" : "يرجى إكمال بيانات الفرع");
      return;
    }

    const res = await updateBranch(editingBranch.branch_code, editBranchCode, editBranchName);
    notify(res.message);
    setEditingBranch(null);
    loadData();
  };

  const handleDeleteBranch = async (branchCode: string, branchName: string) => {
    const confirmMsg = lang === "en"
      ? `Are you sure you want to delete branch (${branchName})?`
      : `هل أنت تأكد من رغبتك في حذف فرع (${branchName} - ${branchCode}) نهائياً من النظام؟`;

    if (window.confirm(confirmMsg)) {
      const res = await deleteBranch(branchCode);
      notify(res.message);
      loadData();
    }
  };

  const handleToggleBranch = async (code: string, currentActive: boolean) => {
    const res = await toggleBranchActive(code, !currentActive);
    notify(res.message);
    loadData();
  };

  const handleToggleSubmissionStatus = async (id: string, currentStatus: "pending" | "reviewed") => {
    const nextStatus = currentStatus === "pending" ? "reviewed" : "pending";
    await markSubmissionStatus(id, nextStatus);
    notify(nextStatus === "reviewed" ? (lang === "en" ? "Marked as reviewed!" : "تم التحديد كـ تم الإطلاع!") : (lang === "en" ? "Marked as new" : "تمت الإعادة كـ جديد"));
    loadData();
  };

  const handleDeleteSubmission = async (id: string) => {
    if (window.confirm(lang === "en" ? "Delete this alert?" : "هل أنت تأكد من حذف هذا التنبيه؟")) {
      await deleteAdminSubmission(id);
      notify(lang === "en" ? "Alert deleted" : "تم حذف التنبيه");
      loadData();
    }
  };

  const tabToRender = forcedTab || activeTab;
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const pendingSubmissionsCount = submissions.filter((s) => s.status === "pending").length;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-4 md:p-6 shadow-sm mb-6" dir={lang === "ar" ? "rtl" : "ltr"}>
      
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm">
          {toast}
        </div>
      )}

      {/* Header & Tabs */}
      {!hideTabsNav ? (
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-violet-600 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-violet-600/30">
              <i className="ph-bold ph-buildings"></i>
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">
                {lang === "en" ? "Branches & Accounts Management" : "إدارة الفروع وطلبات الحسابات (الأدمن)"}
              </h2>
              <p className="text-xs text-slate-500 font-bold">
                {lang === "en"
                  ? "Enter any branch with full catalog & approve requests"
                  : "دخول أي فرع بعرض المنتجات بالعدد الكامل والموافقة على حسابات الفروع"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab("submissions")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === "submissions"
                  ? "bg-violet-600 text-white shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <i className="ph-bold ph-bell-ringing"></i>
              {lang === "en" ? "Orders & Audit Alerts" : "تنبيهات البضاعة والجرد"}
              {pendingSubmissionsCount > 0 ? (
                <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
                  {pendingSubmissionsCount}
                </span>
              ) : (
                <span className="bg-slate-200 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-black">
                  {submissions.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("requests")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === "requests"
                  ? "bg-violet-600 text-white shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <i className="ph-bold ph-clock"></i>
              {lang === "en" ? "Pending Requests" : "طلبات التسجيل المعلقة"}
              {pendingCount > 0 && (
                <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("employees")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === "employees"
                  ? "bg-violet-600 text-white shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <i className="ph-bold ph-users"></i>
              {lang === "en" ? "Active Employees" : "الموظفين المعتمدين"}
              <span className="bg-slate-200 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-black">
                {employees.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("branches")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === "branches"
                  ? "bg-violet-600 text-white shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <i className="ph-bold ph-storefront"></i>
              {lang === "en" ? "Branches & Catalog Entry" : "الفروع والمنتجات الكاملة"}
              <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black">
                {branches.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("transfers")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === "transfers"
                  ? "bg-violet-600 text-white shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <i className="ph-bold ph-arrows-left-right"></i>
              {lang === "en" ? "Inter-Branch Transfers" : "التحويلات بين الفروع"}
              {allTransfers.filter((t) => t.status === "pending_admin_initial" || t.status === "dispatched_by_source").length > 0 ? (
                <span className="bg-amber-500 text-slate-950 text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
                  {allTransfers.filter((t) => t.status === "pending_admin_initial" || t.status === "dispatched_by_source").length}
                </span>
              ) : (
                <span className="bg-slate-200 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-black">
                  {allTransfers.length}
                </span>
              )}
            </button>

            <button
              onClick={loadData}
              title={lang === "en" ? "Refresh" : "تحديث القائمة"}
              className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition"
            >
              <i className={`ph-bold ph-arrows-clockwise text-base ${isLoading ? "animate-spin" : ""}`}></i>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 mb-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
              <i className={`ph-bold text-lg ${
                tabToRender === "transfers" ? "ph-arrows-left-right" :
                tabToRender === "branches" ? "ph-storefront" :
                tabToRender === "employees" ? "ph-users" :
                tabToRender === "requests" ? "ph-clock" : "ph-bell-ringing"
              }`}></i>
            </div>
            <h2 className="text-base font-black text-slate-900">
              {tabToRender === "transfers" && (lang === "en" ? "Inter-Branch Transfers & Approvals" : "التحويلات بين الفروع والاعتمادات والأرشيف")}
              {tabToRender === "branches" && (lang === "en" ? "Branches Management" : "إدارة الفروع والتحكم")}
              {tabToRender === "employees" && (lang === "en" ? "Active Employees" : "قائمة الموظفين المعتمدين")}
              {tabToRender === "requests" && (lang === "en" ? "Pending Requests" : "طلبات انضمام الموظفين")}
              {tabToRender === "submissions" && (lang === "en" ? "Orders & Audit Alerts" : "تنبيهات البضاعة وتقارير الجرد")}
            </h2>
          </div>
          <button
            onClick={loadData}
            title={lang === "en" ? "Refresh" : "تحديث"}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold flex items-center gap-1.5 transition"
          >
            <i className={`ph-bold ph-arrows-clockwise ${isLoading ? "animate-spin" : ""}`}></i>
            <span>{lang === "ar" ? "تحديث" : "Refresh"}</span>
          </button>
        </div>
      )}

      {/* Tab: Submissions & Alerts */}
      {tabToRender === "submissions" && (
        <div className="space-y-4">
          {/* Sub-filter */}
          <div className="flex flex-wrap items-center justify-between bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-xs gap-2">
            <div className="flex items-center gap-1.5 font-bold flex-wrap">
              <span className="text-slate-500">{lang === "en" ? "Filter Alerts:" : "تصفية التنبيهات:"}</span>
              <button
                onClick={() => setSubFilter("ALL")}
                className={`px-3 py-1 rounded-xl transition ${
                  subFilter === "ALL" ? "bg-slate-900 text-white font-extrabold" : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                {lang === "en" ? "All Submissions" : "جميع التنبيهات"} ({submissions.length})
              </button>
              <button
                onClick={() => setSubFilter("cargo_order")}
                className={`px-3 py-1 rounded-xl transition ${
                  subFilter === "cargo_order" ? "bg-amber-600 text-white font-extrabold" : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                {lang === "en" ? "Cargo Orders" : "طلبات البضاعة"} (
                {submissions.filter((s) => s.type === "cargo_order").length})
              </button>
              <button
                onClick={() => setSubFilter("audit")}
                className={`px-3 py-1 rounded-xl transition ${
                  subFilter === "audit" ? "bg-blue-600 text-white font-extrabold" : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                {lang === "en" ? "Audit Reports" : "تقارير الجرد"} (
                {submissions.filter((s) => s.type === "audit").length})
              </button>
            </div>
            <span className="text-slate-400 font-mono text-[11px]">
              {lang === "en" ? "Auto-synced & Persisted" : "مزامنة ومحفوظة تلقائياً"}
            </span>
          </div>

          {/* List of Submissions */}
          {submissions.filter((s) => subFilter === "ALL" || s.type === subFilter).length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <i className="ph-bold ph-bell-slash text-4xl text-slate-300 mb-2"></i>
              <p>{lang === "en" ? "No order or audit alerts received yet" : "لا توجد تنبيهات طلبات بضاعة أو جرد مُرسلة حالياً"}</p>
            </div>
          ) : (
            <div className="grid gap-3.5 md:grid-cols-2">
              {submissions
                .filter((s) => subFilter === "ALL" || s.type === subFilter)
                .map((sub) => {
                  const empDisplay = getEmployeeName(sub.employee_name);
                  const branchDisplay = getBranchName(sub.branch_code, sub.branch_name);
                  const isNew = sub.status === "pending";

                  return (
                    <div
                      key={sub.id}
                      className={`border rounded-2xl p-4 transition relative flex flex-col justify-between ${
                        isNew
                          ? "border-amber-400 bg-amber-50/40 shadow-sm ring-1 ring-amber-400/30"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div>
                        {/* Header Badges */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span
                            className={`text-xs font-black px-2.5 py-1 rounded-xl flex items-center gap-1.5 ${
                              sub.type === "cargo_order"
                                ? "bg-amber-100 text-amber-950 border border-amber-200"
                                : "bg-blue-100 text-blue-950 border border-blue-200"
                            }`}
                          >
                            <i className={`ph-bold ${sub.type === "cargo_order" ? "ph-package" : "ph-clipboard-text"}`}></i>
                            {sub.type === "cargo_order"
                              ? lang === "en"
                                ? "Cargo Order"
                                : "طلب بضاعة مستودع"
                              : lang === "en"
                              ? "Operational Audit"
                              : "جرد تشغيلي"}
                          </span>

                          <span
                            className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
                              isNew
                                ? "bg-red-500 text-white shadow-sm animate-pulse"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {isNew ? (lang === "en" ? "NEW / Unread" : "جديد / لم يُقرأ 🔴") : (lang === "en" ? "Reviewed" : "تم الإطلاع 🟢")}
                          </span>
                        </div>

                        {/* Title & Info */}
                        <h4 className="font-black text-sm text-slate-900 mb-1">{sub.title}</h4>
                        
                        <div className="space-y-1 text-xs text-slate-600 font-bold mb-3 bg-white/70 p-2.5 rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">{lang === "en" ? "Employee:" : "الموظف القائم:"}</span>
                            <span className="text-slate-900 font-extrabold">{empDisplay} <span className="text-slate-500 font-mono">#{sub.employee_id}</span></span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">{lang === "en" ? "Branch:" : "الفرع:"}</span>
                            <span className="text-violet-700 font-extrabold">[{sub.branch_code}] {branchDisplay}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">{lang === "en" ? "Date:" : "التاريخ والوقت:"}</span>
                            <span className="text-slate-500 font-mono text-[11px]">
                              {new Date(sub.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
                            </span>
                          </div>
                        </div>

                        {/* Details summary */}
                        <div className="flex items-center gap-2 text-xs mb-3">
                          <span className="bg-violet-50 text-violet-800 font-black px-2.5 py-1 rounded-lg border border-violet-200">
                            {lang === "en" ? `Items: ${sub.details.item_count || sub.details.items?.length || 0}` : `عدد المواد: ${sub.details.item_count || sub.details.items?.length || 0} منتج`}
                          </span>
                          {sub.details.notes && (
                            <span className="bg-slate-100 text-slate-600 font-medium px-2 py-1 rounded-lg truncate max-w-[180px]">
                              {sub.details.notes}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between gap-2">
                        <button
                          onClick={() => setSelectedSubmission(sub)}
                          className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-extrabold py-2 px-3 rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <i className="ph-bold ph-eye"></i>
                          {lang === "en" ? "View Full Details" : "معاينة التفاصيل"}
                        </button>

                        <button
                          onClick={() => handleToggleSubmissionStatus(sub.id, sub.status)}
                          title={isNew ? (lang === "en" ? "Mark Reviewed" : "تحديد كـ تم الإطلاع") : (lang === "en" ? "Mark New" : "إعادة كـ جديد")}
                          className={`p-2 rounded-xl text-xs font-bold transition border ${
                            isNew
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                          }`}
                        >
                          <i className={`ph-bold ${isNew ? "ph-check-circle" : "ph-arrow-counter-clockwise"}`}></i>
                        </button>

                        <button
                          onClick={() => handleDeleteSubmission(sub.id)}
                          title={lang === "en" ? "Delete Alert" : "حذف التنبيه"}
                          className="p-2 text-red-600 hover:bg-red-50 transition rounded-xl text-xs border border-red-200"
                        >
                          <i className="ph-bold ph-trash"></i>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Tab 1: Pending Requests */}
      {tabToRender === "requests" && (
        <div>
          {requests.filter((r) => r.status === "pending").length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <i className="ph-bold ph-check-circle text-4xl text-emerald-500 mb-2"></i>
              <p>{lang === "en" ? "No pending employee requests!" : "لا توجد طلبات تسجيل معلقة حالياً"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className={`w-full ${lang === "ar" ? "text-right" : "text-left"} text-xs`}>
                <thead className="bg-slate-100 text-slate-600 font-black">
                  <tr>
                    <th className="p-3.5">{lang === "en" ? "Employee Name" : "اسم الموظف"}</th>
                    <th className="p-3.5">{lang === "en" ? "Employee ID" : "الرقم الوظيفي"}</th>
                    <th className="p-3.5">{lang === "en" ? "Branch Code" : "رقم الفرع"}</th>
                    <th className="p-3.5">{lang === "en" ? "Request Date" : "تاريخ الطلب"}</th>
                    <th className={`p-3.5 ${lang === "ar" ? "text-left" : "text-right"}`}>{lang === "en" ? "Approval Actions (Admin)" : "إجراءات الموافقة (الأدمن)"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold text-slate-800">
                  {requests.filter((r) => r.status === "pending").map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50 transition">
                      <td className="p-3.5 font-black text-slate-900">{getEmployeeName(req.full_name)}</td>
                      <td className="p-3.5 font-mono text-slate-700">#{req.employee_id}</td>
                      <td className="p-3.5"><span className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded font-mono font-bold">{req.branch_code}</span></td>
                      <td className="p-3.5 text-slate-400 font-normal">{new Date(req.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</td>
                      <td className={`p-3.5 ${lang === "ar" ? "text-left" : "text-right"} space-x-2`}>
                        <button
                          onClick={() => handleApprove(req.id, "staff")}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold shadow-sm transition"
                        >
                          <i className={`ph-bold ph-check ${lang === "ar" ? "ml-1" : "mr-1"}`}></i>
                          {lang === "en" ? "Approve & Activate" : "موافقة وتفعيل"}
                        </button>
                        <button
                          onClick={() => handleReject(req.id)}
                          className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg font-bold transition"
                        >
                          <i className={`ph-bold ph-x ${lang === "ar" ? "ml-1" : "mr-1"}`}></i>
                          {lang === "en" ? "Reject Request" : "رفض الطلب"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Active Approved Employees */}
      {tabToRender === "employees" && (
        <div>
          {employees.length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <p>{lang === "en" ? "No active employees found" : "لا يوجد موظفون معتمدون في النظام"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className={`w-full ${lang === "ar" ? "text-right" : "text-left"} text-xs`}>
                <thead className="bg-slate-100 text-slate-600 font-black">
                  <tr>
                    <th className="p-3.5">{lang === "en" ? "Employee Name" : "اسم الموظف"}</th>
                    <th className="p-3.5">{lang === "en" ? "Employee ID" : "الرقم الوظيفي"}</th>
                    <th className="p-3.5">{lang === "en" ? "Branch" : "الفرع"}</th>
                    <th className="p-3.5">{lang === "en" ? "Role" : "الدور (Role)"}</th>
                    <th className="p-3.5">{lang === "en" ? "Account Status" : "حالة الحساب"}</th>
                    <th className={`p-3.5 ${lang === "ar" ? "text-left" : "text-right"}`}>{lang === "en" ? "Account Control" : "التحكم بالحساب"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold text-slate-800">
                  {employees.map((emp) => (
                    <tr key={emp.id || emp.employee_id} className="hover:bg-slate-50 transition">
                      <td className="p-3.5 font-black text-slate-900">{getEmployeeName(emp.full_name)}</td>
                      <td className="p-3.5 font-mono text-slate-700">#{emp.employee_id}</td>
                      <td className="p-3.5"><span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-mono">{emp.branch_code}</span></td>
                      <td className="p-3.5"><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold uppercase">{emp.role}</span></td>
                      <td className="p-3.5">
                        {emp.is_active ? (
                          <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold">
                            {lang === "en" ? "Active" : "نشط"}
                          </span>
                        ) : (
                          <span className="bg-red-100 text-red-800 px-2.5 py-0.5 rounded-full font-bold">
                            {lang === "en" ? "Inactive" : "معطل"}
                          </span>
                        )}
                      </td>
                      <td className={`p-3.5 ${lang === "ar" ? "text-left" : "text-right"} flex items-center justify-end gap-2`}>
                        <button
                          onClick={() => openTransferModal(emp)}
                          title={lang === "en" ? "Transfer employee to another branch" : "نقل الموظف إلى فرع آخر"}
                          className="bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 px-3 py-1.5 rounded-lg font-bold transition text-xs flex items-center gap-1"
                        >
                          <i className="ph-bold ph-arrows-left-right text-violet-600"></i>
                          {lang === "en" ? "Transfer Branch" : "نقل الفرع"}
                        </button>
                        <button
                          onClick={() => handleToggleActive(emp.employee_id, emp.is_active)}
                          className={`px-3 py-1.5 rounded-lg font-bold transition text-xs ${
                            emp.is_active
                              ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                              : "bg-emerald-600 text-white hover:bg-emerald-700"
                          }`}
                        >
                          {emp.is_active ? (lang === "en" ? "Disable Account" : "تعطيل الحساب") : (lang === "en" ? "Activate Account" : "تفعيل الحساب")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Branches & Full Catalog Control */}
      {tabToRender === "branches" && (
        <div className="space-y-6">
          
          {/* Form to Add New Branch */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 md:p-5">
            <h3 className="text-xs font-black text-slate-700 uppercase mb-3 flex items-center gap-2">
              <i className="ph-bold ph-plus-circle text-violet-600 text-base"></i>
              {lang === "en" ? "Add New Branch" : "إضافة فرع جديد للنظام"}
            </h3>
            <form onSubmit={handleAddBranchSubmit} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                required
                maxLength={7}
                value={newBranchCode}
                onChange={(e) => setNewBranchCode(e.target.value.replace(/\D/g, ""))}
                placeholder={lang === "en" ? "Branch Code (7 digits - e.g. 1010004)" : "رقم الفرع (من 7 أرقام - مثال: 1010004)"}
                className="bg-white border border-slate-300 rounded-xl px-4 py-2 text-xs font-bold font-mono tracking-wider outline-none focus:border-violet-600 flex-1"
              />
              <input
                type="text"
                required
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder={lang === "en" ? "Branch Name (e.g. Al Khobar Branch)" : "اسم الفرع (مثال: فرع الخبر - الكورنيش)"}
                className="bg-white border border-slate-300 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:border-violet-600 flex-[2]"
              />
              <button
                type="submit"
                className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-extrabold px-5 py-2.5 rounded-xl transition shadow-md flex items-center justify-center gap-1.5"
              >
                <i className="ph-bold ph-check"></i>
                {lang === "en" ? "Add Branch" : "إضافة الفرع"}
              </button>
            </form>
          </div>

          {/* List of Branches */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {branches.map((b) => {
              const isSelected = selectedBranch === b.branch_code;
              const bName = getBranchName(b.branch_code, b.branch_name);
              return (
                <div
                  key={b.branch_code}
                  className={`border rounded-2xl p-4 transition relative flex flex-col justify-between ${
                    isSelected
                      ? "border-violet-500 bg-violet-50/50 shadow-md ring-2 ring-violet-500/20"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="bg-slate-900 text-white font-mono text-xs px-2.5 py-1 rounded-lg font-bold">
                        {b.branch_code}
                      </span>
                      {b.is_active ? (
                        <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                          {lang === "en" ? "Active" : "نشط"}
                        </span>
                      ) : (
                        <span className="bg-red-100 text-red-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                          {lang === "en" ? "Inactive" : "معطل"}
                        </span>
                      )}
                    </div>
                    <h4 className="font-black text-sm text-slate-800 mb-1">{bName}</h4>
                    <p className="text-xs text-slate-500 font-bold mb-3 flex items-center gap-1">
                      <i className="ph-bold ph-package text-emerald-600"></i>
                      {lang === "en" ? "Branch Products:" : "منتجات الفرع:"}{" "}
                      <span className="text-slate-900 font-extrabold">
                        {lang === "en" ? "256 items (Full Count)" : "256 منتج (عدد كامل)"}
                      </span>
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-200/80 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => {
                          setSelectedBranch(b.branch_code);
                          navigate("/");
                        }}
                        className={`flex-1 py-2 px-3 rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                            : "bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
                        }`}
                        title={lang === "en" ? "Enter Branch & Inventory" : "دخول الفرع وشاشة الجرد"}
                      >
                        <i className="ph-bold ph-sign-in"></i>
                        {isSelected
                          ? (lang === "en" ? "Enter Current Branch" : "دخول الفرع الحالي")
                          : (lang === "en" ? "Enter Branch" : "دخول الفرع")}
                      </button>

                      <button
                        onClick={() => openEditBranchModal(b)}
                        title={lang === "en" ? "Edit Branch" : "تعديل اسم أو رقم الفرع"}
                        className="p-2 text-violet-600 hover:bg-violet-50 transition rounded-lg text-sm border border-violet-200"
                      >
                        <i className="ph-bold ph-pencil-simple"></i>
                      </button>

                      <button
                        onClick={() => handleToggleBranch(b.branch_code, b.is_active)}
                        title={lang === "en" ? "Enable/Disable Branch" : "تعطيل/تفعيل الفرع"}
                        className="p-2 text-slate-500 hover:bg-slate-100 transition rounded-lg text-sm border border-slate-200"
                      >
                        <i className={`ph-bold ${b.is_active ? "ph-power text-emerald-600" : "ph-power text-amber-600"}`}></i>
                      </button>

                      <button
                        onClick={() => handleDeleteBranch(b.branch_code, b.branch_name)}
                        title={lang === "en" ? "Delete Branch Permanently" : "حذف الفرع نهائياً"}
                        className="p-2 text-red-600 hover:bg-red-50 transition rounded-lg text-sm border border-red-200"
                      >
                        <i className="ph-bold ph-trash"></i>
                      </button>
                    </div>

                    <button
                      onClick={() => setViewingBranch(b)}
                      className="w-full py-2 px-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-2 shadow-sm"
                    >
                      <i className="ph-bold ph-eye text-sm"></i>
                      {lang === "en" ? "View Employees, Audits & Orders" : "عرض تفاصيل الفرع، الموظفين والجرد"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* Tab 5: Inter-Branch Transfers (التحويلات بين الفروع) */}
      {tabToRender === "transfers" && (() => {
        const activeTransfers = allTransfers.filter(
          (t) => t.status !== "completed" && t.status !== "rejected"
        );
        const archivedTransfers = allTransfers.filter(
          (t) => t.status === "completed" || t.status === "rejected"
        );
        const currentPool = transferMainTab === "active" ? activeTransfers : archivedTransfers;

        const filteredTransfers = currentPool.filter((t) => {
          if (transferFilterStatus !== "ALL" && t.status !== transferFilterStatus) return false;
          if (
            transferFilterBranch !== "ALL" &&
            t.fromBranchCode !== transferFilterBranch &&
            t.toBranchCode !== transferFilterBranch
          ) {
            return false;
          }
          if (transferSearch.trim()) {
            const q = transferSearch.trim().toLowerCase();
            const matchNo = t.transferNo.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
            const matchFrom = t.fromBranchName.toLowerCase().includes(q) || t.fromBranchCode.toLowerCase().includes(q);
            const matchTo = t.toBranchName.toLowerCase().includes(q) || t.toBranchCode.toLowerCase().includes(q);
            const matchEmp = t.requestedBy.toLowerCase().includes(q) || t.requestedById.toLowerCase().includes(q);
            const matchItems = t.items.some(
              (i) => i.code.includes(q) || i.nameAr.toLowerCase().includes(q) || (i.nameEn && i.nameEn.toLowerCase().includes(q))
            );
            return matchNo || matchFrom || matchTo || matchEmp || matchItems;
          }
          return true;
        });

        return (
          <div className="space-y-4 sm:space-y-6">
            {/* Top Quick KPI Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 sm:p-4 text-center shadow-2xs">
                <span className="block text-[11px] sm:text-xs font-bold text-slate-500 mb-0.5">إجمالي المعاملات</span>
                <span className="text-lg sm:text-xl font-black font-mono text-slate-800">{allTransfers.length}</span>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 sm:p-4 text-center shadow-2xs">
                <span className="block text-[11px] sm:text-xs font-bold text-amber-800 mb-0.5">بانتظار موافقة الأدمن</span>
                <span className="text-lg sm:text-xl font-black font-mono text-amber-900">
                  {allTransfers.filter((t) => t.status === "pending_admin_initial").length}
                </span>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3 sm:p-4 text-center shadow-2xs">
                <span className="block text-[11px] sm:text-xs font-bold text-purple-800 mb-0.5">بانتظار تأكيد الشحن</span>
                <span className="text-lg sm:text-xl font-black font-mono text-purple-900">
                  {allTransfers.filter((t) => t.status === "dispatched_by_source").length}
                </span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 sm:p-4 text-center shadow-2xs">
                <span className="block text-[11px] sm:text-xs font-bold text-emerald-800 mb-0.5">المؤرشفة والسابقة</span>
                <span className="text-lg sm:text-xl font-black font-mono text-emerald-900">
                  {archivedTransfers.length}
                </span>
              </div>
            </div>

            {/* Main Tabs: Active Transfers vs Archived / Past Transfers */}
            <div className="flex items-center gap-2 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200 text-xs font-black">
              <button
                type="button"
                onClick={() => {
                  setTransferMainTab("active");
                  setTransferFilterStatus("ALL");
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 ${
                  transferMainTab === "active"
                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/25"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
              >
                <i className="ph-bold ph-arrows-left-right text-base"></i>
                <span>المعاملات النشطة والجارية</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                  transferMainTab === "active" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-900"
                }`}>
                  {activeTransfers.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTransferMainTab("archive");
                  setTransferFilterStatus("ALL");
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 ${
                  transferMainTab === "archive"
                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/25"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
              >
                <i className="ph-bold ph-archive-box text-base"></i>
                <span>المعاملات السابقة والمؤرشفة</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                  transferMainTab === "archive" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                }`}>
                  {archivedTransfers.length}
                </span>
              </button>
            </div>

            {/* Search Box & Filters Bar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-2xs space-y-3">
              {/* Search by Transfer Number / Item / Branch */}
              <div className="relative">
                <i className={`ph-bold ph-magnifying-glass absolute top-1/2 ${lang === 'ar' ? 'right-3.5' : 'left-3.5'} -translate-y-1/2 text-slate-400 text-base sm:text-lg`}></i>
                <input
                  type="text"
                  value={transferSearch}
                  onChange={(e) => setTransferSearch(e.target.value)}
                  placeholder="ابحث برقم المعاملة (مثال: TR-2609-001) أو اسم الصنف أو كود الفرع..."
                  className={`w-full bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl ${lang === 'ar' ? 'pr-10 pl-10' : 'pl-10 pr-10'} py-2.5 sm:py-3 text-slate-800 font-medium focus:bg-white focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition text-xs sm:text-sm`}
                />
                {transferSearch && (
                  <button
                    onClick={() => setTransferSearch("")}
                    className={`absolute top-1/2 ${lang === 'ar' ? 'left-3' : 'right-3'} -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1`}
                    title="مسح البحث"
                  >
                    <i className="ph-bold ph-x text-sm"></i>
                  </button>
                )}
              </div>

              {/* Status and Branch Filter Dropdowns */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 text-xs">
                {/* Status Dropdown */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-slate-500 shrink-0">الحالة:</span>
                  <select
                    value={transferFilterStatus}
                    onChange={(e) => setTransferFilterStatus(e.target.value)}
                    className="w-full sm:w-auto bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold outline-none text-slate-800 focus:bg-white focus:border-purple-500 transition cursor-pointer"
                  >
                    <option value="ALL">جميع الحالات ({currentPool.length})</option>
                    {transferMainTab === "active" ? (
                      <>
                        <option value="pending_admin_initial">1. بانتظار موافقة الأدمن الأولى</option>
                        <option value="approved_by_admin">2. بانتظار تجهيز الفرع المرسل</option>
                        <option value="dispatched_by_source">3. بانتظار تأكيد الشحن من الأدمن</option>
                        <option value="in_transit">4. في الطريق للفرع المستلم</option>
                      </>
                    ) : (
                      <>
                        <option value="completed">5. مكتمل ومؤرشف 🟢</option>
                        <option value="rejected">مرفوض ❌</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Branch Dropdown */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-slate-500 shrink-0">الفرع:</span>
                  <select
                    value={transferFilterBranch}
                    onChange={(e) => setTransferFilterBranch(e.target.value)}
                    className="w-full sm:w-auto bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold outline-none text-slate-800 focus:bg-white focus:border-purple-500 transition cursor-pointer truncate"
                  >
                    <option value="ALL">جميع الفروع</option>
                    {branches.map((b) => (
                      <option key={b.branch_code} value={b.branch_code}>
                        {b.branch_code} - {getBranchName(b.branch_code, b.branch_name)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Transfers List */}
            {filteredTransfers.length === 0 ? (
              <div className="py-14 text-center text-slate-400 font-bold bg-white rounded-3xl border border-dashed border-slate-200 shadow-2xs">
                <i className="ph-bold ph-tray text-5xl text-slate-300 mb-2 block"></i>
                <p className="text-sm text-slate-600 font-black mb-1">
                  {transferMainTab === "active" ? "لا توجد معاملات تحويل نشطة حالياً" : "لا توجد معاملات مؤرشفة تطابق البحث"}
                </p>
                <p className="text-xs text-slate-400">
                  {transferSearch || transferFilterStatus !== "ALL" || transferFilterBranch !== "ALL"
                    ? "جرّب تغيير معايير البحث أو تصفية الفروع"
                    : transferMainTab === "active"
                    ? "جميع المعاملات السابقة مكتملة ومخزنة في الأرشيف"
                    : "ستظهر هنا المعاملات بعد اكتمالها أو أرشفتها"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredTransfers.map((t) => {
                  const isInitialPending = t.status === "pending_admin_initial";
                  const isDispatchedPending = t.status === "dispatched_by_source";
                  const isCompleted = t.status === "completed";
                  const isRejected = t.status === "rejected";

                  return (
                    <div
                      key={t.id}
                      className={`bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-sm space-y-3.5 transition ${
                        isInitialPending
                          ? "border-amber-400/90 ring-1 ring-amber-400/20"
                          : isDispatchedPending
                          ? "border-purple-400/90 ring-1 ring-purple-400/20"
                          : isCompleted
                          ? "border-emerald-200"
                          : "border-slate-200"
                      }`}
                    >
                      {/* Transfer Header Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            {/* Transaction Number Badge */}
                            <span className="font-mono font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg text-xs shadow-2xs">
                              #{t.transferNo}
                            </span>

                            {/* Status Badge */}
                            {t.status === "pending_admin_initial" && (
                              <span className="bg-amber-100 text-amber-900 border border-amber-300 text-xs px-2.5 py-0.5 rounded-full font-bold">
                                1. بانتظار موافقة الأدمن ⏳
                              </span>
                            )}
                            {t.status === "approved_by_admin" && (
                              <span className="bg-blue-100 text-blue-900 border border-blue-300 text-xs px-2.5 py-0.5 rounded-full font-bold">
                                2. معتمد (بانتظار تجهيز وشحن الفرع) 📦
                              </span>
                            )}
                            {t.status === "dispatched_by_source" && (
                              <span className="bg-purple-100 text-purple-900 border border-purple-300 text-xs px-2.5 py-0.5 rounded-full font-bold animate-pulse">
                                3. تم شحن الفرع (بانتظار تأكيد الأدمن) 🚚
                              </span>
                            )}
                            {t.status === "in_transit" && (
                              <span className="bg-teal-100 text-teal-950 border border-teal-300 text-xs px-2.5 py-0.5 rounded-full font-bold animate-pulse">
                                4. في الطريق للفرع المستلم 🚚
                              </span>
                            )}
                            {t.status === "completed" && (
                              <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-bold">
                                5. مكتمل ومؤرشف 🟢
                              </span>
                            )}
                            {t.status === "rejected" && (
                              <span className="bg-rose-100 text-rose-900 border border-rose-300 text-xs px-2.5 py-0.5 rounded-full font-bold">
                                مرفوض ❌
                              </span>
                            )}

                            <span className="text-[11px] text-slate-400 font-normal">
                              {new Date(t.requestedAt).toLocaleString(lang === "en" ? "en-US" : "ar-EG")}
                            </span>
                          </div>

                          {/* From -> To Branch Route */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-black text-slate-900">
                            <span className="text-rose-700 bg-rose-50/70 border border-rose-100 px-2 py-0.5 rounded-lg inline-block">
                              المصدر: {t.fromBranchName}
                            </span>
                            <i className="ph-bold ph-arrow-left text-slate-400 hidden sm:inline"></i>
                            <span className="text-emerald-700 bg-emerald-50/70 border border-emerald-100 px-2 py-0.5 rounded-lg inline-block">
                              المستلم: {t.toBranchName}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 font-bold mt-1">
                            بواسطة الموظف: <span className="text-slate-800">{t.requestedBy}</span> (#{t.requestedById})
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          {isInitialPending && (
                            <button
                              onClick={() => {
                                setAdminReviewingTransfer(t);
                                const initial: Record<string, number> = {};
                                t.items.forEach((i) => {
                                  initial[i.code] = i.requestedQty;
                                });
                                setAdminApprovedQtys(initial);
                                setAdminReviewNotes("");
                              }}
                              className="bg-violet-600 hover:bg-violet-700 text-white font-black text-xs px-3.5 py-2 rounded-xl transition shadow-md shadow-violet-600/20 flex items-center gap-1.5 active:scale-95"
                            >
                              <i className="ph-bold ph-pencil-simple text-sm"></i>
                              <span>مراجعة واعتماد الطلب ✍️</span>
                            </button>
                          )}

                          {isDispatchedPending && (
                            <button
                              onClick={() => {
                                adminFinalApproveMut.mutate({ id: t.id });
                              }}
                              className="bg-purple-600 hover:bg-purple-700 text-white font-black text-xs px-3.5 py-2 rounded-xl transition shadow-md shadow-purple-600/20 flex items-center gap-1.5 active:scale-95"
                            >
                              <i className="ph-bold ph-truck text-sm"></i>
                              <span>تأكيد الشحن 🚚</span>
                            </button>
                          )}

                          {/* Close & Archive Transfer Button (available for active transfers) */}
                          {!isCompleted && !isRejected && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`هل أنت متأكد من إغلاق المعاملة #${t.transferNo} ونقلها إلى سجل المعاملات السابقة والمؤرشفة؟`)) {
                                  closeTransferMut.mutate({ id: t.id });
                                }
                              }}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs px-3 py-2 rounded-xl transition flex items-center gap-1.5 active:scale-95 shadow-2xs"
                              title="إغلاق وأرشفة المعاملة فوراً ونقلها للمؤرشفة"
                            >
                              <i className="ph-bold ph-archive-box text-sm text-emerald-600"></i>
                              <span>إغلاق وأرشفة 📁</span>
                            </button>
                          )}

                          <button
                            onClick={() => setSelectedTransferTimeline(t)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-2.5 sm:px-3 py-2 rounded-xl transition flex items-center gap-1 shadow-2xs"
                            title="سجل الحركات والاعتمادات"
                          >
                            <i className="ph-bold ph-clock-counter-clockwise text-sm"></i>
                            <span className="hidden sm:inline">سجل الحركات</span>
                          </button>

                          <button
                            onClick={() => {
                              const isEn = lang === "en";
                              const printWindow = window.open("", "_blank", "width=900,height=750");
                              if (!printWindow) return;
                              const fromName = getBranchName(t.fromBranchCode, t.fromBranchName);
                              const toName = getBranchName(t.toBranchCode, t.toBranchName);
                              const rows = t.items
                                .map(
                                  (i, idx) =>
                                    `<tr><td>${idx + 1}</td><td>${i.code}</td><td><b>${isEn ? (i.nameEn || i.nameAr) : i.nameAr}</b>${isEn && i.nameAr ? `<br><small style="color:#64748b">${i.nameAr}</small>` : (!isEn && i.nameEn ? `<br><small style="color:#64748b">${i.nameEn}</small>` : '')}</td><td>${i.unit}</td><td>${i.requestedQty}</td><td>${i.adminApprovedQty ?? i.requestedQty}</td><td>${i.dispatchedQty ?? "-"}</td><td>${i.receivedQty ?? "-"}</td></tr>`
                                )
                                .join("");
                              printWindow.document.write(`
                                <html dir="${isEn ? 'ltr' : 'rtl'}" lang="${isEn ? 'en' : 'ar'}"><head><meta charset="utf-8"><title>${isEn ? `Branch Transfer #${t.transferNo}` : `سند #${t.transferNo}`}</title><style>body{font-family:sans-serif;padding:30px;direction:${isEn ? 'ltr' : 'rtl'}}table{width:100%;border-collapse:collapse;margin-top:15px}th,td{border:1px solid #cbd5e1;padding:8px 12px;text-align:${isEn ? 'left' : 'right'}}th{background:#f1f5f9}</style></head><body><h2>${isEn ? "Inter-Branch Cargo Transfer Voucher" : "سند تحويل بضاعة بين الفروع"} #${t.transferNo}</h2><p><b>${isEn ? "From" : "من"}:</b> ${fromName} (${t.fromBranchCode}) | <b>${isEn ? "To" : "إلى"}:</b> ${toName} (${t.toBranchCode})</p><table><thead><tr><th>#</th><th>${isEn ? "Item Code" : "الكود"}</th><th>${isEn ? "Product Name" : "الصنف"}</th><th>${isEn ? "Unit" : "الوحدة"}</th><th>${isEn ? "Requested" : "المطلوب"}</th><th>${isEn ? "Admin Approved" : "معتمد الأدمن"}</th><th>${isEn ? "Dispatched" : "المشحون"}</th><th>${isEn ? "Received" : "المستلم"}</th></tr></thead><tbody>${rows}</tbody></table></body></html>
                              `);
                              printWindow.document.close();
                              printWindow.focus();
                              printWindow.print();
                            }}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-2.5 sm:px-3 py-2 rounded-xl transition flex items-center gap-1 shadow-2xs"
                            title="طباعة سند PDF"
                          >
                            <i className="ph-bold ph-file-pdf text-sm"></i> <span>PDF</span>
                          </button>
                        </div>
                      </div>

                      {/* Items Display: Responsive on Mobile, Table on Desktop */}
                      <div>
                        {/* Mobile Items Cards (< sm) */}
                        <div className="sm:hidden space-y-2">
                          {t.items.map((i, idx) => (
                            <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs space-y-1.5">
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="min-w-0">
                                  <span className="font-mono text-blue-700 font-bold ml-1">#{i.code}</span>
                                  <span className="font-black text-slate-900">{i.nameAr}</span>
                                </div>
                                <span className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-600 shrink-0">
                                  {i.unit}
                                </span>
                              </div>

                              <div className="grid grid-cols-4 gap-1 pt-1 border-t border-slate-200/70 text-center font-mono text-[11px]">
                                <div className="bg-white p-1 rounded-lg border border-slate-200">
                                  <span className="block text-[9px] font-bold text-slate-400 font-sans">المطلوب</span>
                                  <span className="font-black text-slate-800">{i.requestedQty}</span>
                                </div>
                                <div className="bg-blue-50/60 p-1 rounded-lg border border-blue-100">
                                  <span className="block text-[9px] font-bold text-blue-600 font-sans">المعتمد</span>
                                  <span className="font-black text-blue-800">{i.adminApprovedQty ?? i.requestedQty}</span>
                                </div>
                                <div className="bg-purple-50/60 p-1 rounded-lg border border-purple-100">
                                  <span className="block text-[9px] font-bold text-purple-600 font-sans">المشحون</span>
                                  <span className="font-black text-purple-800">{i.dispatchedQty ?? "-"}</span>
                                </div>
                                <div className="bg-emerald-50/60 p-1 rounded-lg border border-emerald-100">
                                  <span className="block text-[9px] font-bold text-emerald-600 font-sans">المستلم</span>
                                  <span className="font-black text-emerald-800">{i.receivedQty ?? "-"}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Desktop / Tablet Items Table (sm: and up) */}
                        <div className="hidden sm:block border border-slate-200 rounded-2xl overflow-hidden text-xs">
                          <table className="w-full text-right">
                            <thead className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200">
                              <tr>
                                <th className="p-2.5">الصنف</th>
                                <th className="p-2.5">الوحدة</th>
                                <th className="p-2.5">المطلوب</th>
                                <th className="p-2.5">معتمد الأدمن</th>
                                <th className="p-2.5">المشحون من الفرع</th>
                                <th className="p-2.5">المستلم فعلياً</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-bold text-slate-800 bg-white">
                              {t.items.map((i, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/80 transition">
                                  <td className="p-2.5">
                                    <span className="font-mono text-blue-600 ml-1">#{i.code}</span>
                                    <span>{i.nameAr}</span>
                                  </td>
                                  <td className="p-2.5 text-slate-600">{i.unit}</td>
                                  <td className="p-2.5 font-mono">{i.requestedQty}</td>
                                  <td className="p-2.5 font-mono text-blue-700">{i.adminApprovedQty ?? i.requestedQty}</td>
                                  <td className="p-2.5 font-mono text-purple-700">{i.dispatchedQty ?? "-"}</td>
                                  <td className="p-2.5 font-mono text-emerald-700">{i.receivedQty ?? "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* MODAL: ADMIN REVIEW & QUANTITY ADJUSTMENT */}
      {adminReviewingTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-xl p-6 shadow-2xl space-y-4" dir={lang === "ar" ? "rtl" : "ltr"}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <i className="ph-bold ph-pencil-simple text-violet-600 text-lg"></i>
                  <span>مراجعة واعتماد طلب التحويل (الأدمن)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  من: <b>{adminReviewingTransfer.fromBranchName}</b> ➔ إلى: <b>{adminReviewingTransfer.toBranchName}</b>
                </p>
              </div>
              <button onClick={() => setAdminReviewingTransfer(null)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">✕</button>
            </div>

            <div className="bg-violet-50 text-violet-900 border border-violet-200 p-3 rounded-2xl text-xs font-semibold">
              ✍️ يمكنك تعديل الكمية المعتمدة لكل صنف بالزيادة أو النقص حسب المعايير التشغيلية للفرعين.
            </div>

            <div className="space-y-2.5 max-h-60 overflow-y-auto">
              {adminReviewingTransfer.items.map((i, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono text-slate-500 font-bold ml-1">#{i.code}</span>
                    <span className="font-black text-slate-900">{i.nameAr}</span>
                    <div className="text-[11px] text-slate-500 mt-0.5">المطلوب أصلاً: {i.requestedQty} {i.unit}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="font-bold text-slate-700">معتمد الأدمن:</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const curr = adminApprovedQtys[i.code] ?? i.requestedQty;
                          if (curr > 0) setAdminApprovedQtys((prev) => ({ ...prev, [i.code]: curr - 1 }));
                        }}
                        className="w-7 h-7 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-black text-xs"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={adminApprovedQtys[i.code] ?? i.requestedQty}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setAdminApprovedQtys((prev) => ({ ...prev, [i.code]: val }));
                        }}
                        className="w-16 font-mono font-black text-center bg-white border border-violet-300 rounded-xl py-1 px-2"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const curr = adminApprovedQtys[i.code] ?? i.requestedQty;
                          setAdminApprovedQtys((prev) => ({ ...prev, [i.code]: curr + 1 }));
                        }}
                        className="w-7 h-7 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-black text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات اعتماد الأدمن:</label>
              <input
                type="text"
                value={adminReviewNotes}
                onChange={(e) => setAdminReviewNotes(e.target.value)}
                placeholder="مثال: تمت الموافقة على تحويل الكميات بعد مراجعة مخزون الفرع"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 text-xs font-bold"
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  const reason = window.prompt("يرجى كتابة سبب رفض الطلب:");
                  if (reason) {
                    rejectTransferMut.mutate({ id: adminReviewingTransfer.id, reason });
                  }
                }}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold py-3 px-4 rounded-xl text-xs"
              >
                رفض الطلب ❌
              </button>
              <button
                type="button"
                disabled={adminApproveMut.isPending}
                onClick={() => {
                  adminApproveMut.mutate({
                    id: adminReviewingTransfer.id,
                    notes: adminReviewNotes,
                    items: adminReviewingTransfer.items.map((i) => ({
                      code: i.code,
                      adminApprovedQty: adminApprovedQtys[i.code] ?? i.requestedQty,
                    })),
                  });
                }}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-black py-3 rounded-xl text-xs shadow-md flex items-center justify-center gap-1.5"
              >
                <i className="ph-bold ph-check-circle text-base"></i>
                <span>{adminApproveMut.isPending ? "جاري الاعتماد..." : "موافقة وإرسال للفرع المصدر للتجهيز ✅"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TIMELINE DISPLAY */}
      {selectedTransferTimeline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto" dir={lang === "ar" ? "rtl" : "ltr"}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-xs">
                  #{selectedTransferTimeline.transferNo}
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">سجل الحركات الزمني والموافقات</h3>
              </div>
              <button onClick={() => setSelectedTransferTimeline(null)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">✕</button>
            </div>

            <div className="space-y-3">
              {selectedTransferTimeline.timeline.map((tl, idx) => (
                <div key={idx} className="flex items-start gap-2 border-r-2 border-violet-500 pr-3 text-xs">
                  <div>
                    <div className="font-black text-slate-900">{tl.action}</div>
                    <div className="text-slate-500 text-[11px]">{tl.by} ({tl.role}) • {new Date(tl.timestamp).toLocaleString("ar-EG")}</div>
                    {tl.notes && <div className="text-slate-700 text-[11px] mt-0.5 bg-slate-50 p-1.5 rounded border border-slate-200">ملاحظة: {tl.notes}</div>}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-100">
              {selectedTransferTimeline.status !== "completed" && selectedTransferTimeline.status !== "rejected" && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`هل أنت متأكد من إغلاق المعاملة #${selectedTransferTimeline.transferNo} ونقلها للأرشيف فوراً؟`)) {
                      closeTransferMut.mutate({ id: selectedTransferTimeline.id });
                      setSelectedTransferTimeline(null);
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/25 transition active:scale-95"
                >
                  <i className="ph-bold ph-archive-box text-base"></i>
                  <span>إغلاق المعاملة ونقلها للأرشيف 📁</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedTransferTimeline(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Branch */}
      {editingBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl" dir={lang === "ar" ? "rtl" : "ltr"}>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <i className="ph-bold ph-pencil-simple text-violet-600 text-lg"></i>
                {lang === "en" ? "Edit Branch Data" : "تعديل بيانات الفرع (رقم واسم الفرع)"}
              </h3>
              <button
                onClick={() => setEditingBranch(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateBranchSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === "en" ? "Branch Code (7 digits) *" : "رقم الفرع الجديد (من 7 أرقام) *"}
                </label>
                <input
                  type="text"
                  required
                  maxLength={7}
                  value={editBranchCode}
                  onChange={(e) => setEditBranchCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs font-bold font-mono tracking-wider outline-none focus:border-violet-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === "en" ? "Branch Name *" : "اسم الفرع الجديد *"}
                </label>
                <input
                  type="text"
                  required
                  value={editBranchName}
                  onChange={(e) => setEditBranchName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-violet-600"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingBranch(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-xs transition"
                >
                  {lang === "en" ? "Cancel" : "إلغاء"}
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-violet-600 hover:bg-violet-700 text-white font-extrabold py-3 rounded-xl text-xs transition shadow-md flex items-center justify-center gap-1.5"
                >
                  <i className="ph-bold ph-floppy-disk"></i>
                  {lang === "en" ? "Save Changes" : "حفظ التعديلات"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Transfer Employee */}
      {transferringEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl" dir={lang === "ar" ? "rtl" : "ltr"}>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <i className="ph-bold ph-arrows-left-right text-violet-600 text-lg"></i>
                {lang === "en" ? "Transfer Employee to Another Branch" : "نقل موظف إلى فرع آخر"}
              </h3>
              <button
                onClick={() => setTransferringEmployee(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">{lang === "en" ? "Employee Name:" : "اسم الموظف:"}</span>
                  <span className="font-black text-slate-900">{getEmployeeName(transferringEmployee.full_name)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">{lang === "en" ? "Employee ID:" : "الرقم الوظيفي:"}</span>
                  <span className="font-mono font-bold text-slate-700">#{transferringEmployee.employee_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">{lang === "en" ? "Current Branch:" : "الفرع الحالي:"}</span>
                  <span className="bg-orange-50 text-orange-700 font-mono font-bold px-2 py-0.5 rounded border border-orange-200">
                    {transferringEmployee.branch_code}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === "en" ? "Select New Target Branch *" : "اختر الفرع الجديد المطلوب نقل الموظف إليه *"}
                </label>
                <select
                  value={targetBranchCode}
                  onChange={(e) => setTargetBranchCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-violet-600"
                >
                  {branches.map((b) => (
                    <option key={b.branch_code} value={b.branch_code}>
                      {b.branch_code} - {getBranchName(b.branch_code, b.branch_name)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTransferringEmployee(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-xs transition"
                >
                  {lang === "en" ? "Cancel" : "إلغاء"}
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-violet-600 hover:bg-violet-700 text-white font-extrabold py-3 rounded-xl text-xs transition shadow-md flex items-center justify-center gap-1.5"
                >
                  <i className="ph-bold ph-check-circle"></i>
                  {lang === "en" ? "Confirm Transfer" : "تأكيد نقل الموظف"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Submission Details */}
      {selectedSubmission && (
        <SubmissionDetailsModal
          submission={selectedSubmission}
          onClose={() => setSelectedSubmission(null)}
          onMarkReviewed={(id) => {
            handleToggleSubmissionStatus(id, "pending");
          }}
          setReceivingSubmission={setReceivingSubmission}
        />
      )}

      {/* Modal: Goods Receiving & Stock Inflow (Admin Triggered) */}
      {receivingSubmission && receivingSubmission.details.items && (
        <GoodsReceivingModal
          isOpen={!!receivingSubmission}
          onClose={() => setReceivingSubmission(null)}
          submissionId={receivingSubmission.id}
          orderTitle={receivingSubmission.title}
          orderItems={receivingSubmission.details.items.map((item, idx) => ({
            id: idx + 1,
            code: item.code,
            nameAr: item.nameAr,
            nameEn: item.nameEn,
            orderQty: item.qty ?? 1,
            unitLabel: item.unit,
          }))}
          onSuccess={() => {
            handleToggleSubmissionStatus(receivingSubmission.id, "pending");
            setToast(lang === "en" ? "Stock intake confirmed & updated successfully!" : "تم تأكيد الاستلام وتوريد الكميات للمخزون بنجاح!");
            setTimeout(() => setToast(null), 3000);
          }}
        />
      )}

      {/* Modal: Branch Details & Audits */}
      {viewingBranch && (
        <BranchDetailsModal
          branch={viewingBranch}
          employees={employees}
          onClose={() => setViewingBranch(null)}
          onTransferEmployee={openTransferModal}
          onToggleActive={handleToggleActive}
        />
      )}

    </div>
  );
}

function BranchDetailsModal({
  branch,
  employees,
  onClose,
  onTransferEmployee,
  onToggleActive,
}: {
  branch: BranchRecord;
  employees: EmployeeRecord[];
  onClose: () => void;
  onTransferEmployee: (emp: EmployeeRecord) => void;
  onToggleActive: (empId: string, currentActive: boolean) => void;
}) {
  const { lang, getProductName, getUnitName, getBranchName, getEmployeeName, t } = useLanguage();
  const { setSelectedBranch } = useAuth();
  const utils = trpc.useUtils();

  const [tab, setTab] = useState<"employees" | "audits" | "orders">("employees");
  const [inspectingAuditId, setInspectingAuditId] = useState<number | null>(null);

  const auditsQuery = trpc.audit.list.useQuery();
  const snapshotsQuery = trpc.inventory.snapshots.useQuery();
  const productsQuery = trpc.inventory.list.useQuery();

  const branchEmployees = employees.filter((e) => e.branch_code === branch.branch_code);
  const audits = auditsQuery.data ?? [];
  const snapshots = snapshotsQuery.data ?? [];
  const orderedItems = (productsQuery.data ?? []).filter((p) => p.orderQty != null && p.orderQty > 0);

  const handleExportPdf = async (audit: any) => {
    try {
      const data = await utils.client.audit.get.query({ id: audit.id });
      if (!data || !data.items) {
        alert(lang === "en" ? "No audit items found" : "لا توجد بنود لهذا الجرد");
        return;
      }
      await generateAuditPdf({
        lang: lang as "ar" | "en",
        auditType: audit.auditType,
        auditorName: audit.auditorName || "—",
        createdAt: audit.createdAt,
        notes: audit.notes || null,
        items: data.items.map((r: any) => ({
          productCode: r.productCode,
          productName: r.productName,
          category: r.category,
          unit: r.unit,
          systemQty: r.systemQty,
          actualQty: r.actualQty,
          difference: r.actualQty != null && r.systemQty != null ? r.actualQty - r.systemQty : null,
          itemNotes: r.itemNotes || null,
        })),
      });
    } catch (err) {
      alert(lang === "en" ? "Failed to generate PDF" : "تعذر استخراج ملف PDF");
    }
  };

  const handleShareAudit = async (audit: any) => {
    try {
      const data = await utils.client.audit.get.query({ id: audit.id });
      const items = data?.items ?? [];
      const deficitCount = items.filter((r: any) => (r.actualQty ?? 0) < (r.systemQty ?? 0)).length;
      const surplusCount = items.filter((r: any) => (r.actualQty ?? 0) > (r.systemQty ?? 0)).length;
      const exactCount = items.filter((r: any) => r.actualQty === r.systemQty && r.actualQty != null).length;

      const typeStr = audit.auditType === "weekly" ? (lang === "ar" ? "جرد أسبوعي" : "Weekly Audit") : (lang === "ar" ? "جرد شهري" : "Monthly Audit");
      const dateStr = new Date(audit.createdAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US");

      const summaryText = `📋 ${lang === "ar" ? "تقرير جرد دانكن" : "Dunkin Inventory Audit Report"}
🏬 ${lang === "ar" ? "الفرع" : "Branch"}: ${getBranchName(branch.branch_code, branch.branch_name)} (#${branch.branch_code})
🗓️ ${lang === "ar" ? "النوع" : "Type"}: ${typeStr}
👤 ${lang === "ar" ? "المحرر" : "Auditor"}: ${getEmployeeName(audit.auditorName)}
📅 ${lang === "ar" ? "التاريخ" : "Date"}: ${dateStr}
📦 ${lang === "ar" ? "إجمالي الأصناف" : "Total Items"}: ${items.length}
⚠️ ${lang === "ar" ? "أصناف بعجز" : "Deficit Items"}: ${deficitCount}
📈 ${lang === "ar" ? "أصناف بزيادة" : "Surplus Items"}: ${surplusCount}
✅ ${lang === "ar" ? "أصناف مطابقة" : "Exact Match"}: ${exactCount}
${audit.notes ? `📝 ${lang === "ar" ? "ملاحظات" : "Notes"}: ${audit.notes}` : ""}
`.trim();

      if (navigator.share) {
        try {
          await navigator.share({
            title: `Dunkin Audit - ${branch.branch_name}`,
            text: summaryText,
          });
          return;
        } catch (e) {
          // Fallback
        }
      }

      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(summaryText);
        alert(lang === "ar" ? "تم نسخ تقرير الجرد للحافظة بنجاح للمشاركة!" : "Audit report copied to clipboard for sharing!");
      } else {
        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(summaryText)}`;
        window.open(waUrl, "_blank");
      }
    } catch (err) {
      alert(lang === "en" ? "Failed to share audit" : "تعذر تجهيز تقرير الجرد للمشاركة");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-violet-600/30">
              <i className="ph-bold ph-storefront"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-bold">
                  {branch.branch_code}
                </span>
                {branch.is_active ? (
                  <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-500/30">
                    {lang === "en" ? "Active Branch" : "فرع نشط"}
                  </span>
                ) : (
                  <span className="bg-red-500/20 text-red-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-red-500/30">
                    {lang === "en" ? "Inactive Branch" : "فرع معطل"}
                  </span>
                )}
              </div>
              <h3 className="text-lg font-extrabold mt-0.5">{getBranchName(branch.branch_code, branch.branch_name)}</h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedBranch(branch.branch_code);
                onClose();
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-3 py-2 rounded-xl transition flex items-center gap-1.5 shadow-md"
            >
              <i className="ph-bold ph-sign-in"></i>
              {lang === "en" ? "Switch to Branch" : "دخول هذا الفرع"}
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition">
              <i className="ph-bold ph-x text-lg"></i>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold">
          <button
            onClick={() => setTab("employees")}
            className={`flex-1 py-3 text-center transition flex items-center justify-center gap-2 ${
              tab === "employees"
                ? "bg-white text-violet-700 border-b-2 border-violet-600 font-extrabold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <i className="ph-bold ph-users text-base"></i>
            {lang === "en" ? "Registered Employees" : "الموظفين المسجلين"}
            <span className="bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full text-[10px] font-black">
              {branchEmployees.length}
            </span>
          </button>

          <button
            onClick={() => setTab("audits")}
            className={`flex-1 py-3 text-center transition flex items-center justify-center gap-2 ${
              tab === "audits"
                ? "bg-white text-violet-700 border-b-2 border-violet-600 font-extrabold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <i className="ph-bold ph-clipboard-text text-base"></i>
            {lang === "en" ? "Audits & History" : "سجل الجرد الأسبوعي/الشهري"}
            <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-black">
              {audits.length + snapshots.length}
            </span>
          </button>

          <button
            onClick={() => setTab("orders")}
            className={`flex-1 py-3 text-center transition flex items-center justify-center gap-2 ${
              tab === "orders"
                ? "bg-white text-violet-700 border-b-2 border-violet-600 font-extrabold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <i className="ph-bold ph-shopping-cart text-base"></i>
            {lang === "en" ? "Warehouse Cargo Orders" : "طلبات البضاعة"}
            <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full text-[10px] font-black">
              {orderedItems.length}
            </span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {tab === "employees" && (
            <div>
              {branchEmployees.length === 0 ? (
                <div className="py-12 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <i className="ph-bold ph-users-three text-4xl text-slate-300 mb-2"></i>
                  <p>{lang === "en" ? "No registered employees in this branch" : "لا يوجد موظفون مسجلون في هذا الفرع حالياً"}</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className={`w-full ${lang === "ar" ? "text-right" : "text-left"} text-xs`}>
                    <thead className="bg-slate-100 text-slate-600 font-black">
                      <tr>
                        <th className="p-3">{lang === "en" ? "Employee Name" : "اسم الموظف"}</th>
                        <th className="p-3">{lang === "en" ? "Employee ID" : "الرقم الوظيفي"}</th>
                        <th className="p-3">{lang === "en" ? "Role" : "الدور"}</th>
                        <th className="p-3">{lang === "en" ? "Status" : "الحالة"}</th>
                        <th className={`p-3 ${lang === "ar" ? "text-left" : "text-right"}`}>{lang === "en" ? "Actions" : "التحكم"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-bold text-slate-800">
                      {branchEmployees.map((emp) => (
                        <tr key={emp.id || emp.employee_id} className="hover:bg-slate-50 transition">
                          <td className="p-3 font-black text-slate-900">{getEmployeeName(emp.full_name)}</td>
                          <td className="p-3 font-mono text-slate-700">#{emp.employee_id}</td>
                          <td className="p-3"><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold uppercase">{emp.role}</span></td>
                          <td className="p-3">
                            {emp.is_active ? (
                              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">{lang === "en" ? "Active" : "نشط"}</span>
                            ) : (
                              <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-bold">{lang === "en" ? "Inactive" : "معطل"}</span>
                            )}
                          </td>
                          <td className={`p-3 ${lang === "ar" ? "text-left" : "text-right"} space-x-1.5`}>
                            <button
                              onClick={() => {
                                onClose();
                                onTransferEmployee(emp);
                              }}
                              className="bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 px-2.5 py-1 rounded-lg transition"
                              title={lang === "en" ? "Transfer Branch" : "نقل لفرع آخر"}
                            >
                              <i className="ph-bold ph-arrows-left-right"></i>
                            </button>
                            <button
                              onClick={() => onToggleActive(emp.employee_id, emp.is_active)}
                              className={`px-2.5 py-1 rounded-lg font-bold transition text-[11px] ${
                                emp.is_active
                                  ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                                  : "bg-emerald-600 text-white hover:bg-emerald-700"
                              }`}
                            >
                              {emp.is_active ? (lang === "en" ? "Disable" : "تعطيل") : (lang === "en" ? "Enable" : "تفعيل")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "audits" && (
            <div className="space-y-3">
              {audits.length === 0 && snapshots.length === 0 ? (
                <div className="py-12 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <i className="ph-bold ph-clipboard text-4xl text-slate-300 mb-2"></i>
                  <p>{lang === "en" ? "No audits or snapshots recorded for this branch yet" : "لم يتم تسجيل أي جرد أسبوعي أو شهري لهذا الفرع حتى الآن"}</p>
                </div>
              ) : (
                <>
                  {audits.map((audit) => (
                    <div key={audit.id} className="bg-slate-50 hover:bg-white border border-slate-200 hover:border-violet-300 rounded-2xl p-4 transition shadow-sm space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                              audit.auditType === "weekly" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                            }`}>
                              {audit.auditType === "weekly" ? (lang === "en" ? "Weekly Audit" : "جرد أسبوعي") : (lang === "en" ? "Monthly Audit" : "جرد شهري")}
                            </span>
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                              audit.status === "completed" ? "bg-emerald-600 text-white" : "bg-amber-100 text-amber-900 border border-amber-300"
                            }`}>
                              {audit.status === "completed" ? (lang === "en" ? "Completed" : "مكتمل") : (lang === "en" ? "Draft" : "مسودة")}
                            </span>
                          </div>
                          <h5 className="font-extrabold text-sm text-slate-800">
                            {lang === "en" ? "Auditor:" : "المحـرر:"} {getEmployeeName(audit.auditorName)}
                          </h5>
                          <p className="text-xs text-slate-400 mt-0.5 font-mono">
                            {new Date(audit.createdAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
                          </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => setInspectingAuditId(audit.id)}
                            className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1 shadow-sm"
                            title={lang === "en" ? "Inspect Audit Details" : "الاطلاع على تفاصيل الجرد"}
                          >
                            <i className="ph-bold ph-eye"></i>
                            {lang === "en" ? "View Audit" : "عرض الجرد"}
                          </button>
                          <button
                            onClick={() => handleExportPdf(audit)}
                            className="bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1"
                            title={lang === "en" ? "Save as PDF" : "حفظ ملف الجرد PDF"}
                          >
                            <i className="ph-bold ph-file-pdf"></i>
                            {lang === "en" ? "Save PDF" : "حفظ PDF"}
                          </button>
                          <button
                            onClick={() => handleShareAudit(audit)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold px-2.5 py-1.5 rounded-xl transition flex items-center gap-1"
                            title={lang === "en" ? "Share Audit" : "مشاركة تقرير الجرد"}
                          >
                            <i className="ph-bold ph-share-network"></i>
                            {lang === "en" ? "Share" : "مشاركة"}
                          </button>
                        </div>
                      </div>

                      {audit.notes && (
                        <div className="bg-white border border-slate-200 p-2.5 rounded-xl text-xs text-slate-600 font-medium">
                          <span className="font-bold text-slate-700">{lang === "en" ? "Notes:" : "ملاحظات:"}</span> {audit.notes}
                        </div>
                      )}
                    </div>
                  ))}

                  {snapshots.map((snap) => (
                    <div key={snap.id} className="bg-amber-50/50 border border-amber-200/80 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-black bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full">
                          {snap.period === "weekly" ? (lang === "en" ? "Weekly Snapshot" : "لقطة جرد أسبوعي") : (lang === "en" ? "Monthly Snapshot" : "لقطة جرد شهري")}
                        </span>
                        <p className="text-xs text-slate-500 font-bold mt-1">
                          {new Date(snap.capturedAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-amber-800 bg-white border border-amber-200 px-3 py-1 rounded-xl">
                        {lang === "en" ? "Saved Catalog Snapshot" : "نسخة محفوظة لجرد الفرع"}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === "orders" && (
            <div className="space-y-3">
              {orderedItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <i className="ph-bold ph-shopping-cart text-4xl text-slate-300 mb-2"></i>
                  <p>{lang === "en" ? "No active warehouse cargo orders for this branch" : "لا توجد طلبات بضاعة مستودع مسجلة لهذا الفرع حالياً"}</p>
                </div>
              ) : (
                orderedItems.map((p) => (
                  <div key={p.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">#{p.code}</span>
                        <span className="text-xs font-bold text-slate-500">{getUnitName(p.unitCode, p.unitLabel)}</span>
                      </div>
                      <h5 className="text-sm font-extrabold text-slate-800">{getProductName(p)}</h5>
                    </div>
                    <div className="bg-amber-100 text-amber-950 font-black px-3.5 py-1.5 rounded-xl text-sm font-mono shadow-sm">
                      {lang === "en" ? `Order Qty: ${p.orderQty}` : `الكمية المطلوبة: ${p.orderQty}`}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-2.5 rounded-xl transition text-xs"
          >
            {t("cancel")}
          </button>
        </div>
      </div>

      {inspectingAuditId && (
        <InspectAuditModal
          auditId={inspectingAuditId}
          branch={branch}
          onClose={() => setInspectingAuditId(null)}
        />
      )}
    </div>
  );
}

function SubmissionDetailsModal({
  submission,
  onClose,
  onMarkReviewed,
  setReceivingSubmission,
}: {
  submission: AdminSubmission;
  onClose: () => void;
  onMarkReviewed: (id: string) => void;
  setReceivingSubmission?: (sub: AdminSubmission | null) => void;
}) {
  const { lang, getBranchName, getEmployeeName } = useLanguage();

  const copyOrder = () => {
    if (!submission.details.items) return;
    let text = `📋 ${submission.title}:\n\n`;
    text += `👤 الموظف: ${getEmployeeName(submission.employee_name)} (#${submission.employee_id})\n`;
    text += `🏬 الفرع: [${submission.branch_code}] ${getBranchName(submission.branch_code, submission.branch_name)}\n`;
    text += `📅 التاريخ: ${new Date(submission.created_at).toLocaleString()}\n\n`;
    submission.details.items.forEach((item, i) => {
      text += `${i + 1}. [${item.code}] ${item.nameAr}\n   👈 الكمية: ${item.qty ?? item.actualQty ?? 0} (${item.unit || "عدد"})\n\n`;
    });
    navigator.clipboard.writeText(text);
  };

  const handleExportPdf = async () => {
    if (!submission.details.items || submission.details.items.length === 0) return;
    try {
      await generateAuditPdf({
        lang: lang as "ar" | "en",
        auditType: submission.details.audit_type === "weekly" ? "weekly" : "monthly",
        auditorName: submission.employee_name || "—",
        createdAt: submission.created_at,
        notes: null,
        items: submission.details.items.map((r: any) => ({
          productCode: r.code,
          productName: r.nameAr || r.nameEn || "",
          category: "",
          unit: r.unit || "عدد",
          systemQty: r.systemQty ?? null,
          actualQty: r.actualQty ?? null,
          difference: r.diff ?? (r.actualQty != null && r.systemQty != null ? r.actualQty - r.systemQty : null),
          itemNotes: null,
        })),
      });
    } catch (err) {
      alert(lang === "en" ? "Failed to generate PDF" : "تعذر استخراج ملف PDF");
    }
  };

  const handleShare = async () => {
    const items = submission.details.items ?? [];
    const deficitCount = items.filter((r: any) => (r.actualQty ?? 0) < (r.systemQty ?? 0)).length;
    const surplusCount = items.filter((r: any) => (r.actualQty ?? 0) > (r.systemQty ?? 0)).length;
    const exactCount = items.filter((r: any) => r.actualQty === r.systemQty && r.actualQty != null).length;

    const auditKind = submission.details.audit_type;
    const typeStr =
      auditKind === "weekly"
        ? (lang === "ar" ? "جرد أسبوعي" : "Weekly Audit")
        : auditKind === "custom"
          ? (lang === "ar" ? "جرد مخصص" : "Custom Audit")
          : (lang === "ar" ? "جرد شهري" : "Monthly Audit");
    const dateStr = new Date(submission.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US");

    const summaryText = `📋 ${lang === "ar" ? "تقرير جرد دانكن" : "Dunkin Inventory Audit Report"}
🏬 ${lang === "ar" ? "الفرع" : "Branch"}: [${submission.branch_code}] ${getBranchName(submission.branch_code, submission.branch_name)}
🗓️ ${lang === "ar" ? "النوع" : "Type"}: ${typeStr}
👤 ${lang === "ar" ? "المحرر" : "Auditor"}: ${getEmployeeName(submission.employee_name)} (#${submission.employee_id})
📅 ${lang === "ar" ? "التاريخ" : "Date"}: ${dateStr}
📦 ${lang === "ar" ? "إجمالي الأصناف" : "Total Items"}: ${items.length}
⚠️ ${lang === "ar" ? "أصناف بعجز" : "Deficit Items"}: ${deficitCount}
📈 ${lang === "ar" ? "أصناف بزيادة" : "Surplus Items"}: ${surplusCount}
✅ ${lang === "ar" ? "أصناف مطابقة" : "Exact Match"}: ${exactCount}
`.trim();

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Dunkin Audit - ${submission.branch_name}`,
          text: summaryText,
        });
        return;
      } catch (e) {}
    }

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(summaryText);
      alert(lang === "ar" ? "تم نسخ تقرير الجرد للحافظة بنجاح للمشاركة!" : "Audit report copied to clipboard!");
    } else {
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(summaryText)}`;
      window.open(waUrl, "_blank");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xl ${
              submission.type === "cargo_order" ? "bg-amber-600 shadow-amber-600/30" : "bg-blue-600 shadow-blue-600/30"
            }`}>
              <i className={`ph-bold ${submission.type === "cargo_order" ? "ph-package" : "ph-clipboard-text"}`}></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-bold">
                  [{submission.branch_code}] {getBranchName(submission.branch_code, submission.branch_name)}
                </span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                  submission.status === "pending" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                }`}>
                  {submission.status === "pending" ? (lang === "en" ? "New / Unread" : "جديد / لم يُقرأ") : (lang === "en" ? "Reviewed" : "تم الإطلاع")}
                </span>
              </div>
              <h3 className="text-lg font-extrabold mt-0.5">{submission.title} - {getEmployeeName(submission.employee_name)}</h3>
            </div>
          </div>

          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition">
            <i className="ph-bold ph-x text-lg"></i>
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block font-bold">{lang === "en" ? "Employee:" : "الموظف:"}</span>
              <span className="font-black text-slate-900">{getEmployeeName(submission.employee_name)}</span>
              <span className="text-slate-500 font-mono block">#{submission.employee_id}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-bold">{lang === "en" ? "Branch:" : "الفرع:"}</span>
              <span className="font-black text-slate-900">{getBranchName(submission.branch_code, submission.branch_name)}</span>
              <span className="text-slate-500 font-mono block">#{submission.branch_code}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-bold">{lang === "en" ? "Date & Time:" : "التاريخ والوقت:"}</span>
              <span className="font-bold text-slate-800">{new Date(submission.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-bold">{lang === "en" ? "Items Count:" : "عدد المواد:"}</span>
              <span className="font-mono font-black text-violet-700 bg-violet-50 px-2 py-0.5 rounded border border-violet-200 inline-block mt-0.5">
                {submission.details.item_count || submission.details.items?.length || 0} {lang === "en" ? "items" : "منتج"}
              </span>
            </div>
          </div>

          {submission.details.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-950 font-bold">
              <span className="text-amber-700 block mb-0.5">{lang === "en" ? "General Notes:" : "ملاحظات العامة:"}</span>
              {submission.details.notes}
            </div>
          )}

          {/* Items Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className={`w-full ${lang === "ar" ? "text-right" : "text-left"} text-xs`}>
              <thead className="bg-slate-100 text-slate-600 font-black">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">{lang === "en" ? "Code" : "الكود"}</th>
                  <th className="p-3">{lang === "en" ? "Product Name" : "اسم المنتج"}</th>
                  <th className="p-3">{lang === "en" ? "Unit" : "الوحدة"}</th>
                  {submission.type === "cargo_order" ? (
                    <th className="p-3">{lang === "en" ? "Order Qty" : "الكمية المطلوبة"}</th>
                  ) : (
                    <>
                      <th className="p-3">{lang === "en" ? "System Qty" : "السيستم"}</th>
                      <th className="p-3">{lang === "en" ? "Actual Qty" : "الفعلي"}</th>
                      <th className="p-3">{lang === "en" ? "Diff" : "الفرق"}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold text-slate-800">
                {submission.details.items?.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-3 font-mono text-blue-600 font-extrabold">#{item.code}</td>
                    <td className="p-3 font-black text-slate-900">{lang === "en" ? item.nameEn || item.nameAr : item.nameAr}</td>
                    <td className="p-3 text-slate-600">{item.unit || "عدد"}</td>
                    {submission.type === "cargo_order" ? (
                      <td className="p-3">
                        <span className="bg-amber-100 text-amber-950 font-black px-2.5 py-1 rounded-lg font-mono">
                          {item.qty}
                        </span>
                      </td>
                    ) : (
                      <>
                        <td className="p-3 font-mono text-slate-600">{item.systemQty ?? "—"}</td>
                        <td className="p-3 font-mono text-slate-900 font-black">{item.actualQty ?? "—"}</td>
                        <td className="p-3 font-mono">
                          {(() => {
                            const diffVal = item.diff ?? (item.actualQty != null && item.systemQty != null ? item.actualQty - item.systemQty : null);
                            if (diffVal == null) return "—";
                            if (diffVal === 0) return <span className="text-slate-400">0</span>;
                            if (diffVal > 0) return <span className="text-emerald-600 font-black">+{diffVal}</span>;
                            return <span className="text-red-600 font-black">{diffVal}</span>;
                          })()}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          {submission.type === "cargo_order" ? (
            <div className="flex items-center gap-2">
              <button
                onClick={copyOrder}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition text-xs flex items-center gap-1.5 shadow-md"
              >
                <i className="ph-bold ph-copy"></i>
                {lang === "en" ? "Copy Order Text" : "نسخ نص الطلب"}
              </button>
              <button
                onClick={() => {
                  setReceivingSubmission?.(submission);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2 rounded-xl transition text-xs flex items-center gap-1.5 shadow-md"
                title={lang === "en" ? "Receive and intake goods into live stock" : "استلام البضاعة وتوريد الكميات للمخزون"}
              >
                <i className="ph-bold ph-package-receive text-base"></i>
                {lang === "en" ? "Receive & Intake 📥" : "استلام وتوريد للمخزون 📥"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportPdf}
                className="bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 font-bold px-3.5 py-2 rounded-xl transition text-xs flex items-center gap-1.5 shadow-sm"
                title={lang === "en" ? "Save PDF" : "حفظ ملف الجرد PDF"}
              >
                <i className="ph-bold ph-file-pdf"></i>
                {lang === "en" ? "Save PDF" : "حفظ PDF"}
              </button>
              <button
                onClick={handleShare}
                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold px-3.5 py-2 rounded-xl transition text-xs flex items-center gap-1.5 shadow-sm"
                title={lang === "en" ? "Share" : "مشاركة تقرير الجرد"}
              >
                <i className="ph-bold ph-share-network"></i>
                {lang === "en" ? "Share" : "مشاركة"}
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {submission.status === "pending" && (
              <button
                onClick={() => {
                  onMarkReviewed(submission.id);
                  onClose();
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl transition text-xs flex items-center gap-1.5 shadow-md"
              >
                <i className="ph-bold ph-check-circle"></i>
                {lang === "en" ? "Mark as Reviewed" : "تحديد كـ تم الإطلاع"}
              </button>
            )}
            <button
              onClick={onClose}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2 rounded-xl transition text-xs"
            >
              {lang === "en" ? "Close" : "إغلاق"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// InspectAuditModal: شاشة تفاصيل الجرد الكاملة مع تصدير PDF والمشاركة
// ══════════════════════════════════════════════════════════════════════════════
function InspectAuditModal({
  auditId,
  branch,
  onClose,
}: {
  auditId: number;
  branch: BranchRecord;
  onClose: () => void;
}) {
  const { lang, getBranchName, getEmployeeName } = useLanguage();
  const { setSelectedBranch } = useAuth();
  const navigate = useNavigate();

  const auditQuery = trpc.audit.get.useQuery({ id: auditId });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "deficit" | "surplus" | "exact">("all");

  const audit = auditQuery.data?.audit;
  const items = auditQuery.data?.items ?? [];

  const deficitCount = items.filter((r: any) => (r.actualQty ?? 0) < (r.systemQty ?? 0)).length;
  const surplusCount = items.filter((r: any) => (r.actualQty ?? 0) > (r.systemQty ?? 0)).length;
  const exactCount = items.filter((r: any) => r.actualQty === r.systemQty && r.actualQty != null).length;

  const filteredItems = items.filter((item: any) => {
    const s = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !s ||
      item.productName.toLowerCase().includes(s) ||
      item.productCode.toLowerCase().includes(s);
    if (!matchesSearch) return false;

    if (filterType === "deficit") return (item.actualQty ?? 0) < (item.systemQty ?? 0);
    if (filterType === "surplus") return (item.actualQty ?? 0) > (item.systemQty ?? 0);
    if (filterType === "exact") return item.actualQty === item.systemQty && item.actualQty != null;
    return true;
  });

  const handleExportPdf = async () => {
    if (!audit || items.length === 0) return;
    try {
      await generateAuditPdf({
        lang: lang as "ar" | "en",
        auditType: audit.auditType as "weekly" | "monthly",
        auditorName: audit.auditorName || "—",
        createdAt: new Date(audit.createdAt).toISOString(),
        notes: audit.notes || null,
        items: items.map((r: any) => ({
          productCode: r.productCode,
          productName: r.productName,
          category: r.category,
          unit: r.unit,
          systemQty: r.systemQty,
          actualQty: r.actualQty,
          difference: r.actualQty != null && r.systemQty != null ? r.actualQty - r.systemQty : null,
          itemNotes: r.itemNotes || null,
        })),
      });
    } catch (e) {
      alert(lang === "en" ? "Failed to generate PDF" : "تعذر استخراج ملف PDF");
    }
  };

  const handleShare = async () => {
    if (!audit) return;
    const typeStr = audit.auditType === "weekly" ? (lang === "ar" ? "جرد أسبوعي" : "Weekly Audit") : (lang === "ar" ? "جرد شهري" : "Monthly Audit");
    const dateStr = new Date(audit.createdAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US");

    const summaryText = `📋 ${lang === "ar" ? "تقرير جرد دانكن" : "Dunkin Inventory Audit Report"}
🏬 ${lang === "ar" ? "الفرع" : "Branch"}: ${getBranchName(branch.branch_code, branch.branch_name)} (#${branch.branch_code})
🗓️ ${lang === "ar" ? "النوع" : "Type"}: ${typeStr} (${audit.status === "completed" ? (lang === "ar" ? "معتمد" : "Finalized") : (lang === "ar" ? "مسودة" : "Draft")})
👤 ${lang === "ar" ? "المحرر" : "Auditor"}: ${getEmployeeName(audit.auditorName)}
📅 ${lang === "ar" ? "التاريخ" : "Date"}: ${dateStr}
📦 ${lang === "ar" ? "إجمالي الأصناف" : "Total Items"}: ${items.length}
⚠️ ${lang === "ar" ? "أصناف بعجز" : "Deficits"}: ${deficitCount}
📈 ${lang === "ar" ? "أصناف بزيادة" : "Surplus"}: ${surplusCount}
✅ ${lang === "ar" ? "أصناف مطابقة" : "Exact Match"}: ${exactCount}
${audit.notes ? `📝 ${lang === "ar" ? "ملاحظات" : "Notes"}: ${audit.notes}` : ""}
`.trim();

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Dunkin Audit - ${branch.branch_name}`,
          text: summaryText,
        });
        return;
      } catch (e) {}
    }

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(summaryText);
      alert(lang === "ar" ? "تم نسخ تقرير الجرد للحافظة بنجاح للمشاركة!" : "Audit report copied to clipboard!");
    } else {
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(summaryText)}`;
      window.open(waUrl, "_blank");
    }
  };

  const handleEnterBranchAudit = () => {
    setSelectedBranch(branch.branch_code);
    onClose();
    navigate("/audit");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-violet-600 rounded-2xl flex items-center justify-center text-white text-xl shadow-lg shadow-violet-600/30 shrink-0">
              <i className="ph-bold ph-clipboard-text"></i>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded font-bold">
                  #{branch.branch_code}
                </span>
                <span className="font-extrabold text-sm text-slate-200">
                  {getBranchName(branch.branch_code, branch.branch_name)}
                </span>
                {audit && (
                  <>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      audit.auditType === "weekly" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                    }`}>
                      {audit.auditType === "weekly" ? (lang === "en" ? "Weekly Audit" : "جرد أسبوعي") : (lang === "en" ? "Monthly Audit" : "جرد شهري")}
                    </span>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      audit.status === "completed" ? "bg-emerald-600 text-white" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    }`}>
                      {audit.status === "completed" ? (lang === "en" ? "Completed" : "معتمد") : (lang === "en" ? "Draft" : "مسودة")}
                    </span>
                  </>
                )}
              </div>
              {audit && (
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                  <span>{lang === "en" ? "Auditor:" : "المحـرر:"} <strong className="text-slate-200">{getEmployeeName(audit.auditorName)}</strong></span>
                  <span>•</span>
                  <span className="font-mono">{new Date(audit.createdAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={handleExportPdf}
              className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 shadow-md"
              title={lang === "en" ? "Save PDF" : "حفظ ملف الجرد PDF"}
            >
              <i className="ph-bold ph-file-pdf"></i>
              {lang === "en" ? "Save PDF" : "حفظ PDF"}
            </button>
            <button
              onClick={handleShare}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 shadow-md"
              title={lang === "en" ? "Share" : "مشاركة تقرير الجرد"}
            >
              <i className="ph-bold ph-share-network"></i>
              {lang === "en" ? "Share" : "مشاركة"}
            </button>
            <button
              onClick={handleEnterBranchAudit}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 border border-slate-700"
              title={lang === "en" ? "Enter Branch Audit Page" : "دخول صفحة جرد الفرع"}
            >
              <i className="ph-bold ph-sign-in"></i>
              {lang === "en" ? "Open in Branch" : "شاشة الفرع"}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
            >
              <i className="ph-bold ph-x text-lg"></i>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {auditQuery.isLoading ? (
            <div className="py-20 text-center text-slate-400 font-bold">
              <i className="ph-bold ph-spinner animate-spin text-3xl mb-2"></i>
              <p>{lang === "en" ? "Loading audit details..." : "جاري تحميل تفاصيل الجرد..."}</p>
            </div>
          ) : !audit ? (
            <div className="py-16 text-center text-slate-400 font-bold">
              <p>{lang === "en" ? "Audit details not found" : "تعذر العثور على بيانات الجرد"}</p>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-center">
                  <span className="text-xs text-slate-500 font-bold block mb-1">
                    {lang === "en" ? "Total Items" : "إجمالي الأصناف"}
                  </span>
                  <span className="text-xl font-black font-mono text-slate-900">{items.length}</span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center">
                  <span className="text-xs text-emerald-700 font-bold block mb-1">
                    {lang === "en" ? "Exact Matches" : "مطابقة تماماً ✅"}
                  </span>
                  <span className="text-xl font-black font-mono text-emerald-700">{exactCount}</span>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-center">
                  <span className="text-xs text-red-700 font-bold block mb-1">
                    {lang === "en" ? "Deficits" : "أصناف بها عجز ⚠️"}
                  </span>
                  <span className="text-xl font-black font-mono text-red-700">{deficitCount}</span>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-center">
                  <span className="text-xs text-amber-800 font-bold block mb-1">
                    {lang === "en" ? "Surplus" : "أصناف بها زيادة 📈"}
                  </span>
                  <span className="text-xl font-black font-mono text-amber-800">{surplusCount}</span>
                </div>
              </div>

              {/* Search & Filters */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <div className="relative flex-1">
                  <i className="ph-bold ph-magnifying-glass absolute top-1/2 -translate-y-1/2 right-3 text-slate-400"></i>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={lang === "en" ? "Search item name or code..." : "ابحث برقم الصنف أو الاسم..."}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs font-bold focus:outline-none focus:border-violet-500 transition"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-bold">
                  <button
                    onClick={() => setFilterType("all")}
                    className={`px-3 py-1.5 rounded-xl transition ${
                      filterType === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {lang === "en" ? "All" : "الكل"} ({items.length})
                  </button>
                  <button
                    onClick={() => setFilterType("exact")}
                    className={`px-3 py-1.5 rounded-xl transition ${
                      filterType === "exact" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                  >
                    {lang === "en" ? "Exact" : "مطابق"} ({exactCount})
                  </button>
                  <button
                    onClick={() => setFilterType("deficit")}
                    className={`px-3 py-1.5 rounded-xl transition ${
                      filterType === "deficit" ? "bg-red-600 text-white" : "bg-red-50 text-red-700 hover:bg-red-100"
                    }`}
                  >
                    {lang === "en" ? "Deficits" : "عجز"} ({deficitCount})
                  </button>
                  <button
                    onClick={() => setFilterType("surplus")}
                    className={`px-3 py-1.5 rounded-xl transition ${
                      filterType === "surplus" ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-800 hover:bg-amber-100"
                    }`}
                  >
                    {lang === "en" ? "Surplus" : "زيادة"} ({surplusCount})
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right" dir={lang === "ar" ? "rtl" : "ltr"}>
                    <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">{lang === "en" ? "Code" : "كود"}</th>
                        <th className="p-3">{lang === "en" ? "Product Name" : "اسم الصنف"}</th>
                        <th className="p-3">{lang === "en" ? "Category" : "القسم"}</th>
                        <th className="p-3">{lang === "en" ? "Unit" : "الوحدة"}</th>
                        <th className="p-3">{lang === "en" ? "System Qty" : "رصيد النظام"}</th>
                        <th className="p-3">{lang === "en" ? "Actual Qty" : "الرصيد الفعلي"}</th>
                        <th className="p-3">{lang === "en" ? "Diff" : "الفارق"}</th>
                        <th className="p-3">{lang === "en" ? "Notes" : "الملاحظات"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-bold text-slate-800">
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400">
                            {lang === "en" ? "No items matching filter" : "لا توجد أصناف تطابق هذا البحث أو الفلتر"}
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item: any, idx: number) => {
                          const diff = item.actualQty != null && item.systemQty != null ? item.actualQty - item.systemQty : null;
                          return (
                            <tr key={idx} className="hover:bg-slate-50 transition">
                              <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                              <td className="p-3 font-mono text-blue-600 font-black">#{item.productCode}</td>
                              <td className="p-3 font-black text-slate-900">{item.productName}</td>
                              <td className="p-3 text-slate-500">{item.category || "—"}</td>
                              <td className="p-3 text-slate-600">{item.unit || "عدد"}</td>
                              <td className="p-3 font-mono text-slate-600">{item.systemQty ?? "—"}</td>
                              <td className="p-3 font-mono text-slate-950 font-black">{item.actualQty ?? "—"}</td>
                              <td className="p-3 font-mono">
                                {diff == null ? (
                                  <span className="text-slate-400">—</span>
                                ) : diff === 0 ? (
                                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-black">0</span>
                                ) : diff > 0 ? (
                                  <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-black">+{diff}</span>
                                ) : (
                                  <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded font-black">{diff}</span>
                                )}
                              </td>
                              <td className="p-3 text-slate-500 font-medium">{item.itemNotes || "—"}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* General Audit Notes */}
              {audit.notes && (
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 text-xs">
                  <span className="font-extrabold text-amber-900 block mb-1">
                    📝 {lang === "en" ? "Audit General Notes:" : "ملاحظات الجرد العامة:"}
                  </span>
                  <p className="text-amber-800 font-medium">{audit.notes}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportPdf}
              disabled={!audit || items.length === 0}
              className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl transition text-xs flex items-center gap-1.5 shadow-md"
            >
              <i className="ph-bold ph-file-pdf"></i>
              {lang === "en" ? "Save PDF" : "حفظ ملف الجرد PDF"}
            </button>
            <button
              onClick={handleShare}
              disabled={!audit}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl transition text-xs flex items-center gap-1.5 shadow-md"
            >
              <i className="ph-bold ph-share-network"></i>
              {lang === "en" ? "Share Report" : "مشاركة التقرير"}
            </button>
          </div>

          <button
            onClick={onClose}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-2 rounded-xl transition text-xs"
          >
            {lang === "en" ? "Close" : "إغلاق"}
          </button>
        </div>
      </div>
    </div>
  );
}


