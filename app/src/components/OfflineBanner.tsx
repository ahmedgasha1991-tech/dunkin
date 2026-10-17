import { useEffect, useState } from "react";
import { subscribeOnlineStatus, subscribeQueue, type QueuedMutation } from "@/lib/offlineSync";
import { useLanguage } from "@/providers/LanguageContext";

interface OfflineBannerProps {
  onSyncNow?: () => void;
  isSyncing?: boolean;
}

export function OfflineBanner({ onSyncNow, isSyncing }: OfflineBannerProps) {
  const { lang } = useLanguage();
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [queue, setQueue] = useState<QueuedMutation[]>([]);

  useEffect(() => {
    const unsubOnline = subscribeOnlineStatus(setIsOnline);
    const unsubQueue = subscribeQueue(setQueue);
    return () => {
      unsubOnline();
      unsubQueue();
    };
  }, []);

  // If online and nothing is pending in the queue, do not display banner
  if (isOnline && queue.length === 0 && !isSyncing) {
    return null;
  }

  return (
    <div
      className={`w-full py-2 px-3 sm:px-4 text-xs sm:text-sm font-bold transition-all duration-300 shadow-md flex items-center justify-between flex-wrap gap-2 ${
        !isOnline
          ? "bg-amber-500 text-slate-950 border-b border-amber-600"
          : "bg-blue-600 text-white border-b border-blue-700"
      }`}
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-base shrink-0 ${
            !isOnline ? "bg-amber-600/30 text-slate-950" : "bg-white/20 text-white"
          }`}
        >
          <i
            className={`ph-bold ${
              !isOnline ? "ph-wifi-slash" : isSyncing ? "ph-arrows-clockwise animate-spin" : "ph-cloud-arrow-up"
            }`}
          ></i>
        </span>

        <div className="min-w-0">
          {!isOnline ? (
            <div className="leading-tight">
              <span className="font-extrabold">
                {lang === "en" ? "Offline Mode Active" : "أنت تعمل حالياً بدون اتصال بالإنترنت (أوفلاين)"}
              </span>
              <span className="opacity-90 block text-[11px] sm:inline sm:mr-2">
                {lang === "en"
                  ? "All stock counts and edits are safely saved locally on this device"
                  : "جميع الكميات والتعديلات مسجلة ومحفوظة محلياً على جهازك"}
              </span>
            </div>
          ) : (
            <div className="leading-tight">
              <span className="font-extrabold">
                {lang === "en" ? "Connection Restored!" : "تمت استعادة الاتصال بالإنترنت!"}
              </span>
              <span className="opacity-90 block text-[11px] sm:inline sm:mr-2">
                {lang === "en"
                  ? `${queue.length} offline changes are ready to sync to the server`
                  : `يوجد ${queue.length} تعديلات مسجلة بانتظار المزامنة مع السيرفر`}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {queue.length > 0 && (
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
              !isOnline ? "bg-amber-700 text-white" : "bg-white/25 text-white"
            }`}
          >
            {queue.length} {lang === "en" ? "queued" : "في الانتظار"}
          </span>
        )}

        {isOnline && onSyncNow && (
          <button
            onClick={onSyncNow}
            disabled={isSyncing}
            className="px-3 py-1 bg-white text-blue-700 hover:bg-blue-50 active:scale-95 transition rounded-lg text-xs font-black shadow-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <i className={`ph-bold ph-arrows-clockwise ${isSyncing ? "animate-spin" : ""}`}></i>
            <span>{isSyncing ? (lang === "en" ? "Syncing..." : "جاري المزامنة...") : (lang === "en" ? "Sync Now" : "مزامنة الآن")}</span>
          </button>
        )}
      </div>
    </div>
  );
}
