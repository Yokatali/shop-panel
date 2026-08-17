import {
  BarChart3, Boxes, CircleDollarSign, DatabaseBackup, HelpCircle, LayoutDashboard, Moon,
  PackagePlus, Search, Settings, ShoppingBag, Smartphone, Sun, Wrench, X, Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useShop } from "../data/store";
import type { PageId } from "../types";
import { isActiveRepair } from "../utils";

const NAV_ITEMS: Array<{ id: PageId; icon: typeof LayoutDashboard; purpose: string }> = [
  { id: "dashboard", icon: LayoutDashboard, purpose: "Günün özeti" },
  { id: "counter", icon: ShoppingBag, purpose: "Satış yap" },
  { id: "inventory", icon: Boxes, purpose: "Depoyu yönet" },
  { id: "repairs", icon: Wrench, purpose: "Servis takibi" },
  { id: "cash", icon: CircleDollarSign, purpose: "Gider ve kasa" },
  { id: "reports", icon: BarChart3, purpose: "Kâr analizi" },
];

/** Her sayfanın tek bir işi var; başlık ve "Yeni" tuşu buna göre değişir. */
const TITLES: Record<PageId, { title: string; eyebrow: string }> = {
  dashboard: { title: "Genel Bakış", eyebrow: "ÖZET" },
  counter: { title: "Tezgah", eyebrow: "SATIŞ" },
  inventory: { title: "Stok", eyebrow: "DEPO" },
  repairs: { title: "Tamir", eyebrow: "SERVİS" },
  cash: { title: "Kasa", eyebrow: "FİNANS" },
  reports: { title: "Raporlar", eyebrow: "ANALİZ" },
};

const NEW_LABEL: Record<PageId, string> = {
  dashboard: "Yeni Ürün",
  counter: "",
  inventory: "Yeni Ürün",
  repairs: "Yeni Tamir",
  cash: "Yeni Gider",
  reports: "Yeni Ürün",
};

const SEARCHABLE: PageId[] = ["counter", "inventory", "repairs"];

const SEARCH_PLACEHOLDER: Partial<Record<PageId, string>> = {
  counter: "Satılacak ürünü ara",
  inventory: "Ürün, barkod veya IMEI ara",
  repairs: "Müşteri, marka veya fiş no ara",
};

const NAV_LABELS: Record<PageId, string> = {
  dashboard: "Genel Bakış",
  counter: "Tezgah",
  inventory: "Stok",
  repairs: "Tamir",
  cash: "Kasa",
  reports: "Raporlar",
};

type AppShellProps = {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  children: ReactNode;
  onHelp: () => void;
  onQuickSale: () => void;
  onNewRecord: () => void;
  onSettings: () => void;
  onDataSafety: () => void;
  onToggleTheme: () => void;
  search: string;
  onSearch: (value: string) => void;
};

export function AppShell({
  activePage, onNavigate, children, onHelp, onQuickSale, onNewRecord,
  onSettings, onDataSafety, onToggleTheme, search, onSearch,
}: AppShellProps) {
  const { repairs, products, settings } = useShop();
  const page = TITLES[activePage];
  const date = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const canSearch = SEARCHABLE.includes(activePage);

  // Rozetler canlı veriden gelir; sabit sayı yoktur.
  const badges: Partial<Record<PageId, number>> = {
    repairs: repairs.filter((repair) => isActiveRepair(repair.status)).length,
    inventory: products.filter((product) => product.minimumStock > 0 && product.stock <= product.minimumStock).length,
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <span aria-hidden><Smartphone size={20} strokeWidth={2.3} /></span>
          <div>
            <b>{settings.shopName || "Dükkan"}</b>
            <small>PANEL</small>
          </div>
        </div>

        <nav className="nav-list" data-tour="navigation" aria-label="Bölümler">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.id === activePage;
            const badge = badges[item.id];
            return (
              <button
                key={item.id}
                className={active ? "active" : ""}
                onClick={() => onNavigate(item.id)}
                aria-current={active ? "page" : undefined}
                data-tour={["counter", "inventory", "reports"].includes(item.id) ? item.id : undefined}
              >
                {active && <motion.i layoutId="nav-indicator" transition={{ type: "spring", stiffness: 440, damping: 36 }} aria-hidden />}
                <Icon size={18} strokeWidth={active ? 2.4 : 2} />
                <span>
                  <b>{NAV_LABELS[item.id]}</b>
                  <small>{item.purpose}</small>
                </span>
                {badge ? <em>{badge > 99 ? "99+" : badge}</em> : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <button className="help-button" onClick={onHelp}>
            <span aria-hidden><HelpCircle size={17} /></span>
            <div><b>Nasıl kullanılır?</b><small>Hızlı tur</small></div>
          </button>
          <button className="data-safety-button" onClick={onDataSafety}>
            <DatabaseBackup size={14} />
            <span>Veriler güvende</span>
            <i aria-hidden />
          </button>
        </div>
      </aside>

      <main className="main-column">
        <header className="topbar">
          <div className="page-heading">
            <span className="eyebrow">{page.eyebrow}</span>
            <h1>{page.title}</h1>
            <small>{date}</small>
          </div>

          <div className="topbar-actions">
            <AnimatePresence mode="popLayout">
              {canSearch && (
                <motion.label
                  className="global-search"
                  data-tour="search"
                  key="search"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 264 }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Search size={16} aria-hidden />
                  <input
                    value={search}
                    onChange={(event) => onSearch(event.target.value)}
                    placeholder={SEARCH_PLACEHOLDER[activePage]}
                    aria-label="Ara"
                  />
                  {search
                    ? <button className="search-clear" onClick={() => onSearch("")} aria-label="Aramayı temizle"><X size={14} /></button>
                    : <kbd>F2</kbd>}
                </motion.label>
              )}
            </AnimatePresence>

            <button
              className="icon-button"
              onClick={onToggleTheme}
              aria-label={settings.theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
              title={settings.theme === "dark" ? "Açık tema" : "Koyu tema"}
            >
              {settings.theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button className="icon-button" onClick={onSettings} aria-label="Ayarlar" title="Ayarlar" data-tour="settings">
              <Settings size={18} />
            </button>

            {activePage !== "counter" && (
              <button className="button quick-sale" onClick={onQuickSale} data-tour="quick-sale" title="Tezgah sayfasına git">
                <Zap size={16} fill="currentColor" />Hızlı Satış
              </button>
            )}

            {/* Tezgahın tek işi satış; kayıt ekleme diğer bölümlerin işi. */}
            {activePage !== "counter" && (
              <button className="button primary" onClick={onNewRecord} data-tour="new-record">
                <PackagePlus size={17} />{NEW_LABEL[activePage]}
              </button>
            )}
          </div>
        </header>

        <motion.div
          className="page-scroll"
          key={activePage}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
