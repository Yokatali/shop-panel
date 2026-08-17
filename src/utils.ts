import type { RepairStatus } from "./types";

/* ------------------------------------------------------------------ para --
 * Tutarlar veritabanında kuruş (tam sayı) olarak saklanır; kayan noktalı
 * hesaplardan doğan yuvarlama hataları böylece hiç oluşmaz.
 */

export const formatMoney = (kurus: number, compact = false) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: compact ? 0 : 2,
    minimumFractionDigits: compact ? 0 : 2,
    notation: compact && Math.abs(kurus) >= 1_000_000_00 ? "compact" : "standard",
  }).format(kurus / 100);

export const formatNumber = (value: number) => new Intl.NumberFormat("tr-TR").format(value);

/** "1.500,50", "1500,5", "1500.50" ve "1500" yazımlarının hepsini kuruşa çevirir. */
export const parseMoney = (value: string | number): number => {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : 0;
  const cleaned = value.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned || cleaned === "-") return 0;

  let normalized = cleaned;
  if (normalized.includes(",")) {
    // Virgül varsa ondalık ayracıdır, noktalar binlik ayracıdır.
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    const parts = normalized.split(".");
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      // "1.500" binlik, "12.5" ondalıktır.
      normalized = last.length === 3 ? parts.join("") : `${parts.slice(0, -1).join("")}.${last}`;
    }
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

/** Kuruşu düzenlenebilir metne çevirir. Sıfır boş döner ki alanda takılı "0" kalmasın. */
export const moneyToInput = (kurus: number): string => {
  if (!kurus) return "";
  const negative = kurus < 0;
  const absolute = Math.abs(Math.round(kurus));
  const lira = Math.floor(absolute / 100);
  const cents = absolute % 100;
  const text = cents === 0 ? String(lira) : `${lira},${String(cents).padStart(2, "0")}`;
  return negative ? `-${text}` : text;
};

/** Sayısal alanlarda sıfır boş gösterilir; kullanıcı yazdığında başta "0" kalmaz. */
export const numberToInput = (value: number): string => (value ? String(value) : "");

/** Yalnızca rakam ve tek bir ondalık ayracına izin verir. */
export const sanitizeMoneyText = (value: string): string => {
  const unified = value.replace(/\./g, ",").replace(/[^\d,]/g, "");
  const [whole, ...rest] = unified.split(",");
  if (!rest.length) return whole;
  return `${whole},${rest.join("").slice(0, 2)}`;
};

export const sanitizeIntegerText = (value: string): string => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

export const parseInteger = (value: string): number => {
  const digits = sanitizeIntegerText(value);
  return digits ? Number(digits) : 0;
};

/* --------------------------------------------------------------- telefon -- */

/** +90, 90 ve baştaki 0 atılır. Kırpma yapılmaz: fazla hane doğrulamada yakalanmalı. */
const phoneDigits = (value: string): string => {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length > 10) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
};

/** Yazarken uygulanan sınır: en fazla 10 hane. */
export const normalizePhone = (value: string): string => phoneDigits(value).slice(0, 10);

/** Tam 10 hane; cep (5XX) veya sabit hat (2XX/3XX/4XX) alan koduyla başlamalı. */
export const isValidPhone = (value: string): boolean => /^[2-5]\d{9}$/.test(phoneDigits(value));

export const formatPhone = (value: string): string => {
  const digits = normalizePhone(value);
  if (!digits) return "";
  const area = digits.slice(0, 3);
  const first = digits.slice(3, 6);
  const second = digits.slice(6, 8);
  const third = digits.slice(8, 10);
  let text = `0(${area}`;
  if (digits.length > 3) text += `) ${first}`;
  if (digits.length > 6) text += ` ${second}`;
  if (digits.length > 8) text += ` ${third}`;
  return text;
};

export const phoneHref = (value: string): string => {
  const digits = normalizePhone(value);
  return digits ? `tel:+90${digits}` : "";
};

/* ----------------------------------------------------------------- tarih -- */

const pad = (value: number) => String(value).padStart(2, "0");

/** Yerel saate göre YYYY-AA-GG. UTC kaymasıyla bir gün öteye düşmez. */
export const toIso = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const todayIso = (): string => toIso(new Date());

export const isoDaysAgo = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toIso(date);
};

export const isoMonthStart = (): string => todayIso().slice(0, 7) + "-01";

/** "YYYY-AA-GG" metnini yerel saatte bir Date'e çevirir. */
export const fromIso = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

export const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/** Pazartesi ile başlar. */
export const WEEKDAY_NAMES = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];

export const addMonths = (date: Date, amount: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1);

/** Takvim ızgarası: ayın günleri, başındaki ve sonundaki komşu ay günleriyle tamamlanır. */
export const monthGrid = (year: number, month: number): Array<{ date: Date; inMonth: boolean }> => {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Pazartesi = 0
  const cells: Array<{ date: Date; inMonth: boolean }> = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(year, month, index + 1 - offset);
    cells.push({ date, inMonth: date.getMonth() === month });
  }
  return cells;
};

export const formatDate = (value: string, includeTime = false): string => {
  if (!value) return "—";
  const date = fromIso(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
};

export const formatLongDate = (value: string): string => {
  const date = fromIso(value);
  if (!date) return value || "—";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(date);
};

export const relativeTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat("tr", { numeric: "auto" });
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, "minute");
  const hours = Math.round(diffMinutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
};

/** Planlanan teslim tarihi geçmiş mi? */
export const isOverdue = (plannedDeliveryAt: string, status: string): boolean =>
  Boolean(plannedDeliveryAt) &&
  plannedDeliveryAt.slice(0, 10) < todayIso() &&
  !["delivered", "cancelled"].includes(status);

/* ---------------------------------------------------------------- durumlar */

export const repairStatus: Record<RepairStatus, { label: string; tone: string }> = {
  received: { label: "Alındı", tone: "blue" },
  diagnosis: { label: "İnceleniyor", tone: "violet" },
  waiting_approval: { label: "Onay Bekliyor", tone: "amber" },
  waiting_part: { label: "Parça Bekliyor", tone: "amber" },
  in_progress: { label: "Tamirde", tone: "blue" },
  ready: { label: "Hazır", tone: "green" },
  delivered: { label: "Teslim Edildi", tone: "neutral" },
  cancelled: { label: "İptal", tone: "red" },
};

export const ACTIVE_REPAIR_STATUSES: RepairStatus[] = [
  "received", "diagnosis", "waiting_approval", "waiting_part", "in_progress", "ready",
];

export const isActiveRepair = (status: string): boolean => !["delivered", "cancelled"].includes(status);

export const paymentLabel = (method: string): string =>
  method === "card" ? "Kart" : method === "transfer" ? "Havale" : "Nakit";

export const initials = (value: string): string =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr-TR"))
    .join("");

/** Türkçe karakterleri de doğru karşılaştıran arama yardımcısı. */
export const matches = (haystack: string, needle: string): boolean =>
  haystack.toLocaleLowerCase("tr-TR").includes(needle.trim().toLocaleLowerCase("tr-TR"));
