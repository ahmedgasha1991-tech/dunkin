import { z } from "zod";
import { createRouter, publicQuery, publicProcedure, protectedProcedure, adminProcedure } from "./middleware";
import {
  listProducts,
  updateProduct,
  addProduct,
  editProduct,
  toggleProductVisibility,
  deleteProduct,
  saveInventorySnapshot,
  listInventorySnapshots,
  resetAllStock,
  getStockLogs,
  receiveOrderItems,
  listBranchTransfers,
  createBranchTransfer,
  adminInitialApproveTransfer,
  sourceBranchDispatchTransfer,
  adminFinalApproveTransfer,
  destinationReceiveTransfer,
  rejectBranchTransfer,
  closeOrArchiveBranchTransfer,
} from "./queries/products";

const unitCode = z.enum(["CTN", "PKT", "PCS"]);
const optionalNullableImageUrl = z.preprocess((value) => {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}, z.union([z.string().url(), z.null()]).optional());

export const inventoryRouter = createRouter({
  /** عرض المنتجات متاح للعرض */
  list: publicQuery.query(() => listProducts()),

  /** تحديث الكمية يتطلب جلسة موثقة */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        mode: z.enum(["simple", "detailed"]).optional(),
        qty: z.number().int().min(0).nullable().optional(),
        packs: z.number().int().min(0).nullable().optional(),
        packSize: z.number().int().min(0).nullable().optional(),
        loose: z.number().int().min(0).nullable().optional(),
        orderQty: z.number().int().min(0).nullable().optional(),
        updatedBy: z.string().optional(),
        branchCode: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, updatedBy, branchCode, ...fields } = input;
      // Auto-bind author to verified session if available
      const author = ctx.user?.fullName || updatedBy || "موظف الفرع";
      const branch = ctx.user?.branchCode || branchCode || "1011125";
      await updateProduct(id, fields, { updatedBy: author, branchCode: branch });
      return { ok: true };
    }),

  /** استلام البضائع والطلبيات وتوريدها للمخزون */
  receiveOrder: protectedProcedure
    .input(
      z.object({
        branchCode: z.string().optional(),
        receivedBy: z.string().optional(),
        submissionId: z.string().optional(),
        items: z.array(
          z.object({
            productId: z.number().optional(),
            productCode: z.string().min(1),
            orderedQty: z.number().int().min(0),
            receivedQty: z.number().int().min(0),
            status: z.enum(["received_full", "received_partial", "not_received"]),
            notes: z.string().nullable().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const author = ctx.user?.fullName || input.receivedBy || "موظف الفرع";
      const branch = ctx.user?.branchCode || input.branchCode || "1011125";
      const res = await receiveOrderItems(input.items, {
        receivedBy: author,
        branchCode: branch,
        submissionId: input.submissionId,
      });
      return res;
    }),

  /** سجل الحركات والتعديلات على المخزون - يتطلب تسجيل دخول */
  stockLogs: protectedProcedure
    .input(z.object({ productId: z.number().optional() }).optional())
    .query(({ input }) => getStockLogs(input?.productId)),

  /** إضافة منتج: مخصص لمدير النظام (الأدمن) فقط */
  add: adminProcedure
    .input(
      z.object({
        code: z.string().min(1),
        nameAr: z.string().min(1),
        nameEn: z.string().min(1),
        category: z.string().min(1),
        mode: z.enum(["simple", "detailed"]),
        unitCode,
        unitLabel: z.string().min(1),
        imageUrl: optionalNullableImageUrl,
        qty: z.number().int().min(0).nullable().optional(),
        isHidden: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await addProduct(input);
      return { ok: true };
    }),

  /** تعديل منتج: مخصص لمدير النظام (الأدمن) فقط */
  edit: adminProcedure
    .input(
      z.object({
        id: z.number(),
        code: z.string().min(1).optional(),
        nameAr: z.string().min(1).optional(),
        nameEn: z.string().min(1).optional(),
        category: z.string().min(1).optional(),
        mode: z.enum(["simple", "detailed"]).optional(),
        unitCode: unitCode.optional(),
        unitLabel: z.string().min(1).optional(),
        imageUrl: optionalNullableImageUrl,
        qty: z.number().int().min(0).nullable().optional(),
        isHidden: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...fields } = input;
      await editProduct(id, fields);
      return { ok: true };
    }),

  /** إخفاء / إظهار المنتج للموظفين: مخصص لمدير النظام (الأدمن) فقط */
  toggleVisibility: adminProcedure
    .input(
      z.object({
        id: z.number(),
        isHidden: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      await toggleProductVisibility(input.id, input.isHidden);
      return { ok: true, id: input.id, isHidden: input.isHidden };
    }),

  /** حذف منتج: مخصص لمدير النظام (الأدمن) فقط */
  remove: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteProduct(input.id);
      return { ok: true };
    }),

  snapshots: protectedProcedure.query(() => listInventorySnapshots()),

  saveSnapshot: protectedProcedure
    .input(z.object({ period: z.enum(["weekly", "monthly"]), data: z.string().min(2) }))
    .mutation(async ({ input }) => {
      await saveInventorySnapshot(input.period, input.data);
      return { ok: true };
    }),

  /** تصفير المخزون: مخصص لمدير النظام (الأدمن) فقط لمنع العبث ببيانات الجرد */
  resetAll: adminProcedure.mutation(async () => {
    await resetAllStock();
    return { ok: true };
  }),

  /** =========================================================================
   * INTER-BRANCH TRANSFERS WORKFLOW PROCEDURES
   * ========================================================================= */
  
  /** استعراض طلبات التحويل بين الفروع */
  listTransfers: publicQuery
    .input(
      z.object({
        branchCode: z.string().optional(),
        status: z.string().optional(),
      }).optional()
    )
    .query(({ input }) => listBranchTransfers(input)),

  /** إنشاء طلب تحويل من فرع لفرع آخر */
  createTransfer: protectedProcedure
    .input(
      z.object({
        fromBranchCode: z.string().min(1),
        fromBranchName: z.string().min(1),
        toBranchCode: z.string().min(1),
        toBranchName: z.string().min(1),
        requestedBy: z.string().optional(),
        requestedById: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(
          z.object({
            code: z.string().min(1),
            nameAr: z.string().min(1),
            nameEn: z.string().optional(),
            unit: z.string().min(1),
            requestedQty: z.number().int().min(1),
            notes: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const author = ctx.user?.fullName || input.requestedBy || "موظف الفرع";
      const authorId = ctx.user?.employeeId || input.requestedById || "#101";
      return createBranchTransfer({
        ...input,
        requestedBy: author,
        requestedById: authorId,
      });
    }),

  /** موافقة الأدمن المبدئية وتعديل الكميات بالزيادة أو النقصان */
  adminInitialApproveTransfer: adminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        adminName: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(
          z.object({
            code: z.string().min(1),
            adminApprovedQty: z.number().int().min(0),
          })
        ).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const admin = ctx.user?.fullName || input.adminName || "مدير النظام (الأدمن)";
      return adminInitialApproveTransfer({
        id: input.id,
        adminName: admin,
        notes: input.notes,
        items: input.items,
      });
    }),

  /** تجهيز وشحن الكميات من الفرع المرسل مع إمكانية تعديل المتوفر */
  sourceDispatchTransfer: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        employeeName: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(
          z.object({
            code: z.string().min(1),
            dispatchedQty: z.number().int().min(0),
            notes: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const author = ctx.user?.fullName || input.employeeName || "موظف الفرع المرسل";
      return sourceBranchDispatchTransfer({
        id: input.id,
        employeeName: author,
        notes: input.notes,
        items: input.items,
      });
    }),

  /** تأكيد الأدمن النهائي للشحن وترحيلها في الطريق */
  adminFinalApproveTransfer: adminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        adminName: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const admin = ctx.user?.fullName || input.adminName || "مدير النظام (الأدمن)";
      return adminFinalApproveTransfer({
        id: input.id,
        adminName: admin,
        notes: input.notes,
      });
    }),

  /** فحص واستلام الشحنة وتحديث المخزون التلقائي (إضافة للمستلم وخصم من المرسل) */
  destinationReceiveTransfer: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        receivedBy: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(
          z.object({
            code: z.string().min(1),
            receivedQty: z.number().int().min(0),
            itemStatus: z.enum(["received_full", "received_partial", "not_received"]),
            notes: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const author = ctx.user?.fullName || input.receivedBy || "موظف الفرع المستلم";
      return await destinationReceiveTransfer({
        id: input.id,
        receivedBy: author,
        notes: input.notes,
        items: input.items,
      });
    }),

  /** رفض طلب التحويل من قبل الأدمن */
  rejectTransfer: adminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        adminName: z.string().optional(),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const admin = ctx.user?.fullName || input.adminName || "مدير النظام (الأدمن)";
      return rejectBranchTransfer({
        id: input.id,
        adminName: admin,
        reason: input.reason,
      });
    }),

  /** إغلاق وأرشفة المعاملة ونقلها إلى المعاملات السابقة - يتطلب تسجيل دخول */
  closeOrArchiveTransfer: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        closedBy: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const by = input.closedBy || ctx.user?.fullName || "المشرف";
      return closeOrArchiveBranchTransfer({
        id: input.id,
        closedBy: by,
        notes: input.notes,
      });
    }),
});

