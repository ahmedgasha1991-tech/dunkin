import fs from "fs";
import path from "path";
import { asc, eq, or, sql } from "drizzle-orm";
import { inventorySnapshots, products, type Product, type StockLog } from "@db/schema";
import { getDb } from "./connection";
import { seedProducts } from "../../db/seedData";
import staticImagesMap from "../../src/data/product_images_mapping.json";

function getMappingFilePath() {
  const p1 = path.resolve(process.cwd(), "src/data/product_images_mapping.json");
  if (fs.existsSync(p1)) return p1;
  const p2 = path.resolve(process.cwd(), "app/src/data/product_images_mapping.json");
  if (fs.existsSync(p2)) return p2;
  return p1;
}

function loadImagesMapping(): Record<string, string> {
  try {
    const jsonPath = getMappingFilePath();
    if (fs.existsSync(jsonPath)) {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      return { ...staticImagesMap, ...parsed };
    }
  } catch (e) {
    console.warn("Could not read dynamic product_images_mapping.json:", e);
  }
  return { ...staticImagesMap };
}

export function saveImageMapping(code: string, url: string | null) {
  try {
    const jsonPath = getMappingFilePath();
    const current = loadImagesMapping();
    if (url && url.trim()) {
      current[code] = url.trim();
    } else {
      delete current[code];
    }
    fs.writeFileSync(jsonPath, JSON.stringify(current, null, 2), "utf-8");
  } catch (e) {
    console.warn("Could not save to product_images_mapping.json:", e);
  }
}

function toNullableNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

const activeImagesMap = loadImagesMapping();

export async function withDbTimeout<T>(promise: Promise<T>, timeoutMs = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DB Timeout")), timeoutMs)),
  ]);
}

function getHiddenProductsPaths(): string[] {
  return [
    path.resolve(process.cwd(), "src/data/hidden_products.json"),
    path.resolve(process.cwd(), "app/src/data/hidden_products.json"),
  ];
}

export function loadHiddenProductCodes(): Set<string> {
  const set = new Set<string>();
  const paths = getHiddenProductsPaths();
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf-8");
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const code of list) {
            if (code) set.add(String(code).trim());
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
  return set;
}

export function saveHiddenProductCodes(codes: Set<string> | string[]) {
  const list = Array.from(codes);
  const paths = getHiddenProductsPaths();
  for (const p of paths) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(p, JSON.stringify(list, null, 2), "utf-8");
    } catch (e) {
      // ignore
    }
  }
}

function getProductPackSizesPaths() {
  return [
    path.resolve(process.cwd(), "src/data/product_pack_sizes.json"),
    path.resolve(process.cwd(), "app/src/data/product_pack_sizes.json"),
    path.resolve(__dirname, "../../src/data/product_pack_sizes.json"),
    path.resolve(__dirname, "../src/data/product_pack_sizes.json"),
  ];
}

export function loadProductPackSizes(): Record<string, number> {
  const map: Record<string, number> = {};
  const paths = getProductPackSizesPaths();
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed)) {
            const num = Number(v);
            if (!isNaN(num) && num > 0) {
              map[String(k)] = num;
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
  return map;
}

export function saveProductPackSizes(sizes: Record<string, number>) {
  const paths = getProductPackSizesPaths();
  for (const p of paths) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(p, JSON.stringify(sizes, null, 2), "utf-8");
    } catch (e) {
      // ignore
    }
  }
}

export function extractPackSizeFromName(nameAr: string, nameEn: string): number | null {
  const text = (nameAr || "") + " " + (nameEn || "");
  const m = text.match(/(?:1\s*[×xX*]\s*|x\s*)(\d+)\s*(?:حبة|قطعة|باكت|علبة|كيس|ظرف|PCS|PKT|BAG|CAN|BTL|CTN)?/i);
  if (m && Number(m[1]) > 1) return Number(m[1]);
  const m2 = text.match(/(\d+)\s*(?:PCS|PKT|حبة|باكت)\b/i);
  if (m2 && Number(m2[1]) > 1) return Number(m2[1]);
  return null;
}

function getProductsStoreFilePath() {
  const p2 = path.resolve(process.cwd(), "app/src/data/products_store.json");
  if (fs.existsSync(p2) || fs.existsSync(path.resolve(process.cwd(), "app"))) return p2;
  const p1 = path.resolve(process.cwd(), "src/data/products_store.json");
  if (fs.existsSync(p1)) return p1;
  return p2;
}

function loadProductsStore(): Product[] {
  const hiddenCodes = loadHiddenProductCodes();
  const packSizes = loadProductPackSizes();
  try {
    const jsonPath = getProductsStoreFilePath();
    if (fs.existsSync(jsonPath)) {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((p: any) => {
          let size = p.packSize != null && p.packSize > 0 ? p.packSize : (packSizes[p.code] ?? extractPackSizeFromName(p.nameAr, p.nameEn) ?? null);
          return {
            ...p,
            packSize: size,
            isHidden: hiddenCodes.has(p.code) || !!p.isHidden,
            createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
            updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
          };
        });
      }
    }
  } catch (e) {
    console.warn("Could not read products_store.json:", e);
  }

  // Fallback to initial seed products
  return seedProducts.map((p, index) => {
    let size = toNullableNumber(p.pack_size);
    if (!size || size <= 0) {
      size = packSizes[p.code] ?? extractPackSizeFromName(p.name_ar, p.name_en) ?? null;
    }
    return {
      id: index + 1,
      code: p.code,
      nameAr: p.name_ar,
      nameEn: p.name_en,
      category: p.category,
      mode: p.mode === "detailed" ? "detailed" : "simple",
      qty: toNullableNumber(p.qty),
      packs: toNullableNumber(p.packs),
      packSize: size,
      loose: toNullableNumber(p.loose),
      orderQty: null,
      unitCode: (p.unit_code === "CTN" || p.unit_code === "PKT" || p.unit_code === "PCS" ? p.unit_code : "PCS") as "CTN" | "PKT" | "PCS",
      unitLabel: p.unit_label,
      imageUrl: activeImagesMap[p.code] || null,
      sortOrder: index + 1,
      isHidden: hiddenCodes.has(p.code),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });
}

export function saveProductsStore(items: Product[]) {
  const paths = [
    path.resolve(process.cwd(), "src/data/products_store.json"),
    path.resolve(process.cwd(), "app/src/data/products_store.json"),
  ];
  for (const jsonPath of paths) {
    try {
      const dir = path.dirname(jsonPath);
      if (fs.existsSync(dir)) {
        fs.writeFileSync(jsonPath, JSON.stringify(items, null, 2), "utf-8");
      }
    } catch (e) {
      console.warn("Could not save to products_store.json:", e);
    }
  }
}

let memoryProducts: Product[] = loadProductsStore();

let memorySnapshots: Array<{ id: number; period: "weekly" | "monthly"; capturedAt: Date; data: string }> = [];

const lastStockUpdates: Record<number, StockLog> = {};
const stockLogs: StockLog[] = [];

export function normalizeOptionalImageUrl(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function listProducts(): Promise<Product[]> {
  const hiddenCodes = loadHiddenProductCodes();
  const packSizes = loadProductPackSizes();
  try {
    const res = await withDbTimeout(
      getDb().select().from(products).orderBy(asc(products.sortOrder), asc(products.id)),
      3000
    );

    if (res && res.length > 0) {
      // Smart merge: Do NOT overwrite valid non-null quantities or added products with null!
      const dbMap = new Map(res.map((p) => [p.code, p]));
      const merged: Product[] = [];

      // 1. Keep all current memory products, merging DB fields safely
      for (const mem of memoryProducts) {
        const dbProd = dbMap.get(mem.code);
        if (dbProd) {
          dbMap.delete(mem.code);
          // Only take DB qty if DB actually has a non-null value, otherwise keep memory qty!
          const effectiveQty = dbProd.qty !== null ? dbProd.qty : mem.qty;
          const effectivePacks = dbProd.packs !== null ? dbProd.packs : mem.packs;
          const effectiveLoose = dbProd.loose !== null ? dbProd.loose : mem.loose;
          const effectiveOrder = dbProd.orderQty !== null ? dbProd.orderQty : mem.orderQty;

          // Preserve admin visibility settings
          const effectiveIsHidden = hiddenCodes.has(mem.code) || (mem.isHidden === true ? true : !!dbProd.isHidden);

          // Preserve packSize: prioritize DB if set > 0, otherwise mem, otherwise packSizes file or extracted
          const effectivePackSize =
            dbProd.packSize !== null && dbProd.packSize > 0
              ? dbProd.packSize
              : mem.packSize !== null && mem.packSize > 0
              ? mem.packSize
              : packSizes[mem.code] ?? extractPackSizeFromName(mem.nameAr, mem.nameEn) ?? null;

          merged.push({
            ...dbProd,
            id: mem.id, // keep consistent id
            packSize: effectivePackSize,
            isHidden: effectiveIsHidden,
            qty: effectiveQty,
            packs: effectivePacks,
            loose: effectiveLoose,
            orderQty: effectiveOrder,
            lastStockUpdate: lastStockUpdates[mem.id] || null,
          });
        } else {
          // Newly added product in memory that might not be in DB yet -> KEEP IT!
          const effectivePackSize =
            mem.packSize !== null && mem.packSize > 0
              ? mem.packSize
              : packSizes[mem.code] ?? extractPackSizeFromName(mem.nameAr, mem.nameEn) ?? null;

          merged.push({
            ...mem,
            packSize: effectivePackSize,
            isHidden: hiddenCodes.has(mem.code) || !!mem.isHidden,
            lastStockUpdate: lastStockUpdates[mem.id] || null,
          });
        }
      }

      // 2. Any additional products in DB not in memory
      dbMap.forEach((dbProd) => {
        const nextId = merged.length > 0 ? Math.max(...merged.map((x) => x.id)) + 1 : 1;
        const effectivePackSize =
          dbProd.packSize !== null && dbProd.packSize > 0
            ? dbProd.packSize
            : packSizes[dbProd.code] ?? extractPackSizeFromName(dbProd.nameAr, dbProd.nameEn) ?? null;

        merged.push({
          ...dbProd,
          id: nextId,
          packSize: effectivePackSize,
          isHidden: hiddenCodes.has(dbProd.code) || !!dbProd.isHidden,
          lastStockUpdate: null,
        });
      });

      memoryProducts = merged;
      saveProductsStore(memoryProducts);
      return memoryProducts;
    }
  } catch (err) {
    console.warn("DB connection timeout/error, serving stored catalog:", err);
  }

  return memoryProducts.map((p) => ({
    ...p,
    packSize:
      p.packSize !== null && p.packSize > 0
        ? p.packSize
        : packSizes[p.code] ?? extractPackSizeFromName(p.nameAr, p.nameEn) ?? null,
    isHidden: hiddenCodes.has(p.code) || !!p.isHidden,
    lastStockUpdate: lastStockUpdates[p.id] || null,
  }));
}

export async function updateProduct(
  id: number,
  fields: Partial<{
    mode: "simple" | "detailed";
    qty: number | null;
    packs: number | null;
    packSize: number | null;
    loose: number | null;
    orderQty: number | null;
    imageUrl: string | null;
  }>,
  meta?: {
    updatedBy?: string;
    branchCode?: string;
  }
) {
  const current = memoryProducts.find((p) => p.id === id);
  if (current) {
    let changedField: "qty" | "packs" | "loose" | null = null;
    let prevQty: number | null = null;
    let newQty: number | null = null;

    if (fields.qty !== undefined && fields.qty !== current.qty) {
      changedField = "qty";
      prevQty = current.qty;
      newQty = fields.qty;
    } else if (fields.packs !== undefined && fields.packs !== current.packs) {
      changedField = "packs";
      prevQty = current.packs;
      newQty = fields.packs;
    } else if (fields.loose !== undefined && fields.loose !== current.loose) {
      changedField = "loose";
      prevQty = current.loose;
      newQty = fields.loose;
    }

    if (changedField && newQty !== null) {
      const pVal = prevQty ?? 0;
      const nVal = newQty ?? 0;
      const delta = nVal - pVal;
      if (delta !== 0) {
        const changeType = delta > 0 ? "increase" : "decrease";
        const log: StockLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          productId: id,
          productCode: current.code,
          productNameAr: current.nameAr,
          productNameEn: current.nameEn,
          field: changedField,
          prevQty,
          newQty,
          delta,
          changeType,
          updatedBy: meta?.updatedBy || "موظف الفرع",
          branchCode: meta?.branchCode || "1011125",
          timestamp: new Date().toISOString(),
        };

        lastStockUpdates[id] = log;
        stockLogs.unshift(log);
        if (stockLogs.length > 500) stockLogs.pop();
      }
    }
  }

  if (fields.imageUrl !== undefined && current) {
    saveImageMapping(current.code, fields.imageUrl);
  }

  memoryProducts = memoryProducts.map((p) =>
    p.id === id
      ? {
          ...p,
          ...fields,
          updatedAt: new Date(),
          lastStockUpdate: lastStockUpdates[id] ?? p.lastStockUpdate ?? null,
        }
      : p
  );
  saveProductsStore(memoryProducts);

  try {
    await getDb().update(products).set(fields).where(eq(products.id, id));
  } catch (err) {
    console.warn("DB update fallback to memory & disk:", err);
  }
}

export async function receiveOrderItems(
  items: Array<{
    productId?: number;
    productCode: string;
    orderedQty: number;
    receivedQty: number;
    unit?: string;
    unitCode?: string;
    status: "received_full" | "received_partial" | "not_received";
    notes?: string | null;
  }>,
  meta: {
    receivedBy: string;
    branchCode: string;
    submissionId?: string;
  }
) {
  const updatedItems: Array<{ id: number; prevQty: number; newQty: number; addedQty: number }> = [];

  for (const item of items) {
    // Match by productCode first to prevent fake index collisions
    const current = memoryProducts.find(
      (p) => (item.productCode && p.code === item.productCode) || (item.productId && p.id === item.productId)
    );

    if (current) {
      const prevQty = current.qty ?? 0;
      const addedQty = Math.max(0, item.receivedQty);
      const isDetailed = current.mode === "detailed";
      const packSize = (current.packSize !== null && current.packSize > 0) ? current.packSize : 1;
      const uCode = item.unitCode || current.unitCode;
      const uStr = (item.unit || "").toLowerCase();
      const isPacketOrCarton =
        uCode === "PKT" ||
        uCode === "CTN" ||
        uStr.includes("باكت") ||
        uStr.includes("باكيت") ||
        uStr.includes("كرتون") ||
        uStr.includes("pkt") ||
        uStr.includes("ctn");

      let newQty = prevQty;
      let newPacks = current.packs ?? 0;
      let newLoose = current.loose ?? 0;

      // Only alter stock qty if items were actually received
      if (addedQty > 0) {
        if (isDetailed) {
          if (isPacketOrCarton) {
            newPacks = (current.packs ?? 0) + addedQty;
            newLoose = current.loose ?? 0;
            newQty = (newPacks * packSize) + newLoose;
          } else {
            // Received as individual pieces
            newLoose = (current.loose ?? 0) + addedQty;
            newPacks = current.packs ?? 0;
            newQty = (newPacks * packSize) + newLoose;
          }
        } else {
          newQty = prevQty + addedQty;
        }

        const log: StockLog = {
          id: `log-recv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          productId: current.id,
          productCode: current.code,
          productNameAr: current.nameAr,
          productNameEn: current.nameEn,
          field: isDetailed ? (isPacketOrCarton ? "packs" : "loose") : "qty",
          prevQty,
          newQty,
          delta: addedQty,
          changeType: "increase",
          updatedBy: `${meta.receivedBy} (استلام وتوريد طلبية)`,
          branchCode: meta.branchCode,
          timestamp: new Date().toISOString(),
        };

        lastStockUpdates[current.id] = log;
        stockLogs.unshift(log);
        if (stockLogs.length > 500) stockLogs.pop();

        current.qty = newQty;
        if (isDetailed) {
          current.packs = newPacks;
          current.loose = newLoose;
        }
        current.orderQty = null; // Fulfill & clear order requirement
        current.updatedAt = new Date();
        current.lastStockUpdate = log;

        updatedItems.push({ id: current.id, prevQty, newQty, addedQty });

        try {
          await getDb()
            .update(products)
            .set({
              qty: newQty,
              packs: isDetailed ? newPacks : current.packs,
              loose: isDetailed ? newLoose : current.loose,
              orderQty: null,
              updatedAt: new Date(),
            })
            .where(eq(products.id, current.id));
        } catch (err) {
          console.warn("DB update fallback during goods receipt:", err);
        }
      } else {
        // Even if 0 received, clear orderQty so it doesn't linger in cart
        current.orderQty = null;
        current.updatedAt = new Date();
        try {
          await getDb()
            .update(products)
            .set({ orderQty: null, updatedAt: new Date() })
            .where(eq(products.id, current.id));
        } catch (err) {}
      }
    }
  }

  saveProductsStore(memoryProducts);
  return { ok: true, count: updatedItems.length, updatedItems, products: memoryProducts };
}

export async function clearOrderQuantities(items?: Array<{ id?: number; code?: string }>) {
  let clearedCount = 0;
  if (!items || items.length === 0) {
    for (const p of memoryProducts) {
      if (p.orderQty != null) {
        p.orderQty = null;
        p.updatedAt = new Date();
        clearedCount++;
      }
    }
    saveProductsStore(memoryProducts);
    try {
      await getDb().update(products).set({ orderQty: null, updatedAt: new Date() });
    } catch (err) {
      console.warn("DB fallback for clearOrderQuantities:", err);
    }
  } else {
    for (const item of items) {
      const p = memoryProducts.find(
        (x) => (item.code && x.code === item.code) || (item.id && x.id === item.id)
      );
      if (p) {
        p.orderQty = null;
        p.updatedAt = new Date();
        clearedCount++;
        try {
          await getDb().update(products).set({ orderQty: null, updatedAt: new Date() }).where(eq(products.id, p.id));
        } catch (err) {}
      }
    }
    saveProductsStore(memoryProducts);
  }
  return { ok: true, clearedCount, products: memoryProducts };
}

export function getStockLogs(productId?: number): StockLog[] {
  if (productId != null) {
    return stockLogs.filter((l) => l.productId === productId);
  }
  return stockLogs;
}

export async function addProduct(input: {
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  mode: "simple" | "detailed";
  unitCode: "CTN" | "PKT" | "PCS";
  unitLabel: string;
  imageUrl?: string | null;
  qty?: number | null;
  packSize?: number | null;
  isHidden?: boolean;
}) {
  const normalizedImageUrl = normalizeOptionalImageUrl(input.imageUrl);
  const newId = memoryProducts.length > 0 ? Math.max(...memoryProducts.map((p) => p.id)) + 1 : 1;
  const nextSort = memoryProducts.length > 0 ? Math.max(...memoryProducts.map((p) => p.sortOrder)) + 1 : 1;
  const isHidden = input.isHidden ?? false;
  const packSize = input.packSize ?? null;

  const newProd: Product = {
    id: newId,
    code: input.code,
    nameAr: input.nameAr,
    nameEn: input.nameEn,
    category: input.category,
    mode: input.mode,
    qty: input.qty ?? null,
    packs: null,
    packSize,
    loose: null,
    orderQty: null,
    unitCode: input.unitCode,
    unitLabel: input.unitLabel,
    imageUrl: normalizedImageUrl,
    sortOrder: nextSort,
    isHidden,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  memoryProducts.push(newProd);
  saveProductsStore(memoryProducts);

  if (normalizedImageUrl) {
    saveImageMapping(input.code, normalizedImageUrl);
  }

  if (packSize && packSize > 0) {
    const sizes = loadProductPackSizes();
    sizes[input.code] = packSize;
    saveProductPackSizes(sizes);
  }

  try {
    const db = getDb();
    await withDbTimeout(
      db.insert(products).values({ ...input, isHidden, packSize, imageUrl: normalizedImageUrl, sortOrder: nextSort, qty: input.qty ?? null }),
      3000
    );
  } catch (err) {
    console.warn("DB insert fallback to memory & disk:", err);
  }
}

export async function editProduct(
  id: number,
  fields: Partial<Pick<typeof products.$inferInsert, "code" | "nameAr" | "nameEn" | "category" | "mode" | "unitCode" | "unitLabel" | "imageUrl" | "isHidden" | "qty" | "packSize">>,
) {
  const current = memoryProducts.find((p) => p.id === id);
  const normalizedImageUrl = fields.imageUrl === undefined ? undefined : normalizeOptionalImageUrl(fields.imageUrl);
  const normalizedFields = {
    ...fields,
    ...(normalizedImageUrl !== undefined ? { imageUrl: normalizedImageUrl } : {}),
  };

  const targetCode = fields.code || current?.code;
  if (normalizedImageUrl !== undefined && targetCode) {
    saveImageMapping(targetCode, normalizedImageUrl);
  }

  if (fields.isHidden !== undefined && targetCode) {
    const hiddenCodes = loadHiddenProductCodes();
    if (fields.isHidden) {
      hiddenCodes.add(targetCode);
    } else {
      hiddenCodes.delete(targetCode);
    }
    saveHiddenProductCodes(hiddenCodes);
  }

  if (fields.packSize !== undefined && targetCode) {
    const sizes = loadProductPackSizes();
    if (fields.packSize && fields.packSize > 0) {
      sizes[targetCode] = fields.packSize;
    } else {
      delete sizes[targetCode];
    }
    saveProductPackSizes(sizes);
  }

  memoryProducts = memoryProducts.map((p) => {
    if (p.id === id || (targetCode && p.code === targetCode)) {
      return {
        ...p,
        ...fields,
        imageUrl: normalizedImageUrl !== undefined ? normalizedImageUrl : p.imageUrl,
        updatedAt: new Date(),
      };
    }
    return p;
  });
  saveProductsStore(memoryProducts);

  try {
    const db = getDb();
    await withDbTimeout(
      (async () => {
        try {
          await db.execute(sql`
            ALTER TABLE products ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
            ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_size INTEGER;
          `);
        } catch (_) {}
        if (targetCode) {
          await db.update(products).set(normalizedFields).where(or(eq(products.id, id), eq(products.code, targetCode)));
        } else {
          await db.update(products).set(normalizedFields).where(eq(products.id, id));
        }
      })(),
      3000
    );
  } catch (err) {
    console.warn("DB edit fallback to memory & disk:", err);
  }
}

export async function setProductPackSize(id: number, packSize: number | null, code?: string) {
  let targetCode: string | null = code || null;
  const current = memoryProducts.find((p) => p.id === id || (code && p.code === code));
  targetCode = code || current?.code || null;

  memoryProducts = memoryProducts.map((p) => {
    if (p.id === id || (targetCode && p.code === targetCode)) {
      return {
        ...p,
        packSize,
        updatedAt: new Date(),
      };
    }
    return p;
  });

  if (targetCode) {
    const sizes = loadProductPackSizes();
    if (packSize && packSize > 0) {
      sizes[targetCode] = packSize;
    } else {
      delete sizes[targetCode];
    }
    saveProductPackSizes(sizes);
  }
  saveProductsStore(memoryProducts);

  try {
    const db = getDb();
    await withDbTimeout(
      (async () => {
        try {
          await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_size INTEGER;`);
        } catch (_) {}
        if (targetCode) {
          await db.update(products).set({ packSize, updatedAt: new Date() }).where(or(eq(products.id, id), eq(products.code, targetCode)));
        } else {
          await db.update(products).set({ packSize, updatedAt: new Date() }).where(eq(products.id, id));
        }
      })(),
      3000
    );
  } catch (err) {
    console.warn("DB setProductPackSize fallback to memory & disk:", err);
  }

  return { ok: true, id, code: targetCode, packSize };
}

export async function toggleProductVisibility(id: number, isHidden: boolean, code?: string) {
  let targetCode: string | null = code || null;
  memoryProducts = memoryProducts.map((p) => {
    if (p.id === id || (code && p.code === code)) {
      targetCode = p.code;
      return {
        ...p,
        isHidden: !!isHidden,
        updatedAt: new Date(),
      };
    }
    return p;
  });

  if (!targetCode) {
    const found = memoryProducts.find((p) => p.id === id || (code && p.code === code));
    if (found) targetCode = found.code;
  }

  if (targetCode) {
    const hiddenCodes = loadHiddenProductCodes();
    if (isHidden) {
      hiddenCodes.add(targetCode);
    } else {
      hiddenCodes.delete(targetCode);
    }
    saveHiddenProductCodes(hiddenCodes);
  }

  saveProductsStore(memoryProducts);

  try {
    const db = getDb();
    await withDbTimeout(
      (async () => {
        try {
          await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;`);
        } catch (_) {}
        if (targetCode) {
          await db.update(products).set({ isHidden: !!isHidden }).where(or(eq(products.id, id), eq(products.code, targetCode)));
        } else {
          await db.update(products).set({ isHidden: !!isHidden }).where(eq(products.id, id));
        }
      })(),
      3000
    );
  } catch (err) {
    console.warn("DB toggleProductVisibility fallback to memory & disk:", err);
  }
  return { ok: true, id, code: targetCode, isHidden };
}

export async function deleteProduct(id: number) {
  const current = memoryProducts.find((p) => p.id === id);
  if (current) {
    saveImageMapping(current.code, null);
  }
  memoryProducts = memoryProducts.filter((p) => p.id !== id);
  saveProductsStore(memoryProducts);

  try {
    const db = getDb();
    if (current?.code) {
      await db.delete(products).where(or(eq(products.id, id), eq(products.code, current.code)));
    } else {
      await db.delete(products).where(eq(products.id, id));
    }
  } catch (err) {
    console.warn("DB delete fallback to memory & disk:", err);
  }
}

export async function saveInventorySnapshot(period: "weekly" | "monthly", data: string) {
  memorySnapshots.unshift({ id: Date.now(), period, capturedAt: new Date(), data });
  try {
    await getDb().insert(inventorySnapshots).values({ period, data });
  } catch (err) {
    console.warn("DB snapshot fallback to memory:", err);
  }
}

export async function listInventorySnapshots() {
  try {
    const res = await Promise.race([
      getDb().select().from(inventorySnapshots).orderBy(sql`${inventorySnapshots.capturedAt} DESC`),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2500))
    ]);
    if (res) return res;
    return memorySnapshots;
  } catch (err) {
    return memorySnapshots;
  }
}

export async function resetAllStock() {
  memoryProducts = memoryProducts.map((p) => ({
    ...p,
    qty: 0,
    packs: 0,
    loose: 0,
    orderQty: null,
  }));
  try {
    await getDb()
      .update(products)
      .set({ qty: 0, packs: 0, loose: 0, orderQty: null });
  } catch (err) {
    console.warn("DB reset fallback to memory:", err);
  }
  saveProductsStore(memoryProducts);
}

// =============================================================================
// INTER-BRANCH TRANSFERS & MULTI-PARTY WORKFLOW SYSTEM
// =============================================================================

export interface BranchTransferItem {
  code: string;
  nameAr: string;
  nameEn?: string;
  unit: string;
  requestedQty: number;
  adminApprovedQty?: number;
  dispatchedQty?: number;
  receivedQty?: number;
  itemStatus?: "pending" | "approved" | "dispatched" | "received_full" | "received_partial" | "not_received";
  notes?: string;
}

export interface BranchTransferTimelineEntry {
  timestamp: string;
  action: string;
  by: string;
  role: string;
  notes?: string;
}

export interface BranchTransfer {
  id: string;
  transferNo: string;
  fromBranchCode: string;
  fromBranchName: string;
  toBranchCode: string;
  toBranchName: string;
  requestedBy: string;
  requestedById: string;
  requestedAt: string;
  status:
    | "pending_admin_initial" // 1. طلب جديد بانتظار موافقة الأدمن الأولى
    | "approved_by_admin"     // 2. معتمد من الأدمن وبانتظار تجهيز وشحن الفرع المرسل
    | "dispatched_by_source"  // 3. تم الشحن من الفرع المرسل وبانتظار تأكيد الأدمن
    | "in_transit"            // 4. معتمد في الطريق وبانتظار استلام الفرع الطالب
    | "completed"             // 5. تم الاستلام وتحديث المخزون ومؤرشف
    | "rejected";             // مرفوض
  adminInitialNotes?: string;
  adminInitialApprovedAt?: string;
  adminInitialBy?: string;
  dispatchedAt?: string;
  dispatchedBy?: string;
  dispatchedNotes?: string;
  adminFinalApprovedAt?: string;
  adminFinalBy?: string;
  adminFinalNotes?: string;
  receivedAt?: string;
  receivedBy?: string;
  receivedNotes?: string;
  items: BranchTransferItem[];
  timeline: BranchTransferTimelineEntry[];
}

let memoryTransfers: BranchTransfer[] = [
  {
    id: "TR-DEMO-001",
    transferNo: "TR-2609-001",
    fromBranchCode: "1010001",
    fromBranchName: "فرع الرياض الرئيسي - العليا",
    toBranchCode: "1011125",
    toBranchName: "1011125 - الرياض فرع الديره",
    requestedBy: "أحمد عبد العزيز",
    requestedById: "15763",
    requestedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    status: "in_transit",
    adminInitialBy: "مدير النظام (الأدمن)",
    adminInitialApprovedAt: new Date(Date.now() - 3600000 * 1.5).toISOString(),
    adminInitialNotes: "تمت الموافقة على التحويل لتغطية عجز عطلة نهاية الأسبوع",
    dispatchedBy: "سعد القحطاني (فرع العليا)",
    dispatchedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
    dispatchedNotes: "تم تجهيز وتغليف الكراتين بالكامل وتحميلها مع مندوب التوصيل",
    adminFinalBy: "مدير النظام (الأدمن)",
    adminFinalApprovedAt: new Date(Date.now() - 1800000).toISOString(),
    adminFinalNotes: "تم اعتماد خروج الشحنة وفي طريقها للفرع المستلم",
    items: [
      {
        code: "13011011",
        nameAr: "أكواب قهوة وشاي مزدوجة الجدار 10 أونصة",
        nameEn: "CUPS COFFEE AND TEA CUPS 10OZ",
        unit: "كرتون 📦",
        requestedQty: 4,
        adminApprovedQty: 4,
        dispatchedQty: 4,
        receivedQty: 4,
        itemStatus: "dispatched",
      },
      {
        code: "13011014",
        nameAr: "أكواب قهوة وشاي مزدوجة الجدار 16 أونصة",
        nameEn: "CUPS DW COFFEE AND TEA CUPS 16OZ",
        unit: "باكت 🗂️",
        requestedQty: 5,
        adminApprovedQty: 5,
        dispatchedQty: 4,
        receivedQty: 4,
        itemStatus: "dispatched",
        notes: "تم تجهيز 4 باكيتات فقط حسب المتوفر لدينا",
      }
    ],
    timeline: [
      {
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        action: "إنشاء طلب التحويل من الفرع",
        by: "أحمد عبد العزيز",
        role: "الفرع الطالب (الديرة)",
      },
      {
        timestamp: new Date(Date.now() - 3600000 * 1.5).toISOString(),
        action: "موافقة الأدمن المبدئية وإحالة للفرع المصدر للتجهيز",
        by: "مدير النظام (الأدمن)",
        role: "الإدارة العامة",
        notes: "تمت الموافقة على التحويل لتغطية عجز عطلة نهاية الأسبوع",
      },
      {
        timestamp: new Date(Date.now() - 3600000 * 1).toISOString(),
        action: "تجهيز وشحن الكميات من الفرع المرسل",
        by: "سعد القحطاني",
        role: "الفرع المرسل (العليا)",
        notes: "تم تعديل كمية الصنف 16 أونصة إلى 4 باكيتات للمتوفر",
      },
      {
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        action: "اعتماد الأدمن النهائي للشحن وترحيلها في الطريق",
        by: "مدير النظام (الأدمن)",
        role: "الإدارة العامة",
      }
    ]
  }
];

export function listBranchTransfers(filter?: { branchCode?: string; status?: string }) {
  let list = [...memoryTransfers];
  if (filter?.branchCode) {
    list = list.filter(
      (t) => t.fromBranchCode === filter.branchCode || t.toBranchCode === filter.branchCode
    );
  }
  if (filter?.status && filter.status !== "ALL") {
    list = list.filter((t) => t.status === filter.status);
  }
  return list.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
}

export function createBranchTransfer(input: {
  fromBranchCode: string;
  fromBranchName: string;
  toBranchCode: string;
  toBranchName: string;
  requestedBy: string;
  requestedById: string;
  items: Array<{
    code: string;
    nameAr: string;
    nameEn?: string;
    unit: string;
    requestedQty: number;
    notes?: string;
  }>;
  notes?: string;
}): BranchTransfer {
  const nextNum = memoryTransfers.length + 1;
  const transferNo = `TR-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(nextNum).padStart(3, "0")}`;
  const now = new Date().toISOString();

  const newTransfer: BranchTransfer = {
    id: `TR-${Date.now()}`,
    transferNo,
    fromBranchCode: input.fromBranchCode,
    fromBranchName: input.fromBranchName,
    toBranchCode: input.toBranchCode,
    toBranchName: input.toBranchName,
    requestedBy: input.requestedBy,
    requestedById: input.requestedById,
    requestedAt: now,
    status: "pending_admin_initial",
    items: input.items.map((i) => ({
      ...i,
      adminApprovedQty: i.requestedQty,
      dispatchedQty: i.requestedQty,
      receivedQty: i.requestedQty,
      itemStatus: "pending",
    })),
    timeline: [
      {
        timestamp: now,
        action: "إنشاء طلب التحويل من الفرع الطالب",
        by: input.requestedBy,
        role: `الفرع الطالب (${input.toBranchCode})`,
        notes: input.notes,
      },
    ],
  };

  memoryTransfers.unshift(newTransfer);
  return newTransfer;
}

export function adminInitialApproveTransfer(input: {
  id: string;
  adminName: string;
  notes?: string;
  items?: Array<{
    code: string;
    adminApprovedQty: number;
  }>;
}) {
  const t = memoryTransfers.find((x) => x.id === input.id);
  if (!t) throw new Error("طلب التحويل غير موجود");

  const now = new Date().toISOString();
  t.status = "approved_by_admin";
  t.adminInitialBy = input.adminName;
  t.adminInitialApprovedAt = now;
  t.adminInitialNotes = input.notes || "";

  if (input.items && input.items.length > 0) {
    const map = new Map(input.items.map((i) => [i.code, i.adminApprovedQty]));
    t.items = t.items.map((item) => {
      if (map.has(item.code)) {
        const approved = map.get(item.code)!;
        return {
          ...item,
          adminApprovedQty: approved,
          dispatchedQty: approved,
          receivedQty: approved,
          itemStatus: "approved",
        };
      }
      return item;
    });
  }

  t.timeline.push({
    timestamp: now,
    action: "موافقة الأدمن المبدئية وتوجيه الطلب للفرع المرسل للتجهيز",
    by: input.adminName,
    role: "الإدارة العامة (الأدمن)",
    notes: input.notes,
  });

  return t;
}

export function sourceBranchDispatchTransfer(input: {
  id: string;
  employeeName: string;
  notes?: string;
  items: Array<{
    code: string;
    dispatchedQty: number;
    notes?: string;
  }>;
}) {
  const t = memoryTransfers.find((x) => x.id === input.id);
  if (!t) throw new Error("طلب التحويل غير موجود");

  const now = new Date().toISOString();
  t.status = "dispatched_by_source";
  t.dispatchedBy = input.employeeName;
  t.dispatchedAt = now;
  t.dispatchedNotes = input.notes || "";

  const map = new Map(input.items.map((i) => [i.code, i]));
  t.items = t.items.map((item) => {
    if (map.has(item.code)) {
      const dispatched = map.get(item.code)!;
      return {
        ...item,
        dispatchedQty: dispatched.dispatchedQty,
        receivedQty: dispatched.dispatchedQty,
        itemStatus: "dispatched",
        notes: dispatched.notes || item.notes,
      };
    }
    return item;
  });

  t.timeline.push({
    timestamp: now,
    action: "تجهيز وشحن البضاعة من الفرع المرسل وإحالتها لتأكيد الأدمن",
    by: input.employeeName,
    role: `الفرع المرسل (${t.fromBranchCode})`,
    notes: input.notes,
  });

  return t;
}

export function adminFinalApproveTransfer(input: {
  id: string;
  adminName: string;
  notes?: string;
}) {
  const t = memoryTransfers.find((x) => x.id === input.id);
  if (!t) throw new Error("طلب التحويل غير موجود");

  const now = new Date().toISOString();
  t.status = "in_transit";
  t.adminFinalBy = input.adminName;
  t.adminFinalApprovedAt = now;
  t.adminFinalNotes = input.notes || "";

  t.timeline.push({
    timestamp: now,
    action: "تأكيد الأدمن النهائي للشحن وترحيل الشحنة في الطريق",
    by: input.adminName,
    role: "الإدارة العامة (الأدمن)",
    notes: input.notes,
  });

  return t;
}

export async function destinationReceiveTransfer(input: {
  id: string;
  receivedBy: string;
  notes?: string;
  items: Array<{
    code: string;
    receivedQty: number;
    itemStatus: "received_full" | "received_partial" | "not_received";
    notes?: string;
  }>;
}) {
  const t = memoryTransfers.find((x) => x.id === input.id);
  if (!t) throw new Error("طلب التحويل غير موجود");

  const now = new Date().toISOString();
  t.status = "completed";
  t.receivedBy = input.receivedBy;
  t.receivedAt = now;
  t.receivedNotes = input.notes || "";

  const map = new Map(input.items.map((i) => [i.code, i]));
  t.items = t.items.map((item) => {
    if (map.has(item.code)) {
      const rec = map.get(item.code)!;
      return {
        ...item,
        receivedQty: rec.receivedQty,
        itemStatus: rec.itemStatus,
        notes: rec.notes || item.notes,
      };
    }
    return item;
  });

  t.timeline.push({
    timestamp: now,
    action: "فحص وتأكيد الاستلام النهائي من الفرع الطالب وتوريد المخزون",
    by: input.receivedBy,
    role: `الفرع الطالب (${t.toBranchCode})`,
    notes: input.notes,
  });

  // STOCK INVENTORY MOVEMENTS:
  // 1. Inflow to Destination Branch (+)
  // 2. Outflow from Source Branch (-)
  for (const item of t.items) {
    const receivedAmount = item.receivedQty || 0;
    const dispatchedAmount = item.dispatchedQty || 0;
    const prod = memoryProducts.find((p) => p.code === item.code);

    if (prod && receivedAmount > 0) {
      const prev = prod.qty ?? 0;
      const next = prev + receivedAmount;
      prod.qty = next;
      prod.updatedAt = new Date();

      const inflowLog: StockLog = {
        id: `LOG-INFLOW-${Date.now()}-${prod.id}`,
        productId: prod.id,
        productCode: prod.code,
        productNameAr: prod.nameAr,
        productNameEn: prod.nameEn || "",
        branchCode: t.toBranchCode,
        author: input.receivedBy,
        updatedBy: input.receivedBy,
        timestamp: now,
        action: "add",
        field: "qty",
        prevQty: prev,
        newQty: next,
        delta: receivedAmount,
        changeType: "increase",
        unit: item.unit,
        note: `تحويل وارد من فرع ${t.fromBranchName} (#${t.transferNo})`,
      };
      prod.lastStockUpdate = inflowLog;
      stockLogs.unshift(inflowLog);

      const outflowLog: StockLog = {
        id: `LOG-OUTFLOW-${Date.now()}-${prod.id}`,
        productId: prod.id,
        productCode: prod.code,
        productNameAr: prod.nameAr,
        productNameEn: prod.nameEn || "",
        branchCode: t.fromBranchCode,
        author: t.dispatchedBy || "موظف الفرع المرسل",
        updatedBy: t.dispatchedBy || "موظف الفرع المرسل",
        timestamp: now,
        action: "subtract",
        field: "qty",
        prevQty: Math.max(0, prev + dispatchedAmount),
        newQty: prev,
        delta: dispatchedAmount,
        changeType: "decrease",
        unit: item.unit,
        note: `تحويل صادر إلى فرع ${t.toBranchName} (#${t.transferNo})`,
      };
      stockLogs.unshift(outflowLog);

      if (stockLogs.length > 500) stockLogs.splice(500);

      try {
        await getDb().update(products).set({ qty: next, updatedAt: new Date() }).where(eq(products.id, prod.id));
      } catch (err) {
        console.warn("DB update fallback during transfer intake:", err);
      }
    }
  }

  return t;
}

export function rejectBranchTransfer(input: {
  id: string;
  adminName: string;
  reason: string;
}) {
  const t = memoryTransfers.find((x) => x.id === input.id);
  if (!t) throw new Error("طلب التحويل غير موجود");

  const now = new Date().toISOString();
  t.status = "rejected";
  t.adminInitialBy = input.adminName;
  t.adminInitialNotes = input.reason;

  t.timeline.push({
    timestamp: now,
    action: "رفض طلب التحويل من قبل الإدارة",
    by: input.adminName,
    role: "الإدارة العامة (الأدمن)",
    notes: input.reason,
  });

  return t;
}

export function closeOrArchiveBranchTransfer(input: {
  id: string;
  closedBy: string;
  notes?: string;
}) {
  const t = memoryTransfers.find((x) => x.id === input.id);
  if (!t) throw new Error("طلب التحويل غير موجود");

  const now = new Date().toISOString();
  t.status = "completed";
  t.receivedNotes = input.notes || "تم إغلاق وأرشفة المعاملة";

  t.timeline.push({
    timestamp: now,
    action: "إغلاق وأرشفة المعاملة",
    by: input.closedBy,
    role: "إدارة العمليات / المشرف",
    notes: input.notes || "تم نقل المعاملة بنجاح إلى سجل المعاملات السابقة والمؤرشفة",
  });

  return t;
}

/** تطبيق نتائج الجرد الميداني وتحديث كميات المخزون الحي تلقائياً */
export async function applyAuditCountsToStock(
  items: Array<{
    productCode: string;
    actualQty: number | null;
  }>,
  meta?: {
    auditorName?: string;
    branchCode?: string;
  }
) {
  for (const item of items) {
    if (item.actualQty == null) continue;
    const prod = memoryProducts.find((p) => p.code === item.productCode);
    if (!prod) continue;

    if (prod.mode === "detailed") {
      const packSize = prod.packSize || 1;
      const packs = Math.floor(item.actualQty / packSize);
      const loose = item.actualQty % packSize;
      await updateProduct(prod.id, { packs, loose }, {
        updatedBy: `جرد المخزون (${meta?.auditorName || "المشرف"})`,
        branchCode: meta?.branchCode,
      });
    } else {
      const packSize = prod.packSize || 1;
      let newQty = item.actualQty;
      if ((prod.unitCode === "CTN" || prod.unitCode === "PKT") && packSize > 1) {
        newQty = Math.floor(item.actualQty / packSize);
      }
      await updateProduct(prod.id, { qty: newQty }, {
        updatedBy: `جرد المخزون (${meta?.auditorName || "المشرف"})`,
        branchCode: meta?.branchCode,
      });
    }
  }
}
