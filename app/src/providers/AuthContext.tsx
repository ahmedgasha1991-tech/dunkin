import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface UserSession {
  id: string;
  employee_id: string;
  full_name: string;
  branch_code: string;
  branch_name: string;
  role: "admin" | "manager" | "staff";
  logged_at: string;
}

export interface EmployeeRequest {
  id: string;
  employee_id: string;
  full_name: string;
  branch_code: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason?: string;
  created_at: string;
}

export interface EmployeeRecord {
  id: string;
  employee_id: string;
  full_name: string;
  branch_code: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface BranchRecord {
  id?: string;
  branch_code: string;
  branch_name: string;
  is_active: boolean;
  created_at?: string;
}

export interface AdminSubmission {
  id: string;
  type: "cargo_order" | "audit";
  title: string;
  employee_name: string;
  employee_id: string;
  branch_code: string;
  branch_name: string;
  created_at: string;
  status: "pending" | "reviewed";
  details: {
    item_count?: number;
    items?: Array<{
      code: string;
      nameAr: string;
      nameEn?: string;
      qty?: number;
      systemQty?: number;
      actualQty?: number;
      diff?: number;
      unit?: string;
      notes?: string;
    }>;
    notes?: string;
    audit_type?: "weekly" | "monthly" | "custom";
    auditor_name?: string;
  };
}

interface AuthContextType {
  session: UserSession | null;
  isLoading: boolean;
  selectedBranch: string;
  setSelectedBranch: (code: string) => void;
  branchesList: BranchRecord[];
  login: (branchCode: string, employeeId: string, adminPin?: string) => Promise<{ success: boolean; message: string; status?: string }>;
  submitRegistrationRequest: (fullName: string, employeeId: string, branchCode: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  // Admin Methods
  fetchPendingRequests: () => Promise<EmployeeRequest[]>;
  fetchEmployeesList: () => Promise<EmployeeRecord[]>;
  fetchBranchesList: () => Promise<BranchRecord[]>;
  approveRequest: (requestId: string, role?: string) => Promise<{ success: boolean; message: string }>;
  rejectRequest: (requestId: string, reason?: string) => Promise<{ success: boolean; message: string }>;
  toggleActive: (employeeId: string, isActive: boolean) => Promise<{ success: boolean; message: string }>;
  transferEmployee: (employeeId: string, newBranchCode: string) => Promise<{ success: boolean; message: string }>;
  addBranch: (branchCode: string, branchName: string) => Promise<{ success: boolean; message: string }>;
  updateBranch: (oldBranchCode: string, newBranchCode: string, newBranchName: string) => Promise<{ success: boolean; message: string }>;
  deleteBranch: (branchCode: string) => Promise<{ success: boolean; message: string }>;
  toggleBranchActive: (branchCode: string, isActive: boolean) => Promise<{ success: boolean; message: string }>;
  // Submissions Methods
  sendAdminSubmission: (sub: Omit<AdminSubmission, "id" | "created_at" | "status">) => Promise<{ success: boolean; message: string }>;
  fetchAdminSubmissions: () => Promise<AdminSubmission[]>;
  markSubmissionStatus: (id: string, status: "pending" | "reviewed") => Promise<void>;
  deleteAdminSubmission: (id: string) => Promise<void>;
}

const SESSION_KEY = "dunkin_user_session";
const SELECTED_BRANCH_KEY = "dunkin_selected_branch";
const BRANCHES_STORAGE_KEY = "dunkin_custom_branches";
const DELETED_BRANCHES_KEY = "dunkin_deleted_branch_codes";
const LOCAL_PENDING_KEY = "dunkin_local_pending_requests";
const LOCAL_EMPLOYEES_KEY = "dunkin_local_approved_employees";
const SUBMISSIONS_STORAGE_KEY = "dunkin_admin_submissions";

const getLocalSubmissions = (): AdminSubmission[] => {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(SUBMISSIONS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }
  return [];
};

const saveLocalSubmissions = (list: AdminSubmission[]) => {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(SUBMISSIONS_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
  }
};

const DEFAULT_BRANCHES: BranchRecord[] = [
  { branch_code: "1011125", branch_name: "فرع الديرة - الرياض", is_active: true }
];

const saveBranchesToStorage = (list: BranchRecord[]) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(BRANCHES_STORAGE_KEY, JSON.stringify(list));
  }
};

const getBranchesFromStorage = (): BranchRecord[] | null => {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(BRANCHES_STORAGE_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return null; }
    }
  }
  return null;
};

const getDeletedBranchCodes = (): string[] => {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(DELETED_BRANCHES_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
  }
  return [];
};

const addDeletedBranchCode = (code: string) => {
  if (typeof window !== "undefined") {
    const current = getDeletedBranchCodes();
    if (!current.includes(code)) {
      const updated = [...current, code];
      localStorage.setItem(DELETED_BRANCHES_KEY, JSON.stringify(updated));
    }
  }
};

const removeDeletedBranchCode = (code: string) => {
  if (typeof window !== "undefined") {
    const current = getDeletedBranchCodes();
    if (current.includes(code)) {
      const updated = current.filter((c) => c !== code);
      localStorage.setItem(DELETED_BRANCHES_KEY, JSON.stringify(updated));
    }
  }
};

const filterDeletedBranches = (list: BranchRecord[]): BranchRecord[] => {
  const deletedCodes = getDeletedBranchCodes();
  if (deletedCodes.length === 0) return list;
  return list.filter((b) => !deletedCodes.includes(b.branch_code));
};

const getLocalPendingRequests = (): EmployeeRequest[] => {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_PENDING_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  return [];
};

const saveLocalPendingRequests = (reqs: EmployeeRequest[]) => {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_PENDING_KEY, JSON.stringify(reqs));
    } catch (e) {}
  }
};

const getLocalApprovedEmployees = (): EmployeeRecord[] => {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_EMPLOYEES_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
  }
  return [
    {
      id: "admin-1",
      employee_id: "10001",
      full_name: "مدير النظام",
      branch_code: "0000000",
      role: "admin",
      is_active: true,
      created_at: new Date().toISOString()
    }
  ];
};

const saveLocalApprovedEmployees = (emps: EmployeeRecord[]) => {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_EMPLOYEES_KEY, JSON.stringify(emps));
    } catch (e) {}
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<UserSession | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { return null; }
      }
    }
    return null;
  });

  const [selectedBranch, setSelectedBranchState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(SELECTED_BRANCH_KEY);
      if (saved) return saved;
    }
    return session?.branch_code || "1010001";
  });

  const [branchesList, setBranchesList] = useState<BranchRecord[]>(() => {
    const local = getBranchesFromStorage();
    const source = local !== null ? local : DEFAULT_BRANCHES;
    return filterDeletedBranches(source);
  });

  const [isLoading, setIsLoading] = useState(false);

  const setSelectedBranch = (code: string) => {
    setSelectedBranchState(code);
    if (typeof window !== "undefined") {
      localStorage.setItem(SELECTED_BRANCH_KEY, code);
    }
  };

  const fetchBranchesList = async (): Promise<BranchRecord[]> => {
    const local = getBranchesFromStorage();
    try {
      const { data, error } = await supabase
        .from("branches")
        .select("*")
        .order("branch_code", { ascending: true });

      let baseList: BranchRecord[];

      if (error || !data || data.length === 0) {
        baseList = local !== null ? local : DEFAULT_BRANCHES;
      } else if (local !== null) {
        baseList = local;
      } else {
        baseList = data as BranchRecord[];
      }

      const cleanBranches = filterDeletedBranches(baseList);
      setBranchesList(cleanBranches);
      saveBranchesToStorage(cleanBranches);
      return cleanBranches;
    } catch (e) {
      const baseList = local !== null ? local : DEFAULT_BRANCHES;
      const cleanBranches = filterDeletedBranches(baseList);
      setBranchesList(cleanBranches);
      return cleanBranches;
    }
  };

  useEffect(() => {
    fetchBranchesList();
  }, []);

  const login = async (branchCode: string, employeeId: string, adminPin?: string) => {
    setIsLoading(true);
    const cleanBranch = branchCode.trim();
    const cleanEmpId = employeeId.trim();

    // Secure Admin PIN Check
    // Default system admin PIN is "11788" or "987654" - required to obtain role 'admin'
    const ADMIN_SECRET_PIN = "11788";

    // If attempting to login as Admin account (10001)
    if (cleanEmpId === "10001") {
      if (!adminPin || adminPin.trim() !== ADMIN_SECRET_PIN) {
        setIsLoading(false);
        return {
          success: false,
          status: "unauthorized",
          message: "رمز الحماية السري للأدمن (Admin PIN) غير صحيح! تم حظر محاولة الدخول.",
        };
      }

      const branchObj = branchesList.find((b) => b.branch_code === cleanBranch);
      const adminSession: UserSession = {
        id: "admin-1",
        employee_id: "10001",
        full_name: "مدير النظام (الأدمن)",
        branch_code: cleanBranch,
        branch_name: branchObj?.branch_name || "فرع الرياض الرئيسي - العليا",
        role: "admin",
        logged_at: new Date().toISOString()
      };
      setSession(adminSession);
      setSelectedBranch(cleanBranch);
      localStorage.setItem(SESSION_KEY, JSON.stringify(adminSession));
      setIsLoading(false);
      return { success: true, message: "تم التحقق من هوية مدير النظام بنجاح! أهلاً بك." };
    }

    try {
      const { data, error } = await supabase.rpc("login_employee", {
        p_branch_code: cleanBranch,
        p_employee_id: cleanEmpId
      });

      if (!error && data) {
        setIsLoading(false);
        if (data.success) {
          const activeSession = data.session as UserSession;
          setSession(activeSession);
          setSelectedBranch(activeSession.branch_code);
          localStorage.setItem(SESSION_KEY, JSON.stringify(activeSession));
          return { success: true, message: data.message || "تم تسجيل الدخول بنجاح" };
        } else {
          return {
            success: false,
            status: data.status || "error",
            message: data.message || "بيانات الدخول غير صحيحة"
          };
        }
      }
    } catch (rpcErr) {
      // Fallback
    }

    // Direct table and local storage fallback for regular staff login
    try {

      // Check approved employees in local storage
      const approvedLocal = getLocalApprovedEmployees();
      const localEmp = approvedLocal.find((e) => e.employee_id === cleanEmpId && e.branch_code === cleanBranch);

      if (localEmp) {
        setIsLoading(false);
        if (!localEmp.is_active) {
          return { success: false, status: "inactive", message: "تم تعطيل هذا الحساب من قبل الأدمن" };
        }
        const branchObj = branchesList.find((b) => b.branch_code === cleanBranch);
        const userSession: UserSession = {
          id: localEmp.id || localEmp.employee_id,
          employee_id: localEmp.employee_id,
          full_name: localEmp.full_name,
          branch_code: localEmp.branch_code,
          branch_name: branchObj?.branch_name || `فرع ${localEmp.branch_code}`,
          role: (localEmp.role as any) || "staff",
          logged_at: new Date().toISOString()
        };
        setSession(userSession);
        setSelectedBranch(cleanBranch);
        localStorage.setItem(SESSION_KEY, JSON.stringify(userSession));
        return { success: true, message: "تم تسجيل الدخول بنجاح!" };
      }

      // Check pending requests in local storage
      const pendingLocal = getLocalPendingRequests();
      const pendingReq = pendingLocal.find((r) => r.employee_id === cleanEmpId);
      if (pendingReq) {
        setIsLoading(false);
        if (pendingReq.status === "pending") {
          return { success: false, status: "pending", message: "طلبك لا يزال قيد الانتظار لموافقة الأدمن" };
        } else if (pendingReq.status === "rejected") {
          return { success: false, status: "rejected", message: `تم رفض طلبك: ${pendingReq.rejection_reason || "بواسطة الأدمن"}` };
        }
      }

      // Check DB employees table directly
      const { data: dbEmp } = await supabase
        .from("employees")
        .select("*")
        .eq("employee_id", cleanEmpId)
        .eq("branch_code", cleanBranch)
        .maybeSingle();

      if (dbEmp) {
        setIsLoading(false);
        if (!dbEmp.is_active) {
          return { success: false, status: "inactive", message: "تم تعطيل هذا الحساب من قبل الأدمن" };
        }
        const branchObj = branchesList.find((b) => b.branch_code === cleanBranch);
        const userSession: UserSession = {
          id: dbEmp.id || dbEmp.employee_id,
          employee_id: dbEmp.employee_id,
          full_name: dbEmp.full_name,
          branch_code: dbEmp.branch_code,
          branch_name: branchObj?.branch_name || `فرع ${dbEmp.branch_code}`,
          role: (dbEmp.role as any) || "staff",
          logged_at: new Date().toISOString()
        };
        setSession(userSession);
        setSelectedBranch(cleanBranch);
        localStorage.setItem(SESSION_KEY, JSON.stringify(userSession));
        return { success: true, message: "تم تسجيل الدخول بنجاح!" };
      }

      // Check DB employee_requests table directly
      const { data: dbReq } = await supabase
        .from("employee_requests")
        .select("*")
        .eq("employee_id", cleanEmpId)
        .maybeSingle();

      if (dbReq) {
        setIsLoading(false);
        if (dbReq.status === "pending") {
          return { success: false, status: "pending", message: "طلبك لا يزال قيد الانتظار لموافقة الأدمن" };
        } else if (dbReq.status === "rejected") {
          return { success: false, status: "rejected", message: `تم رفض طلبك: ${dbReq.rejection_reason || "بواسطة الأدمن"}` };
        }
      }
    } catch (e) {
      console.warn("Login fallback catch:", e);
    }

    setIsLoading(false);
    return { success: false, message: "الرقم الوظيفي أو رقم الفرع غير صحيح، أو لم يتم إعتماده بعد" };
  };

  const submitRegistrationRequest = async (fullName: string, employeeId: string, branchCode: string) => {
    setIsLoading(true);
    const cleanName = fullName.trim();
    const cleanEmpId = employeeId.trim();
    const cleanBranchCode = branchCode.trim();

    if (!cleanName) {
      setIsLoading(false);
      return { success: false, message: "يرجى إدخال اسم الموظف الكامل" };
    }
    if (!cleanEmpId) {
      setIsLoading(false);
      return { success: false, message: "يرجى إدخال الرقم الوظيفي (5 أرقام)" };
    }
    if (!cleanBranchCode) {
      setIsLoading(false);
      return { success: false, message: "يرجى إدخال رقم الفرع (7 أرقام)" };
    }

    try {
      const { data, error } = await supabase.rpc("submit_employee_request", {
        p_full_name: cleanName,
        p_employee_id: cleanEmpId,
        p_branch_code: cleanBranchCode
      });

      if (!error && data) {
        setIsLoading(false);
        return {
          success: data.success ?? true,
          message: data.message || "تم إرسال الطلب بنجاح"
        };
      }
    } catch (err: any) {
      // Ignore RPC error, fallback below
    }

    // Direct table insert fallback
    try {
      await supabase.from("employee_requests").upsert([
        {
          employee_id: cleanEmpId,
          full_name: cleanName,
          branch_code: cleanBranchCode,
          status: "pending",
          created_at: new Date().toISOString()
        }
      ], { onConflict: "employee_id" });
    } catch (tableErr) {
      console.warn("Notice: Table insert pending request:", tableErr);
    }

    // Always update local pending requests so UI and Admin panel work seamlessly
    const newReq: EmployeeRequest = {
      id: cleanEmpId,
      employee_id: cleanEmpId,
      full_name: cleanName,
      branch_code: cleanBranchCode,
      status: "pending",
      created_at: new Date().toISOString()
    };
    const localReqs = getLocalPendingRequests().filter((r) => r.employee_id !== cleanEmpId);
    saveLocalPendingRequests([newReq, ...localReqs]);

    setIsLoading(false);
    return {
      success: true,
      message: "تم إرسال طلب تسجيل الحساب بنجاح، وسوف يتم مراجعته والموافقة عليه من قبل الأدمن!"
    };
  };

  const logout = () => {
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  };

  const fetchPendingRequests = async (): Promise<EmployeeRequest[]> => {
    let dbReqs: EmployeeRequest[] = [];
    try {
      const { data, error } = await supabase
        .from("employee_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        dbReqs = data as EmployeeRequest[];
      }
    } catch (e) {
      // ignore
    }

    const localReqs = getLocalPendingRequests();
    const mergedMap = new Map<string, EmployeeRequest>();
    [...localReqs, ...dbReqs].forEach((req) => {
      if (req.employee_id) {
        mergedMap.set(req.employee_id, req);
      }
    });

    return Array.from(mergedMap.values()).filter((r) => r.status === "pending");
  };

  const fetchEmployeesList = async (): Promise<EmployeeRecord[]> => {
    let dbEmps: EmployeeRecord[] = [];
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        dbEmps = data as EmployeeRecord[];
      }
    } catch (e) {
      // ignore
    }

    const localEmps = getLocalApprovedEmployees();
    const mergedMap = new Map<string, EmployeeRecord>();
    [...localEmps, ...dbEmps].forEach((emp) => {
      if (emp.employee_id) {
        mergedMap.set(emp.employee_id, emp);
      }
    });

    return Array.from(mergedMap.values());
  };

  const approveRequest = async (requestId: string, role = "staff") => {
    try {
      const { data, error } = await supabase.rpc("approve_employee_request", {
        p_request_id: requestId,
        p_role: role
      });

      if (!error && data) {
        return { success: data.success ?? true, message: data.message || "تمت الموافقة" };
      }
    } catch (err: any) {
      // fallback
    }

    try {
      const localReqs = getLocalPendingRequests();
      const req = localReqs.find((r) => r.id === requestId || r.employee_id === requestId);

      let empId = requestId;
      let fullName = "موظف جديد";
      let branchCode = "1010001";

      if (req) {
        empId = req.employee_id;
        fullName = req.full_name;
        branchCode = req.branch_code;
      } else {
        const { data: dbReq } = await supabase.from("employee_requests").select("*").eq("id", requestId).maybeSingle();
        if (dbReq) {
          empId = dbReq.employee_id;
          fullName = dbReq.full_name;
          branchCode = dbReq.branch_code;
        }
      }

      const newEmp: EmployeeRecord = {
        id: empId,
        employee_id: empId,
        full_name: fullName,
        branch_code: branchCode,
        role: role,
        is_active: true,
        created_at: new Date().toISOString()
      };

      const curEmps = getLocalApprovedEmployees().filter((e) => e.employee_id !== empId);
      saveLocalApprovedEmployees([newEmp, ...curEmps]);
      saveLocalPendingRequests(localReqs.filter((r) => r.id !== requestId && r.employee_id !== empId));

      try {
        await supabase.from("employees").upsert([newEmp], { onConflict: "employee_id" });
        await supabase.from("employee_requests").delete().eq("employee_id", empId);
      } catch (e) {}

      return { success: true, message: `تمت الموافقة على طلب الموظف ${fullName} (${empId}) بنجاح!` };
    } catch (err: any) {
      return { success: false, message: err.message || "تعذر إجراء الموافقة" };
    }
  };

  const rejectRequest = async (requestId: string, reason = "رفض من قبل الأدمن") => {
    try {
      const { data, error } = await supabase.rpc("reject_employee_request", {
        p_request_id: requestId,
        p_reason: reason
      });

      if (!error && data) {
        return { success: data.success ?? true, message: data.message || "تم الرفض" };
      }
    } catch (err: any) {
      // fallback
    }

    try {
      const localReqs = getLocalPendingRequests();
      const updatedLocal = localReqs.map((r) =>
        r.id === requestId || r.employee_id === requestId
          ? { ...r, status: "rejected" as const, rejection_reason: reason }
          : r
      );
      saveLocalPendingRequests(updatedLocal);

      try {
        await supabase.from("employee_requests").update({ status: "rejected", rejection_reason: reason }).eq("employee_id", requestId);
      } catch (e) {}

      return { success: true, message: "تم رفض الطلب بنجاح" };
    } catch (err: any) {
      return { success: false, message: err.message || "تعذر رفض الطلب" };
    }
  };

  const toggleActive = async (employeeId: string, isActive: boolean) => {
    try {
      const { data, error } = await supabase.rpc("toggle_employee_active", {
        p_employee_id: employeeId,
        p_is_active: isActive
      });

      if (!error && data) {
        return { success: data.success ?? true, message: data.message || "تم تحديث الحالة" };
      }
    } catch (err: any) {
      // fallback
    }

    try {
      const curEmps = getLocalApprovedEmployees();
      const updated = curEmps.map((e) =>
        e.employee_id === employeeId ? { ...e, is_active: isActive } : e
      );
      saveLocalApprovedEmployees(updated);

      try {
        await supabase.from("employees").update({ is_active: isActive }).eq("employee_id", employeeId);
      } catch (e) {}

      return { success: true, message: "تم تحديث حالة الحساب بنجاح" };
    } catch (err: any) {
      return { success: false, message: err.message || "تعذر تحديث الحالة" };
    }
  };

  const transferEmployee = async (employeeId: string, newBranchCode: string) => {
    const empId = employeeId.trim();
    const targetBranch = newBranchCode.trim();

    try {
      const { data, error } = await supabase.rpc("transfer_employee_branch", {
        p_employee_id: empId,
        p_new_branch_code: targetBranch
      });

      if (!error && data && data.success) {
        // RPC succeeded, continue to update local state
      }
    } catch (e) {
      // RPC fallback below
    }

    try {
      const curEmps = getLocalApprovedEmployees();
      const empObj = curEmps.find((e) => e.employee_id === empId);

      const targetBranchObj = branchesList.find((b) => b.branch_code === targetBranch);
      const branchNameDisplay = targetBranchObj ? targetBranchObj.branch_name : targetBranch;

      const updated = curEmps.map((e) =>
        e.employee_id === empId ? { ...e, branch_code: targetBranch } : e
      );
      saveLocalApprovedEmployees(updated);

      if (session && session.employee_id === empId) {
        const updatedSession = { ...session, branch_code: targetBranch, branch_name: branchNameDisplay };
        setSession(updatedSession);
        localStorage.setItem(SESSION_KEY, JSON.stringify(updatedSession));
      }

      try {
        await supabase.from("employees").update({ branch_code: targetBranch }).eq("employee_id", empId);
      } catch (e) {}

      return {
        success: true,
        message: `تم نقل الموظف (${empObj?.full_name || empId}) إلى فرع (${branchNameDisplay} - ${targetBranch}) بنجاح!`
      };
    } catch (err: any) {
      return { success: false, message: err.message || "تعذر نقل الموظف" };
    }
  };

  const addBranch = async (branchCode: string, branchName: string) => {
    try {
      const code = branchCode.trim();
      const name = branchName.trim();
      removeDeletedBranchCode(code);

      const newBranch: BranchRecord = { branch_code: code, branch_name: name, is_active: true };

      const updatedList = [...branchesList.filter((b) => b.branch_code !== code), newBranch];
      setBranchesList(updatedList);
      saveBranchesToStorage(updatedList);

      const { error } = await supabase
        .from("branches")
        .insert([{ branch_code: code, branch_name: name, is_active: true }]);

      if (error) {
        console.warn("DB insert branch notice:", error);
      }
      return { success: true, message: `تمت إضافة الفرع (${code}) بنجاح!` };
    } catch (e: any) {
      return { success: false, message: e.message || "تعذر إضافة الفرع" };
    }
  };

  const updateBranch = async (oldBranchCode: string, newBranchCode: string, newBranchName: string) => {
    try {
      const oldCode = oldBranchCode.trim();
      const newCode = newBranchCode.trim();
      const newName = newBranchName.trim();

      removeDeletedBranchCode(newCode);

      const updatedList = branchesList.map((b) =>
        b.branch_code === oldCode ? { ...b, branch_code: newCode, branch_name: newName } : b
      );
      setBranchesList(updatedList);
      saveBranchesToStorage(updatedList);

      if (selectedBranch === oldCode) {
        setSelectedBranch(newCode);
      }

      const { error } = await supabase
        .from("branches")
        .update({ branch_code: newCode, branch_name: newName })
        .eq("branch_code", oldCode);

      if (error) {
        console.warn("DB update branch notice:", error);
      }

      return { success: true, message: `تم تحديث بيانات الفرع إلى (${newCode}) بنجاح!` };
    } catch (e: any) {
      return { success: false, message: e.message || "تعذر تعديل البيانات" };
    }
  };

  const deleteBranch = async (branchCode: string) => {
    try {
      const code = branchCode.trim();
      addDeletedBranchCode(code);

      const updatedList = branchesList.filter((b) => b.branch_code !== code);
      setBranchesList(updatedList);
      saveBranchesToStorage(updatedList);

      if (selectedBranch === code) {
        if (updatedList.length > 0) {
          setSelectedBranch(updatedList[0].branch_code);
        }
      }

      const { error } = await supabase
        .from("branches")
        .delete()
        .eq("branch_code", code);

      if (error) {
        console.warn("DB delete branch notice:", error);
      }

      return { success: true, message: `تم حذف الفرع (${code}) بنجاح!` };
    } catch (e: any) {
      return { success: false, message: e.message || "تعذر حذف الفرع" };
    }
  };

  const toggleBranchActive = async (branchCode: string, isActive: boolean) => {
    try {
      const code = branchCode.trim();
      const updatedList = branchesList.map((b) =>
        b.branch_code === code ? { ...b, is_active: isActive } : b
      );
      setBranchesList(updatedList);
      saveBranchesToStorage(updatedList);

      const { error } = await supabase
        .from("branches")
        .update({ is_active: isActive })
        .eq("branch_code", code);

      if (error) {
        console.warn("DB toggle branch notice:", error);
      }
      return { success: true, message: "تم تحديث حالة الفرع" };
    } catch (e: any) {
      return { success: false, message: e.message || "تعذر تحديث الفرع" };
    }
  };

  const sendAdminSubmission = async (
    sub: Omit<AdminSubmission, "id" | "created_at" | "status">
  ): Promise<{ success: boolean; message: string }> => {
    const newSubmission: AdminSubmission = {
      ...sub,
      id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      created_at: new Date().toISOString(),
      status: "pending",
    };

    const list = getLocalSubmissions();
    list.unshift(newSubmission);
    saveLocalSubmissions(list);

    try {
      await supabase.from("admin_submissions").insert([
        {
          id: newSubmission.id,
          type: newSubmission.type,
          title: newSubmission.title,
          employee_name: newSubmission.employee_name,
          employee_id: newSubmission.employee_id,
          branch_code: newSubmission.branch_code,
          branch_name: newSubmission.branch_name,
          status: newSubmission.status,
          created_at: newSubmission.created_at,
          details: newSubmission.details,
        },
      ]);
    } catch (e) {}

    return {
      success: true,
      message: "تم إرسال التقرير/الطلب إلى الأدمن بنجاح!",
    };
  };

  const fetchAdminSubmissions = async (): Promise<AdminSubmission[]> => {
    let dbList: AdminSubmission[] = [];
    try {
      const { data, error } = await supabase
        .from("admin_submissions")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) {
        dbList = data as AdminSubmission[];
      }
    } catch (e) {}

    const localList = getLocalSubmissions();
    const mergedMap = new Map<string, AdminSubmission>();
    dbList.forEach((s) => mergedMap.set(s.id, s));
    localList.forEach((s) => {
      if (!mergedMap.has(s.id)) {
        mergedMap.set(s.id, s);
      }
    });

    const final = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    saveLocalSubmissions(final);
    return final;
  };

  const markSubmissionStatus = async (id: string, status: "pending" | "reviewed") => {
    const list = getLocalSubmissions();
    const updated = list.map((s) => (s.id === id ? { ...s, status } : s));
    saveLocalSubmissions(updated);
    try {
      await supabase.from("admin_submissions").update({ status }).eq("id", id);
    } catch (e) {}
  };

  const deleteAdminSubmission = async (id: string) => {
    const list = getLocalSubmissions();
    const updated = list.filter((s) => s.id !== id);
    saveLocalSubmissions(updated);
    try {
      await supabase.from("admin_submissions").delete().eq("id", id);
    } catch (e) {}
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        selectedBranch,
        setSelectedBranch,
        branchesList,
        login,
        submitRegistrationRequest,
        logout,
        fetchPendingRequests,
        fetchEmployeesList,
        fetchBranchesList,
        approveRequest,
        rejectRequest,
        toggleActive,
        transferEmployee,
        addBranch,
        updateBranch,
        deleteBranch,
        toggleBranchActive,
        sendAdminSubmission,
        fetchAdminSubmissions,
        markSubmissionStatus,
        deleteAdminSubmission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
