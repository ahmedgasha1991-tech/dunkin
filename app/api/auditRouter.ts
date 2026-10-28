import { z } from "zod";
import { createRouter, publicQuery, publicProcedure, adminProcedure } from "./middleware";
import {
  createAudit,
  listAudits,
  getAudit,
  getAuditItems,
  upsertAuditItems,
  finalizeAudit,
  deleteAudit,
} from "./queries/audits";
import { applyAuditCountsToStock } from "./queries/products";

const auditItemSchema = z.object({
  productCode: z.string().min(1),
  productName: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().min(1),
  systemQty: z.number().int().nullable(),
  actualQty: z.number().int().nullable(),
  itemNotes: z.string().nullable().optional(),
});

export const auditRouter = createRouter({
  /** إنشاء جرد جديد (أسبوعي / شهري / مخصص ليوم الأحد أو أصناف محددة) */
  create: publicProcedure
    .input(
      z.object({
        auditType: z.string().min(1),
        auditorName: z.string().min(1),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const audit = await createAudit(input);
      return audit;
    }),

  /** قائمة جميع الجرود */
  list: publicQuery.query(() => listAudits()),

  /** تفاصيل جرد واحد مع بنوده */
  get: publicQuery
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const audit = await getAudit(input.id);
      if (!audit) throw new Error("الجرد غير موجود");
      const items = await getAuditItems(input.id);
      return { audit, items };
    }),

  /** حفظ / تحديث البنود كمسودة */
  saveDraft: publicProcedure
    .input(
      z.object({
        auditId: z.number().int(),
        items: z.array(auditItemSchema),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await upsertAuditItems(input.auditId, input.items);
      return { ok: true };
    }),

  /** اعتماد الجرد نهائياً وتحديث رصيد المخزون الحي تلقائياً */
  finalize: publicProcedure
    .input(
      z.object({
        auditId: z.number().int(),
        items: z.array(auditItemSchema),
        notes: z.string().nullable().optional(),
        auditorName: z.string().optional(),
        branchCode: z.string().optional(),
        updateStock: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await upsertAuditItems(input.auditId, input.items);
      await finalizeAudit(input.auditId);

      // تحديث كميات المخزون الحي مباشرة بأرقام الجرد المعتمدة
      if (input.updateStock !== false) {
        const auditor = input.auditorName || ctx.user?.fullName || "المشرف";
        const branch = input.branchCode || ctx.user?.branchCode || "1011125";
        await applyAuditCountsToStock(
          input.items.map((it) => ({
            productCode: it.productCode,
            actualQty: it.actualQty,
          })),
          { auditorName: auditor, branchCode: branch }
        );
      }

      return { ok: true, stockUpdated: input.updateStock !== false };
    }),

  /** حذف جرد - مخصص للأدمن فقط لمنع التلاعب بسجلات الجرد */
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteAudit(input.id);
      return { ok: true };
    }),
});
