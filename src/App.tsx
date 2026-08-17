import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "./components/AppShell";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ExpenseForm } from "./components/ExpenseForm";
import { GuidedTour } from "./components/GuidedTour";
import { ProductForm } from "./components/ProductForm";
import { RepairForm } from "./components/RepairForm";
import { SettingsModal } from "./components/SettingsModal";
import { StockActionModal } from "./components/StockActionModal";
import { Toast } from "./components/Toast";
import { api } from "./data/api";
import { useShop } from "./data/store";
import { CashPage } from "./pages/CashPage";
import { CounterPage } from "./pages/CounterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InventoryPage } from "./pages/InventoryPage";
import { RepairsPage } from "./pages/RepairsPage";
import { ReportsPage } from "./pages/ReportsPage";
import type { Expense, PageId, Product, Repair } from "./types";
import { todayIso } from "./utils";

/** Satış yalnızca Tezgah sayfasında yapılır; bu pencere sadece depoyu düzenler. */
type StockAction = "stock_in" | "customer_return";
type SettingsTab = "appearance" | "shop" | "data" | "about";

const PAGES: PageId[] = ["dashboard", "counter", "inventory", "repairs", "cash", "reports"];

export default function App() {
  const { settings, saveSettings, notify, ready, deleteProduct } = useShop();

  const [activePage, setActivePage] = useState<PageId>(() => {
    const requested = new URLSearchParams(window.location.search).get("page") as PageId | null;
    return requested && PAGES.includes(requested) ? requested : "dashboard";
  });
  const [search, setSearch] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [pendingPage, setPendingPage] = useState<PageId | null>(null);
  const [exitConfirm, setExitConfirm] = useState(false);

  const [tourOpen, setTourOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("appearance");
  const [lastBackup, setLastBackup] = useState(() => localStorage.getItem("dukkan-last-backup-at") || "");
  const [restoreSource, setRestoreSource] = useState("");

  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [repairFormOpen, setRepairFormOpen] = useState(false);
  const [editingRepair, setEditingRepair] = useState<Repair | null>(null);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockAction, setStockAction] = useState<StockAction>("stock_in");
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const forceClose = useRef(false);

  /* --------------------------------------------------------------- görünüm */

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.density = settings.density;
  }, [settings.theme, settings.density]);

  const toggleTheme = () => {
    void saveSettings({ ...settings, theme: settings.theme === "dark" ? "light" : "dark" });
  };

  /* ------------------------------------------------------- kapatma koruması */

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!api.isDesktop()) return;
    let dispose: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      dispose = await getCurrentWindow().onCloseRequested((event) => {
        if (forceClose.current || !isDirty) return;
        event.preventDefault();
        setExitConfirm(true);
      });
    });
    return () => dispose?.();
  }, [isDirty]);

  /* ------------------------------------------------------------ otomatik yedek */

  useEffect(() => {
    if (!ready || !api.isDesktop() || settings.autoBackup !== "1") return;
    const key = "dukkan-last-auto-backup";
    if (localStorage.getItem(key) === todayIso()) return;
    const externalDir = settings.backupDir || undefined;
    api.backup(externalDir)
      .catch(() => api.backup())
      .then((result) => {
        localStorage.setItem(key, todayIso());
        localStorage.setItem("dukkan-last-backup-at", result.createdAt);
        setLastBackup(result.createdAt);
      })
      .catch(() => undefined);
  }, [ready, settings.autoBackup, settings.backupDir]);

  /* ---------------------------------------------------------------- kısayol */

  const openNewRecord = useCallback(() => {
    if (activePage === "repairs") { setEditingRepair(null); setRepairFormOpen(true); return; }
    if (activePage === "cash") { setEditingExpense(null); setExpenseFormOpen(true); return; }
    setEditingProduct(null);
    setProductFormOpen(true);
  }, [activePage]);

  const openStockAction = useCallback((product: Product | null, action: StockAction) => {
    setStockProduct(product);
    setStockAction(action);
    setStockModalOpen(true);
  }, []);

  /* ------------------------------------------------------------- gezinme */

  // Yan etkiler güncelleyici fonksiyonun içine konmaz: StrictMode onu iki kez çağırabilir.
  const navigate = useCallback((page: PageId) => {
    if (page === activePage) return;
    if (isDirty) { setPendingPage(page); return; }
    setActivePage(page);
    setSearch("");
  }, [activePage, isDirty]);

  /** Satış tek yerde toplandı: her hızlı satış yolu Tezgah sayfasına götürür. */
  const goToCounter = useCallback(() => navigate("counter"), [navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".global-search input")?.focus();
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      const key = event.key.toLocaleLowerCase("tr-TR");
      if (key === "n") { event.preventDefault(); openNewRecord(); }
      if (key === "s") { event.preventDefault(); goToCounter(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openNewRecord, goToCounter]);

  /* ------------------------------------------------------------- işlemler */

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteProduct(deleteTarget.id);
      notify(`${deleteTarget.name} arşivlendi`);
      setDeleteTarget(null);
    } catch (error) {
      notify(String(error), "error");
    } finally {
      setDeleteBusy(false);
    }
  };

  const confirmExit = async () => {
    setExitConfirm(false);
    forceClose.current = true;
    setIsDirty(false);
    if (api.isDesktop()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().destroy();
    }
  };

  const createManualBackup = async () => {
    try {
      let destination: string | undefined;
      if (api.isDesktop()) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({ directory: true, multiple: false, title: "Yedek klasörü seçin" });
        if (typeof selected !== "string") return;
        destination = selected;
        void saveSettings({ ...settings, backupDir: selected });
      }
      const result = await api.backup(destination);
      localStorage.setItem("dukkan-last-backup-at", result.createdAt);
      setLastBackup(result.createdAt);
      notify("Yedek doğrulandı ve kaydedildi");
    } catch (error) {
      notify(String(error), "error");
    }
  };

  const chooseRestoreFile = async () => {
    if (!api.isDesktop()) return notify("Geri yükleme masaüstü uygulamasında kullanılabilir", "error");
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      title: "Yedek dosyası seçin",
      filters: [{ name: "Dükkan Yedeği", extensions: ["sqlite"] }],
    });
    if (typeof selected === "string") setRestoreSource(selected);
  };

  const restoreBackup = async () => {
    const source = restoreSource;
    setRestoreSource("");
    try {
      await api.restore(source);
      setSettingsOpen(false);
      window.location.reload();
    } catch (error) {
      notify(String(error), "error");
    }
  };

  const openSettings = (tab: SettingsTab = "appearance") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  return (
    <>
      <AppShell
        activePage={activePage}
        onNavigate={navigate}
        onHelp={() => setTourOpen(true)}
        onQuickSale={goToCounter}
        onNewRecord={openNewRecord}
        onSettings={() => openSettings("appearance")}
        onDataSafety={() => openSettings("data")}
        onToggleTheme={toggleTheme}
        search={search}
        onSearch={setSearch}
      >
        {activePage === "dashboard" && <DashboardPage onQuickSale={goToCounter} onNavigate={navigate} />}
        {activePage === "counter" && <CounterPage search={search} onGoToStock={() => navigate("inventory")} />}
        {activePage === "inventory" && (
          <InventoryPage
            search={search}
            onEdit={(product) => { setEditingProduct(product); setProductFormOpen(true); }}
            onAction={openStockAction}
            onDelete={setDeleteTarget}
          />
        )}
        {activePage === "repairs" && (
          <RepairsPage
            search={search}
            onEdit={(repair) => { setEditingRepair(repair); setRepairFormOpen(true); }}
            onNew={() => { setEditingRepair(null); setRepairFormOpen(true); }}
          />
        )}
        {activePage === "cash" && (
          <CashPage
            onNewExpense={() => { setEditingExpense(null); setExpenseFormOpen(true); }}
            onEditExpense={(expense) => { setEditingExpense(expense); setExpenseFormOpen(true); }}
          />
        )}
        {activePage === "reports" && <ReportsPage />}
      </AppShell>

      <ProductForm
        open={productFormOpen}
        product={editingProduct}
        onClose={() => { setProductFormOpen(false); setEditingProduct(null); setIsDirty(false); }}
        onDirtyChange={setIsDirty}
      />
      <RepairForm
        open={repairFormOpen}
        repair={editingRepair}
        onClose={() => { setRepairFormOpen(false); setEditingRepair(null); setIsDirty(false); }}
        onDirtyChange={setIsDirty}
      />
      <ExpenseForm
        open={expenseFormOpen}
        expense={editingExpense}
        onClose={() => { setExpenseFormOpen(false); setEditingExpense(null); setIsDirty(false); }}
        onDirtyChange={setIsDirty}
      />
      <StockActionModal
        open={stockModalOpen}
        initialProduct={stockProduct}
        initialAction={stockAction}
        onClose={() => { setStockModalOpen(false); setStockProduct(null); setIsDirty(false); }}
        onDirtyChange={setIsDirty}
      />

      <SettingsModal
        open={settingsOpen}
        initialTab={settingsTab}
        onClose={() => setSettingsOpen(false)}
        lastBackup={lastBackup}
        onBackup={createManualBackup}
        onRestore={chooseRestoreFile}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Ürün arşivlensin mi?"
        detail={deleteTarget ? `${deleteTarget.name} · Stok ${deleteTarget.stock}. Geçmiş satışlar korunur.` : ""}
        tone="danger"
        confirmLabel="Arşivle"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        busy={deleteBusy}
      />
      <ConfirmDialog
        open={Boolean(pendingPage)}
        title="Kaydedilmemiş değişiklikler var"
        detail="Bu sayfadan ayrılmak istiyor musunuz?"
        tone="warning"
        confirmLabel="Kaydetmeden Çık"
        onConfirm={() => {
          if (!pendingPage) return;
          setIsDirty(false);
          setActivePage(pendingPage);
          setSearch("");
          setPendingPage(null);
        }}
        onCancel={() => setPendingPage(null)}
      />
      <ConfirmDialog
        open={exitConfirm}
        title="Kaydetmeden kapatılsın mı?"
        detail="Kaydedilmemiş değişiklikleriniz var."
        tone="warning"
        confirmLabel="Kapat"
        onConfirm={confirmExit}
        onCancel={() => setExitConfirm(false)}
      />
      <ConfirmDialog
        open={Boolean(restoreSource)}
        title="Yedek geri yüklensin mi?"
        detail="Mevcut veriler önce otomatik yedeklenir, ardından uygulama yeniden yüklenir."
        tone="warning"
        confirmLabel="Geri Yükle"
        onConfirm={restoreBackup}
        onCancel={() => setRestoreSource("")}
      />

      <GuidedTour open={tourOpen} onClose={() => setTourOpen(false)} onNavigate={navigate} />
      <Toast />
    </>
  );
}
