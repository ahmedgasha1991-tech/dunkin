/**
 * auditPdfGenerator.ts
 * ────────────────────────────────────────────────────────────────────
 * يولّد تقرير PDF لجرد الكميات التشغيلي باستخدام HTML + CSS Print
 * لضمان دعم اللغة العربية RTL بشكل صحيح (خط Cairo من Google Fonts)
 * ────────────────────────────────────────────────────────────────────
 */

export interface AuditItemRow {
  productCode: string;
  productName: string;
  category: string;
  unit: string;
  systemQty: number | null;
  actualQty: number | null;
  difference: number | null;
  itemNotes?: string | null;
}

export interface AuditPdfOptions {
  lang?: "ar" | "en";
  auditType: "weekly" | "monthly" | "custom";
  auditorName: string;
  createdAt: string;
  notes?: string | null;
  items: AuditItemRow[];
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      calendar: "gregory",
      numberingSystem: "latn",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function diffLabel(diff: number | null): string {
  if (diff === null) return "—";
  if (diff > 0) return `+${diff}`;
  return String(diff);
}

function diffClass(diff: number | null): string {
  if (diff === null) return "";
  if (diff < 0) return "deficit";
  if (diff > 0) return "surplus";
  return "exact";
}

export async function generateAuditPdf(options: AuditPdfOptions): Promise<void> {
  const { lang = "ar", auditType, auditorName, createdAt, notes, items } = options;
  const isEn = lang === "en";

  const typeDisplay = isEn
    ? auditType === "weekly"
      ? "Weekly Inventory Audit"
      : auditType === "custom"
        ? "Custom Selected Audit"
        : "Monthly Full Audit"
    : auditType === "weekly"
      ? "الجرد الأسبوعي"
      : auditType === "custom"
        ? "جرد مخصص (حسب التحديد)"
        : "الجرد الشهري";

  const dateStr = isEn
    ? new Date(createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : formatDate(createdAt);

  const deficitCount = items.filter((r) => (r.difference ?? 0) < 0).length;
  const surplusCount = items.filter((r) => (r.difference ?? 0) > 0).length;
  const exactCount = items.filter((r) => r.difference === 0).length;

  const tableRows = items
    .map((item, idx) => {
      const cls = diffClass(item.difference);
      const rowClass = cls === "deficit" ? ' class="row-deficit"' : "";
      return `
      <tr${rowClass}>
        <td class="num">${idx + 1}</td>
        <td class="item-name">
          <div class="name-ar">${item.productName}</div>
          <div class="name-code">#${item.productCode}</div>
        </td>
        <td class="cat">${item.category}</td>
        <td class="center">${item.unit}</td>
        <td class="center qty-sys">${item.systemQty ?? "—"}</td>
        <td class="center qty-act">${item.actualQty ?? "—"}</td>
        <td class="center diff ${cls}">${diffLabel(item.difference)}</td>
        <td class="note-cell">${item.itemNotes ?? ""}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html dir="${isEn ? "ltr" : "rtl"}" lang="${isEn ? "en" : "ar"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${isEn ? "Inventory Audit Report — Dunkin" : "تقرير الجرد — Dunkin"}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: ${isEn ? "'Inter', Arial, sans-serif" : "'Cairo', Arial, sans-serif"};
      direction: ${isEn ? "ltr" : "rtl"};
      color: #1e293b;
      background: #fff;
      font-size: 12px;
    }

    .header {
      background: #ff6700;
      color: #fff;
      padding: 14px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-brand {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 1px;
    }
    .header-type {
      font-size: 14px;
      font-weight: 700;
      background: rgba(255,255,255,0.2);
      padding: 4px 12px;
      border-radius: 20px;
    }

    .info-bar {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      margin: 16px 24px 0;
      border-radius: 8px;
      padding: 12px 16px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 24px;
    }
    .info-row { display: flex; align-items: center; gap: 6px; }
    .info-label { color: #64748b; font-size: 11px; }
    .info-value { font-weight: 700; font-size: 12px; color: #1e293b; }

    .summary {
      margin: 12px 24px 0;
      display: flex;
      gap: 10px;
    }
    .summary-card {
      flex: 1;
      border-radius: 8px;
      padding: 10px 14px;
      text-align: center;
      border: 1px solid;
    }
    .summary-card .s-num { font-size: 20px; font-weight: 900; }
    .summary-card .s-lbl { font-size: 10px; color: #64748b; margin-top: 2px; }
    .card-deficit { background: #fff1f2; border-color: #fecaca; }
    .card-deficit .s-num { color: #b91c1c; }
    .card-surplus { background: #f0fdf4; border-color: #bbf7d0; }
    .card-surplus .s-num { color: #15803d; }
    .card-exact   { background: #eff6ff; border-color: #bfdbfe; }
    .card-exact .s-num { color: #1d4ed8; }
    .card-total   { background: #f8fafc; border-color: #e2e8f0; }
    .card-total .s-num { color: #1e293b; }

    .table-wrap {
      margin: 14px 24px 0;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    thead tr {
      background: #1e293b;
      color: #fff;
    }
    thead th {
      padding: 9px 8px;
      text-align: ${isEn ? "left" : "right"};
      font-weight: 700;
      font-size: 10.5px;
      white-space: nowrap;
    }
    thead th.center { text-align: center; }

    tbody tr { border-bottom: 1px solid #f1f5f9; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody tr.row-deficit { background: #fff1f2 !important; }

    td { padding: 7px 8px; vertical-align: middle; }
    td.num { text-align: center; color: #94a3b8; font-size: 10px; width: 30px; }
    td.center { text-align: center; }
    td.item-name { max-width: 180px; text-align: ${isEn ? "left" : "right"}; }
    td.cat { font-size: 10px; color: #475569; max-width: 120px; text-align: ${isEn ? "left" : "right"}; }
    td.note-cell { font-size: 10px; color: #64748b; max-width: 100px; text-align: ${isEn ? "left" : "right"}; }

    .name-ar { font-weight: 600; font-size: 11px; color: #1e293b; line-height: 1.4; }
    .name-code { font-size: 9px; color: #94a3b8; font-family: monospace; }

    .qty-sys { color: #475569; font-weight: 600; }
    .qty-act { color: #1e293b; font-weight: 700; }

    td.diff { font-weight: 900; font-size: 12px; white-space: nowrap; }
    td.diff.deficit { color: #b91c1c; background: #fef2f2; }
    td.diff.surplus { color: #15803d; }
    td.diff.exact   { color: #1d4ed8; }

    .notes-section {
      margin: 16px 24px 0;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 16px;
      background: #f8fafc;
      min-height: 50px;
    }
    .notes-title { font-weight: 700; color: #475569; font-size: 11px; margin-bottom: 6px; }
    .notes-text  { color: #1e293b; font-size: 11px; line-height: 1.7; }

    .signatures {
      margin: 16px 24px 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .sig-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      background: #f8fafc;
    }
    .sig-title { font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 30px; }
    .sig-line  { border-top: 1.5px solid #cbd5e1; padding-top: 6px; font-size: 10px; color: #94a3b8; }

    .footer {
      margin: 14px 24px 16px;
      text-align: center;
      color: #94a3b8;
      font-size: 10px;
      border-top: 1px solid #f1f5f9;
      padding-top: 10px;
    }

    @media print {
      @page {
        size: A4 portrait;
        margin: 10mm 12mm;
      }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      tbody tr.row-deficit { background: #fff1f2 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      td.diff.deficit { background: #fef2f2 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      thead tr { background: #1e293b !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-brand">DUNKIN'</div>
    <div class="header-type">${typeDisplay}</div>
  </div>

  <!-- Audit Info -->
  <div class="info-bar">
    <div class="info-row">
      <span class="info-label">${isEn ? "Date:" : "التاريخ:"}</span>
      <span class="info-value">${dateStr}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${isEn ? "Total Items:" : "إجمالي الأصناف:"}</span>
      <span class="info-value">${items.length} ${isEn ? "items" : "صنف"}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${isEn ? "Auditor:" : "القائم بالجرد:"}</span>
      <span class="info-value">${auditorName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">${isEn ? "Audit Type:" : "نوع الجرد:"}</span>
      <span class="info-value">${typeDisplay}</span>
    </div>
  </div>

  <!-- Summary Stats -->
  <div class="summary">
    <div class="summary-card card-total">
      <div class="s-num">${items.length}</div>
      <div class="s-lbl">${isEn ? "Total Items" : "إجمالي الأصناف"}</div>
    </div>
    <div class="summary-card card-deficit">
      <div class="s-num">${deficitCount}</div>
      <div class="s-lbl">${isEn ? "Deficits 🔴" : "أصناف بعجز 🔴"}</div>
    </div>
    <div class="summary-card card-surplus">
      <div class="s-num">${surplusCount}</div>
      <div class="s-lbl">${isEn ? "Surpluses 🟢" : "أصناف بزيادة 🟢"}</div>
    </div>
    <div class="summary-card card-exact">
      <div class="s-num">${exactCount}</div>
      <div class="s-lbl">${isEn ? "Exact Matches ✓" : "مطابق تماماً ✓"}</div>
    </div>
  </div>

  <!-- Main Table -->
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th class="center">#</th>
          <th>${isEn ? "Product Name & Code" : "اسم الصنف والرمز"}</th>
          <th>${isEn ? "Category" : "التصنيف"}</th>
          <th class="center">${isEn ? "Unit" : "الوحدة"}</th>
          <th class="center">${isEn ? "System Qty" : "رصيد السستم"}</th>
          <th class="center">${isEn ? "Actual Qty" : "الرصيد الفعلي"}</th>
          <th class="center">${isEn ? "Diff (+/-)" : "الفرق"}</th>
          <th>${isEn ? "Notes" : "ملاحظات"}</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </div>

  <!-- Notes Section -->
  <div class="notes-section">
    <div class="notes-title">${isEn ? "General Audit Notes" : "ملاحظات الجرد العامة"}</div>
    <div class="notes-text">${notes?.trim() ? notes : (isEn ? "No notes added" : "لا توجد ملاحظات")}</div>
  </div>

  <!-- Signatures -->
  <div class="signatures">
    <div class="sig-box">
      <div class="sig-title">${isEn ? "Auditor / Manager Signature" : "توقيع القائم بالجرد"}</div>
      <div class="sig-line">${auditorName}</div>
    </div>
    <div class="sig-box">
      <div class="sig-title">${isEn ? "Supervisor Approval" : "اعتماد المدير / المشرف"}</div>
      <div class="sig-line">${isEn ? "Signature: ____________________" : "التوقيع: ____________________"}</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    ${isEn ? `Generated on ${new Date().toLocaleString("en-US")} — Dunkin Stocktaking System` : `تم توليد هذا التقرير بتاريخ ${new Date().toLocaleString("ar-SA", { calendar: "gregory", numberingSystem: "latn" })} — نظام جرد دانكن`}
  </div>

  <script>
    document.fonts.ready.then(() => {
      setTimeout(() => window.print(), 400);
    });
    window.onafterprint = () => window.close();
  </script>
</body>
</html>`;

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    alert(isEn ? "Please allow popups to generate PDF report." : "الرجاء السماح بالنوافذ المنبثقة لتصدير التقرير.");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
}
