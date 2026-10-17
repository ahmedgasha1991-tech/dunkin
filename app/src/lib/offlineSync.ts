import type { Product } from "@db/schema";

const PRODUCTS_CACHE_KEY = "dunkin_offline_products_cache";
const MUTATION_QUEUE_KEY = "dunkin_offline_mutation_queue";

export interface QueuedMutation {
  id: string;
  productId: number;
  productCode?: string;
  fields: Partial<{
    mode: "simple" | "detailed";
    qty: number | null;
    packs: number | null;
    packSize: number | null;
    loose: number | null;
    orderQty: number | null;
    imageUrl: string | null;
  }>;
  branchCode?: string;
  updatedBy: string;
  timestamp: number;
}

// --- 1. Products Caching ---

export function saveCachedProducts(products: Product[]): void {
  if (!products || products.length === 0) return;
  try {
    localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(products));
  } catch (err) {
    console.warn("Failed to save products to offline cache:", err);
  }
}

export function getCachedProducts(): Product[] {
  try {
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Failed to read cached products:", err);
    return [];
  }
}

// --- 2. Offline Mutation Queue ---

export function getQueuedMutations(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(MUTATION_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function queueMutation(item: Omit<QueuedMutation, "id" | "timestamp">): QueuedMutation {
  const queue = getQueuedMutations();
  // If there is an existing pending mutation for the same product, merge fields!
  const existingIdx = queue.findIndex((q) => q.productId === item.productId);

  const entry: QueuedMutation = {
    ...item,
    id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };

  if (existingIdx !== -1) {
    queue[existingIdx] = {
      ...queue[existingIdx],
      fields: {
        ...queue[existingIdx].fields,
        ...item.fields,
      },
      updatedBy: item.updatedBy,
      branchCode: item.branchCode || queue[existingIdx].branchCode,
      timestamp: Date.now(),
    };
  } else {
    queue.push(entry);
  }

  try {
    localStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(queue));
    notifyQueueSubscribers(queue);
  } catch (err) {
    console.warn("Failed to queue offline mutation:", err);
  }

  return entry;
}

export function removeQueuedMutation(id: string): void {
  const queue = getQueuedMutations().filter((q) => q.id !== id);
  try {
    localStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(queue));
    notifyQueueSubscribers(queue);
  } catch {}
}

export function clearQueue(): void {
  try {
    localStorage.removeItem(MUTATION_QUEUE_KEY);
    notifyQueueSubscribers([]);
  } catch {}
}

// --- 3. Reactive Subscribers ---

type QueueListener = (queue: QueuedMutation[]) => void;
type OnlineListener = (isOnline: boolean) => void;

const queueSubscribers = new Set<QueueListener>();
const onlineSubscribers = new Set<OnlineListener>();

function notifyQueueSubscribers(queue: QueuedMutation[]) {
  queueSubscribers.forEach((fn) => {
    try {
      fn(queue);
    } catch {}
  });
}

export function subscribeQueue(fn: QueueListener): () => void {
  queueSubscribers.add(fn);
  fn(getQueuedMutations());
  return () => queueSubscribers.delete(fn);
}

export function subscribeOnlineStatus(fn: OnlineListener): () => void {
  onlineSubscribers.add(fn);
  fn(navigator.onLine);

  const handleOnline = () => {
    onlineSubscribers.forEach((cb) => cb(true));
  };
  const handleOffline = () => {
    onlineSubscribers.forEach((cb) => cb(false));
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    onlineSubscribers.delete(fn);
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

// --- 4. Service Worker Registration Helper ---

export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  // In development, a service worker only causes stale-cache problems with Vite.
  // Unregister any existing worker and purge its caches instead of registering.
  if (import.meta.env.DEV) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
    if ("caches" in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {});
    }
    return;
  }

  {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[PWA] Service Worker registered successfully:", reg.scope);
        })
        .catch((err) => {
          console.warn("[PWA] Service Worker registration failed:", err);
        });
    });
  }
}
