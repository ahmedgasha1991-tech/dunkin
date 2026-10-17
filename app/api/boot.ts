import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import fs from "fs";
import path from "path";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";

const app = new Hono<{ Bindings: HttpBindings }>();
const indexFile = path.resolve(import.meta.dirname, "../index.html");

// --- In-memory Rate Limiter Map ---
interface RateLimitRecord {
  count: number;
  resetTime: number;
}
const ipRateLimits = new Map<string, RateLimitRecord>();

// Clean up stale rate-limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRateLimits.entries()) {
    if (now > record.resetTime) {
      ipRateLimits.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// --- 1. Global Security Headers Middleware ---
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "SAMEORIGIN");
  c.res.headers.set("X-XSS-Protection", "1; mode=block");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});

// --- 2. Rate Limiting Middleware for /api/* ---
app.use("/api/*", async (c, next) => {
  const forwarded = c.req.header("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 200; // max 200 API requests per minute per IP

  let record = ipRateLimits.get(ip);
  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + windowMs };
    ipRateLimits.set(ip, record);
  } else {
    record.count++;
  }

  c.res.headers.set("X-RateLimit-Limit", maxRequests.toString());
  c.res.headers.set("X-RateLimit-Remaining", Math.max(0, maxRequests - record.count).toString());

  if (record.count > maxRequests) {
    return c.json(
      { error: "Too Many Requests", message: "تم تجاوز الحد المسموح من الطلبات، يرجى الانتظار دقيقة" },
      429
    );
  }

  await next();
});

// تقييد حجم البيانات المرسلة لحماية السيرفر من هجمات حجب الخدمة واستهلاك الذاكرة (DoS)
app.use(bodyLimit({ maxSize: 10 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});

if (env.isProduction) {
  app.get("*", (c) => {
    if (c.req.path.startsWith("/api")) {
      return c.json({ error: "Not Found" }, 404);
    }

    if (fs.existsSync(indexFile)) {
      const html = fs.readFileSync(indexFile, "utf-8");
      return c.html(html);
    }
    return c.text("Not Found", 404);
  });
}

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
