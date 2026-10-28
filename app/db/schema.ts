import {
  pgTable,
  pgEnum,
  serial,
  integer,
  varchar,
  timestamp,
  text,
  boolean,
} from "drizzle-orm/pg-core";

export const modeEnum = pgEnum("mode", ["simple", "detailed"]);
export const unitCodeEnum = pgEnum("unit_code", ["CTN", "PKT", "PCS"]);
export const snapshotPeriodEnum = pgEnum("period", ["weekly", "monthly"]);
export const auditTypeEnum = pgEnum("audit_type", ["weekly", "monthly"]);
export const auditStatusEnum = pgEnum("audit_status", ["draft", "completed"]);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  nameAr: varchar("name_ar", { length: 512 }).notNull(),
  nameEn: varchar("name_en", { length: 512 }).notNull(),
  category: varchar("category", { length: 255 }).notNull(),
  mode: modeEnum("mode").notNull().default("simple"),
  qty: integer("qty"),
  packs: integer("packs"),
  packSize: integer("pack_size"),
  loose: integer("loose"),
  orderQty: integer("order_qty"),
  unitCode: unitCodeEnum("unit_code").notNull(),
  unitLabel: varchar("unit_label", { length: 64 }).notNull(),
  imageUrl: varchar("image_url", { length: 1024 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isHidden: boolean("is_hidden").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const inventorySnapshots = pgTable("inventory_snapshots", {
  id: serial("id").primaryKey(),
  period: snapshotPeriodEnum("period").notNull(),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
  data: text("data").notNull(),
});

// ─── جداول الجرد التشغيلي البحت (Quantity-only Stocktaking) ─────────────────

export const inventoryAudits = pgTable("inventory_audits", {
  id: serial("id").primaryKey(),
  auditType: auditTypeEnum("audit_type").notNull(),
  auditorName: varchar("auditor_name", { length: 255 }).notNull(),
  notes: text("notes"),
  status: auditStatusEnum("audit_status").notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const inventoryAuditItems = pgTable("inventory_audit_items", {
  id: serial("id").primaryKey(),
  auditId: integer("audit_id").notNull().references(() => inventoryAudits.id, { onDelete: "cascade" }),
  productCode: varchar("product_code", { length: 64 }).notNull(),
  productName: varchar("product_name", { length: 512 }).notNull(),
  category: varchar("category", { length: 255 }).notNull(),
  unit: varchar("unit", { length: 64 }).notNull(),
  systemQty: integer("system_qty"),
  actualQty: integer("actual_qty"),
  // difference = actual_qty - system_qty (computed in app layer)
  difference: integer("difference"),
  itemNotes: text("item_notes"),
});

export interface StockLog {
  id: string;
  productId: number;
  productCode: string;
  productNameAr: string;
  productNameEn: string;
  field: "qty" | "packs" | "loose" | "general";
  prevQty: number | null;
  newQty: number | null;
  delta: number;
  changeType: "increase" | "decrease" | "set";
  updatedBy: string;
  author?: string;
  branchCode?: string;
  timestamp: string;
  action?: string;
  unit?: string;
  note?: string;
}

export type Product = typeof products.$inferSelect & {
  lastStockUpdate?: StockLog | null;
};
export type InventorySnapshot = typeof inventorySnapshots.$inferSelect;
export type InventoryAudit = typeof inventoryAudits.$inferSelect;
export type InventoryAuditItem = typeof inventoryAuditItems.$inferSelect;

