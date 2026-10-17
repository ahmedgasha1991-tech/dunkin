import React, { createContext, useContext, useEffect, useState } from "react";

export type Language = "ar" | "en";

export const categoryTranslations: Record<string, string> = {
  "أكواب ساخنة": "Hot Drink Cups",
  "الأكواب الباردة": "Cold Drink Cups",
  "أغطية الأكواب": "Cup Lids",
  "أغلفة وحوامل الأكواب": "Cup Sleeves & Holders",
  "الصناديق والعلب": "Boxes & Containers",
  "أكياس التعبئة والتسوق": "Packaging & Shopping Bags",
  "قهوة وكبسولات": "Coffee & Capsules",
  "الشرابات والصلصات والبودرة": "Syrups, Sauces & Powders",
  "شاي ومشروبات": "Tea & Beverages",
  "أجبان وألبان": "Dairy & Cheeses",
  "مياه وعصائر": "Water & Juices",
  "السكر والمحليات": "Sugar & Sweeteners",
  "مخبوزات وساندوتشات": "Bakery & Sandwiches",
  "كيك وكوكيز ومافن": "Cakes, Cookies & Muffins",
  "دونات فانسى ومميز": "Fancy & Specialty Donuts",
  "مونشكين ودونات عادي": "Munchkins & Regular Donuts",
  "وجبات خفيفة ومكسرات": "Snacks & Nuts",
  "زي الموظفين (Uniform)": "Staff Uniforms",
  "زي الموظفين": "Staff Uniforms",
  "مستلزمات ونظافة": "Supplies & Cleaning",
  "قرطاسية وملصقات": "Stationery & Labels",
  "دواجن ولحوم": "Poultry & Meats",
  "المنظفات والمعقمات": "Detergents & Sanitizers",
  "أكواب وتملبرات مبيعات": "Retail Tumblers & Mugs"
};

export const unitTranslations: Record<string, string> = {
  "حبة": "PCS",
  "شدة": "PKT",
  "مفرود": "Loose",
  "كرتون": "CTN",
  "علبة": "Box",
  "طقم": "Set",
  "كيلو": "Kg",
  "جالون": "Gallon",
  "لتر": "Liter",
  "حبات": "PCS",
  "شدات": "Packs",
  "باكيت": "Pack",
  "باكيتات": "Packs",
  "حبة (PCS)": "PCS",
  "كرتون (CTN)": "CTN",
  "شدة (PKT)": "PKT",
  "باكيت (PKT)": "PKT",
  "حبات منفردة": "Loose Pieces",
  "جميع التصنيفات": "All Categories",
  "جميع الوحدات": "All Units"
};

const translations: Record<Language, Record<string, string>> = {
  ar: {
    appTitle: "إدارة وجرد المخزون",
    savedCloud: "محفوظ سحابيًا",
    items: "صنف",
    orderList: "قائمة الطلب",
    weeklySnapshot: "حفظ جرد أسبوعي",
    monthlySnapshot: "حفظ جرد شهري",
    auditHistory: "سجل الجرد",
    resetQuantities: "تصفير كل الكميات",
    adminPanel: "لوحة الإدارة",
    operationalAudit: "الجرد التشغيلي",
    auditTitle: "نظام الجرد التشغيلي",
    auditSubtitle: "تسجيل جرد المستودع ومطابقة الفعلي بالسيستم",
    searchPlaceholder: "بحث عن منتج برقم الكود أو الاسم...",
    allCategories: "جميع التصنيفات",
    allUnits: "جميع الوحدات",
    loosePieces: "حبات منفردة",
    loose: "مفرود",
    packs: "شدات",
    qty: "الكمية",
    code: "الكود",
    category: "التصنيف",
    actions: "الإجراءات",
    totalProducts: "إجمالي المنتجات",
    categoriesCount: "التصنيفات",
    productImages: "صور المنتجات",
    productCatalog: "قائمة المنتجات",
    addProduct: "إضافة منتج",
    editProduct: "تعديل المنتج",
    deleteProduct: "حذف المنتج",
    confirmDelete: "هل أنت تأكد من الحذف؟",
    confirmReset: "هل أنت متأكد من تصفير جميع الكميات المطلوبة؟",
    cancel: "إلغاء",
    save: "حفظ",
    saving: "جاري الحفظ...",
    imageAvailable: "متاحة",
    imageNone: "لا توجد",
    langBtn: "English (LTR)",
    langTitle: "تغيير اللغة إلى الإنجليزية",
    searchNoResults: "لا توجد نتائج بحث مطابقة",
    orderListEmpty: "قائمة الطلبات فارغة!",
    copySuccess: "تم نسخ قائمة الطلبات بنجاح!",
    copyFail: "فشل النسخ التلقائي",
    nextDayOrder: "قائمة طلبات بضاعة الغد",
    requestedQty: "الكمية المطلوبة",
    auditSetup: "إعداد جرد جديد",
    auditTypeWeekly: "جرد أسبوعي (المنتجات سريعة الاستهلاك)",
    auditTypeMonthly: "جرد شهري شامل (جميع 256 منتج)",
    auditorName: "اسم الشخص المسؤول عن الجرد",
    auditorNamePlaceholder: "مثال: أحمد محمود",
    generalNotes: "ملاحظات عامة (اختياري)",
    startAudit: "بدء الجرد الآن",
    systemQty: "كمية السيستم",
    actualQty: "الفعلي بالحقيقة",
    diff: "الفرق (الزيادة/النقص)",
    notes: "ملاحظات",
    saveDraft: "حفظ كمسودة",
    finalizeAudit: "اعتماد نهائي",
    backToHome: "الرئيسية",
    availableQty: "العدد المتوفر",
    totalStock: "الرصيد الكلي",
    directAudit: "جرد مباشر",
    numPacks: "عدد الباكيتات",
    packSizeLabel: "حبات في الباكيت",
    loosePiecesCount: "حبات مفرطة",
    actualTotal: "الإجمالي الفعلي",
    pcs: "حبة",
    writeCapacity: "اكتب السعة",
    resetAllBtn: "تصفير كامل المخزون"
  },
  en: {
    appTitle: "Inventory Management",
    savedCloud: "Cloud Saved",
    items: "items",
    orderList: "Order List",
    weeklySnapshot: "Save Weekly Audit",
    monthlySnapshot: "Save Monthly Audit",
    auditHistory: "Audit History",
    resetQuantities: "Reset All Quantities",
    resetAllBtn: "Reset All Stock",
    adminPanel: "Admin Panel",
    operationalAudit: "Operational Audit",
    auditTitle: "Operational Audit System",
    auditSubtitle: "Record warehouse inventory and match actual vs system",
    searchPlaceholder: "Search products by code or name...",
    allCategories: "All Categories",
    allUnits: "All Units",
    loosePieces: "Loose Pieces",
    loose: "Loose",
    packs: "Packs",
    qty: "Qty",
    code: "Code",
    category: "Category",
    actions: "Actions",
    totalProducts: "Total Products",
    categoriesCount: "Categories",
    productImages: "Product Images",
    productCatalog: "Product List",
    addProduct: "Add Product",
    editProduct: "Edit Product",
    deleteProduct: "Delete Product",
    confirmDelete: "Are you sure you want to delete?",
    confirmReset: "Are you sure you want to reset all ordered quantities?",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving...",
    imageAvailable: "Available",
    imageNone: "None",
    langBtn: "العربية (RTL)",
    langTitle: "Switch to Arabic",
    searchNoResults: "No matching products found",
    orderListEmpty: "Order list is empty!",
    copySuccess: "Order list copied successfully!",
    copyFail: "Auto copy failed",
    nextDayOrder: "Next Day Cargo Order List",
    requestedQty: "Requested Quantity",
    auditSetup: "Setup New Inventory Audit",
    auditTypeWeekly: "Weekly Audit (Fast Consumables)",
    auditTypeMonthly: "Full Monthly Audit (All 256 Products)",
    auditorName: "Auditor / Manager Name",
    auditorNamePlaceholder: "e.g. Ahmed Mahmoud",
    generalNotes: "General Notes (Optional)",
    startAudit: "Start Audit Now",
    systemQty: "System Qty",
    actualQty: "Actual Count",
    diff: "Diff (+/-)",
    notes: "Notes",
    saveDraft: "Save Draft",
    finalizeAudit: "Finalize Audit",
    backToHome: "Home",
    availableQty: "Available Qty",
    totalStock: "Total Stock",
    directAudit: "Direct Audit",
    numPacks: "Packs Count",
    packSizeLabel: "Pack Capacity",
    loosePiecesCount: "Loose Pieces",
    actualTotal: "Actual Total",
    pcs: "pcs",
    writeCapacity: "Capacity"
  }
};

export const branchTranslations: Record<string, string> = {
  "فرع الرياض الرئيسي - العليا": "Riyadh Main Branch - Olaya",
  "الرياض الرئيسي - العليا": "Riyadh Main Branch - Olaya",
  "فرع جدة - الكورنيش": "Jeddah Branch - Corniche",
  "جدة - الكورنيش": "Jeddah Branch - Corniche",
  "فرع الدمام - الشاطئ": "Dammam Branch - Al Shati",
  "الدمام - الشاطئ": "Dammam Branch - Al Shati",
  "الرياض فرع الديره": "Riyadh Branch - Al Deerah",
  "الرياض فرع الديرة": "Riyadh Branch - Al Deerah",
  "فرع الديره": "Al Deerah Branch",
  "فرع الديرة": "Al Deerah Branch",
  "فرع الخبر": "Al Khobar Branch",
  "فرع مكة": "Makkah Branch",
  "فرع المدينة": "Madinah Branch",
  "فرع الأحساء": "Al Ahsa Branch",
  "فرع الطائف": "Taif Branch",
  "فرع ابها": "Abha Branch",
  "فرع أبحا": "Abha Branch",
  "فرع أبها": "Abha Branch",
  "فرع تبوك": "Tabuk Branch",
  "فرع القصيم": "Qassim Branch",
  "فرع جازان": "Jazan Branch",
  "فرع حائل": "Hail Branch",
  "فرع نجران": "Najran Branch",
};

export const arabicNameDictionary: Record<string, string> = {
  "احمد": "Ahmed",
  "أحمد": "Ahmed",
  "محمود": "Mahmoud",
  "عبدالعزيز": "Abdulaziz",
  "عبد العزيز": "Abdulaziz",
  "سارة": "Sarah",
  "ساره": "Sarah",
  "عبدالله": "Abdullah",
  "عبد الله": "Abdullah",
  "محمد": "Mohammed",
  "علي": "Ali",
  "عليّ": "Ali",
  "العتيبي": "Al-Otaibi",
  "الغامدي": "Al-Ghamdi",
  "الزهراني": "Al-Zahrani",
  "القحطاني": "Al-Qahtani",
  "الشهري": "Al-Shehri",
  "الدوسري": "Al-Dawsari",
  "المطيري": "Al-Mutairi",
  "الحربي": "Al-Harbi",
  "العنزي": "Al-Anazi",
  "الشمري": "Al-Shammari",
  "المالكي": "Al-Malki",
  "السيد": "El-Sayed",
  "مصطفى": "Mustafa",
  "مصطفي": "Mustafa",
  "خالد": "Khaled",
  "عمر": "Omar",
  "عثمان": "Othman",
  "إبراهيم": "Ibrahim",
  "ابراهيم": "Ibrahim",
  "يوسف": "Youssef",
  "طارق": "Tariq",
  "وليد": "Waleed",
  "سعيد": "Saeed",
  "حسن": "Hassan",
  "حسين": "Hussein",
  "راشد": "Rashid",
  "صالح": "Saleh",
  "فهد": "Fahad",
  "سعود": "Saud",
  "تركي": "Turki",
  "بدر": "Badr",
  "عادل": "Adel",
  "سلطان": "Sultan",
  "نايف": "Naif",
  "سامي": "Sami",
  "عبدالرحمن": "Abdulrahman",
  "عبد الرحمن": "Abdulrahman",
  "عبدالمجيد": "Abdulmajeed",
  "عبد المجيد": "Abdulmajeed",
  "عبدالإله": "Abdulelah",
  "عبد الإله": "Abdulelah",
  "زياد": "Ziyad",
  "فراس": "Firas",
  "حمزة": "Hamza",
  "حمزه": "Hamza",
  "ياسر": "Yasser",
  "ماجد": "Majed",
  "هشام": "Hisham",
  "كريم": "Kareem",
  "عمرو": "Amr",
  "أيمن": "Ayman",
  "ايمن": "Ayman",
  "شريف": "Sherif",
  "إسلام": "Islam",
  "اسلام": "Islam",
};

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: (key: string) => string;
  getProductName: (p: any) => string;
  getCategoryName: (cat: string) => string;
  getUnitName: (unit: string, fallbackLabel?: string) => string;
  getBranchName: (code?: string, nameAr?: string) => string;
  getEmployeeName: (nameAr?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const urlLang = urlParams.get("lang");
      if (urlLang === "ar" || urlLang === "en") {
        return urlLang;
      }
      const saved = localStorage.getItem("dunkin_lang");
      if (saved === "ar" || saved === "en") {
        return saved;
      }
    }
    return "ar";
  });

  const applyLangToDOM = (newLang: Language) => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = newLang;
      document.documentElement.dir = newLang === "ar" ? "rtl" : "ltr";
    }
  };

  useEffect(() => {
    applyLangToDOM(lang);
  }, [lang]);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem("dunkin_lang", newLang);
    applyLangToDOM(newLang);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", newLang);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const toggleLang = () => {
    setLang(lang === "ar" ? "en" : "ar");
  };

  const t = (key: string): string => {
    return translations[lang][key] || translations["ar"][key] || key;
  };

  const getProductName = (p: any): string => {
    if (!p) return "";
    if (lang === "en") {
      const en = p.nameEn || p.name_en || p.name_english || p.english_name;
      if (en && typeof en === "string" && en.trim()) {
        return en;
      }
    }
    return p.nameAr || p.name_ar || p.name || "";
  };

  const getCategoryName = (cat: string): string => {
    if (!cat) return "";
    if (lang === "en") {
      if (cat === "ALL" || cat === "جميع التصنيفات") return "All Categories";
      return categoryTranslations[cat] || cat;
    }
    return cat;
  };

  const getUnitName = (unit: string, fallbackLabel?: string): string => {
    const primary = unit || fallbackLabel || "";
    if (!primary) return "";
    if (lang === "en") {
      if (unitTranslations[primary]) return unitTranslations[primary];
      if (fallbackLabel && unitTranslations[fallbackLabel]) return unitTranslations[fallbackLabel];
      const match = primary.match(/\(([A-Za-z0-9\s]+)\)/);
      if (match) return match[1];
    }
    return fallbackLabel || unit || "";
  };

  const getBranchName = (code?: string, nameAr?: string): string => {
    const raw = (nameAr || "").trim();
    if (!raw) return code || "";
    if (lang === "en") {
      if (branchTranslations[raw]) return branchTranslations[raw];
      
      let translated = raw;
      translated = translated.replace(/الرياض/g, "Riyadh");
      translated = translated.replace(/جدة|جده/g, "Jeddah");
      translated = translated.replace(/الدمام/g, "Dammam");
      translated = translated.replace(/الخبر/g, "Al Khobar");
      translated = translated.replace(/مكة|مكه/g, "Makkah");
      translated = translated.replace(/المدينة|المدينه/g, "Madinah");
      translated = translated.replace(/الأحساء|الاحساء/g, "Al Ahsa");
      translated = translated.replace(/الطائف/g, "Taif");
      translated = translated.replace(/أبها|ابها|أبحا/g, "Abha");
      translated = translated.replace(/تبوك/g, "Tabuk");
      translated = translated.replace(/القصيم/g, "Qassim");
      translated = translated.replace(/جازان/g, "Jazan");
      translated = translated.replace(/حائل/g, "Hail");
      translated = translated.replace(/نجران/g, "Najran");
      translated = translated.replace(/الديرة|الديره/g, "Al Deerah");
      translated = translated.replace(/الكورنيش/g, "Corniche");
      translated = translated.replace(/العليا/g, "Olaya");
      translated = translated.replace(/الشاطئ|الشاطئ/g, "Al Shati");
      translated = translated.replace(/فرع/g, "Branch");
      translated = translated.replace(/الرئيسي/g, "Main");

      if (/^[A-Za-z0-9\s\-\._]+$/.test(translated)) {
        return translated;
      }
      return translated;
    }
    return raw;
  };

  const getEmployeeName = (nameAr?: string): string => {
    const raw = (nameAr || "").trim();
    if (!raw) return "";
    if (lang === "en") {
      if (/^[A-Za-z0-9\s\-\._]+$/.test(raw)) {
        return raw;
      }

      const normalized = raw
        .replace(/عبد\s+العزيز/g, "عبدالعزيز")
        .replace(/عبد\s+الله/g, "عبدالله")
        .replace(/عبد\s+الرحمن/g, "عبدالرحمن")
        .replace(/عبد\s+المجيد/g, "عبدالمجيد")
        .replace(/عبد\s+الإله/g, "عبدالإله");

      const parts = normalized.split(/\s+/);
      const translatedParts = parts.map((part) => {
        if (arabicNameDictionary[part]) return arabicNameDictionary[part];
        return part;
      });

      const result = translatedParts.join(" ");
      if (result !== raw) return result;
    }
    return raw;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t, getProductName, getCategoryName, getUnitName, getBranchName, getEmployeeName }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
