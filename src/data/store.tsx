import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Category,
  CategoryInput,
  DashboardData,
  Expense,
  ExpenseInput,
  MovementResult,
  Product,
  ProductInput,
  Repair,
  RepairInput,
  ReportData,
  Sale,
  Settings,
  StockMovementInput,
} from "../types";
import { api } from "./api";

export type ToastAction = { label: string; run: () => void | Promise<void> };
export type ToastState = {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
  action?: ToastAction;
} | null;

const DEFAULT_SETTINGS: Settings = {
  shopName: "Dükkan",
  shopPhone: "",
  theme: "light",
  density: "comfortable",
  autoBackup: "1",
  backupDir: "",
  confirmQuickSale: "0",
};

type ShopContextValue = {
  ready: boolean;
  products: Product[];
  categories: Category[];
  repairs: Repair[];
  expenses: Expense[];
  sales: Sale[];
  dashboard: DashboardData | null;
  settings: Settings;
  /** Her yazma işleminden sonra artar; rapor gibi türetilmiş veriler buna bakar. */
  version: number;
  toast: ToastState;

  notify: (message: string, tone?: "success" | "error" | "info", action?: ToastAction) => void;
  dismissToast: () => void;
  reload: () => Promise<void>;

  saveProduct: (input: ProductInput) => Promise<number>;
  deleteProduct: (id: number) => Promise<void>;
  saveCategory: (input: CategoryInput) => Promise<number>;
  deleteCategory: (id: number) => Promise<void>;
  stockMovement: (input: StockMovementInput) => Promise<MovementResult>;
  quickMovement: (productId: number, quantityDelta: number) => Promise<MovementResult>;
  voidSale: (id: number) => Promise<void>;
  saveRepair: (input: RepairInput) => Promise<number>;
  deleteRepair: (id: number) => Promise<void>;
  saveExpense: (input: ExpenseInput) => Promise<number>;
  deleteExpense: (id: number) => Promise<void>;
  saveSettings: (input: Settings) => Promise<void>;
  /** Tüm iş verisini siler; yedeğin yolunu döner. */
  resetAllData: () => Promise<string>;
};

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | null>(null);
  const mounted = useRef(true);

  // StrictMode geliştirme modunda etkileri iki kez çalıştırır; bayrak yeniden
  // bağlanışta true'ya döndürülmezse ilk temizlik tüm güncellemeleri kalıcı olarak susturur.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const notify = useCallback(
    (message: string, tone: "success" | "error" | "info" = "success", action?: ToastAction) => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      const clean = message.replace(/^Error:\s*/, "").trim();
      setToast({ id: Date.now(), message: clean, tone, action });
      toastTimer.current = window.setTimeout(() => setToast(null), action ? 7000 : 3600);
    },
    [],
  );

  const dismissToast = useCallback(() => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  /** Tüm veriyi tek seferde tazeler: bir sayfadaki değişiklik her yerde görünür. */
  const reload = useCallback(async () => {
    const [nextProducts, nextCategories, nextRepairs, nextExpenses, nextSales, nextDashboard] =
      await Promise.all([
        api.products(),
        api.categories(),
        api.repairs(),
        api.expenses(),
        api.sales(80),
        api.dashboard(),
      ]);
    if (!mounted.current) return;
    setProducts(nextProducts);
    setCategories(nextCategories);
    setRepairs(nextRepairs);
    setExpenses(nextExpenses);
    setSales(nextSales);
    setDashboard(nextDashboard);
    setVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await api.settings();
        if (active) setSettings({ ...DEFAULT_SETTINGS, ...stored });
      } catch {
        // Ayarlar okunamazsa varsayılanlarla devam edilir.
      }
      try {
        await reload();
      } catch (error) {
        if (active) notify(String(error), "error");
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => { active = false; };
  }, [reload, notify]);

  /** Yazma işlemini çalıştırır ve ardından tüm ekranları tazeler. */
  const mutate = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      const result = await action();
      await reload();
      return result;
    },
    [reload],
  );

  const value = useMemo<ShopContextValue>(
    () => ({
      ready,
      products,
      categories,
      repairs,
      expenses,
      sales,
      dashboard,
      settings,
      version,
      toast,
      notify,
      dismissToast,
      reload,

      saveProduct: (input) => mutate(() => api.saveProduct(input)),
      deleteProduct: (id) => mutate(() => api.deleteProduct(id)),
      saveCategory: (input) => mutate(() => api.saveCategory(input)),
      deleteCategory: (id) => mutate(() => api.deleteCategory(id)),
      stockMovement: (input) => mutate(() => api.stockMovement(input)),
      quickMovement: (productId, quantityDelta) => mutate(() => api.quickMovement(productId, quantityDelta)),
      voidSale: (id) => mutate(() => api.voidSale(id)),
      saveRepair: (input) => mutate(() => api.saveRepair(input)),
      deleteRepair: (id) => mutate(() => api.deleteRepair(id)),
      saveExpense: (input) => mutate(() => api.saveExpense(input)),
      deleteExpense: (id) => mutate(() => api.deleteExpense(id)),
      resetAllData: async () => {
        const sonuc = await api.resetAllData();
        await reload();
        return sonuc.path;
      },
      saveSettings: async (input) => {
        const saved = await api.saveSettings(input);
        if (mounted.current) setSettings({ ...DEFAULT_SETTINGS, ...saved });
      },
    }),
    [ready, products, categories, repairs, expenses, sales, dashboard, settings, version, toast, notify, dismissToast, reload, mutate],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopContextValue {
  const context = useContext(ShopContext);
  if (!context) throw new Error("useShop, ShopProvider içinde kullanılmalıdır.");
  return context;
}

/** Rapor tarih aralığına bağlı olduğu için ayrı tutulur; her veri değişiminde tazelenir. */
export function useReport(start: string, end: string) {
  const { version, ready } = useShop();
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    let active = true;
    setError("");
    api
      .report(start, end)
      .then((report) => { if (active) setData(report); })
      .catch((reason) => { if (active) { setData(null); setError(String(reason).replace(/^Error:\s*/, "")); } });
    return () => { active = false; };
  }, [start, end, version, ready]);

  return { data, error };
}
