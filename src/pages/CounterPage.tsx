import { ChevronDown, PackageOpen, Receipt, SearchX, ShoppingBag, Undo2, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { CategoryGlyph } from "../components/CategoryIcon";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { useShop } from "../data/store";
import type { Product, Sale } from "../types";
import { formatDate, formatMoney, matches, todayIso } from "../utils";

/**
 * Tezgah yalnızca satış yapar. Stok düzeltme, ürün düzenleme ve kategori
 * yönetimi burada bilerek yoktur; onlar Stok sayfasının işidir.
 */
export function CounterPage({ search, onGoToStock }: { search: string; onGoToStock: () => void }) {
  const { products, categories, sales, settings, quickMovement, voidSale, notify } = useShop();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pending, setPending] = useState<Product | null>(null);
  const [undoTarget, setUndoTarget] = useState<Sale | null>(null);

  const visible = useMemo(
    () => products.filter((product) => !search.trim() || matches(`${product.name} ${product.brand} ${product.model} ${product.category} ${product.barcode} ${product.imei}`, search)),
    [products, search],
  );

  const sections = useMemo(() => {
    const byName = new Map(categories.map((category) => [category.name, category]));
    const groups = new Map<string, Product[]>();
    for (const product of visible) {
      const key = product.category || "Diğer";
      groups.set(key, [...(groups.get(key) ?? []), product]);
    }
    return [...groups.entries()]
      .map(([name, items]) => ({
        name,
        icon: byName.get(name)?.icon ?? "package",
        color: byName.get(name)?.color ?? "slate",
        sortOrder: byName.get(name)?.sortOrder ?? 999,
        items: items.sort((a, b) => a.name.localeCompare(b.name, "tr")),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "tr"));
  }, [visible, categories]);

  const today = todayIso();
  const todaySales = useMemo(() => sales.filter((sale) => sale.saleDate.slice(0, 10) === today), [sales, today]);
  const todayTotal = todaySales
    .filter((sale) => sale.status === "completed")
    .reduce((sum, sale) => sum + sale.total, 0);
  const todayCount = todaySales.filter((sale) => sale.status === "completed" && sale.total > 0).length;

  const runSale = async (product: Product) => {
    setBusyId(product.id);
    try {
      const result = await quickMovement(product.id, -1);
      notify(
        `${product.name} satıldı · ${formatMoney(result.total)}`,
        "success",
        result.saleId
          ? {
            label: "Geri Al",
            run: async () => {
              try {
                await voidSale(result.saleId!);
                notify("Satış geri alındı, stok iade edildi");
              } catch (error) {
                notify(String(error), "error");
              }
            },
          }
          : undefined,
      );
    } catch (error) {
      notify(String(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  const sell = (product: Product) => {
    if (product.stock <= 0) return notify(`${product.name} stokta yok`, "error");
    if (settings.confirmQuickSale === "1") { setPending(product); return; }
    void runSale(product);
  };

  const confirmPending = async () => {
    if (!pending) return;
    const target = pending;
    setPending(null);
    await runSale(target);
  };

  const undoSale = async () => {
    if (!undoTarget) return;
    const target = undoTarget;
    setUndoTarget(null);
    try {
      await voidSale(target.id);
      notify("Satış geri alındı, stok iade edildi");
    } catch (error) {
      notify(String(error), "error");
    }
  };

  return (
    <div className="counter-page">
      <section className="counter-main">
        <div className="counter-toolbar">
          <div>
            <h2>Tek dokunuşla satış</h2>
            <p>Ürünün <b>Sat</b> tuşuna basın; stok düşer, kasa ve raporlar anında güncellenir.</p>
          </div>
          <span className="counter-hint">Stok girişi ve ürün düzenleme Stok sayfasında</span>
        </div>

        {!sections.length ? (
          <div className="panel">
            <EmptyState
              icon={search ? SearchX : PackageOpen}
              title={search ? "Eşleşen ürün yok" : "Henüz ürün eklenmedi"}
              detail={search ? "Farklı bir kelime deneyin." : "Kılıf, kulaklık, şarj aleti gibi ürünleri Stok sayfasından ekleyin; burada tek tuşla satarsınız."}
              action={!search ? <button className="button primary" onClick={onGoToStock}>Stok sayfasına git</button> : undefined}
            />
          </div>
        ) : (
          <div className="counter-sections">
            {sections.map((section) => {
              const isCollapsed = collapsed[section.name] && !search.trim();
              const outOfStock = section.items.filter((item) => item.stock <= 0).length;
              return (
                <section className="counter-section panel" key={section.name}>
                  <button
                    className="counter-section-head"
                    onClick={() => setCollapsed((current) => ({ ...current, [section.name]: !current[section.name] }))}
                    aria-expanded={!isCollapsed}
                  >
                    <span className={`category-badge tone-${section.color}`}><CategoryGlyph icon={section.icon} /></span>
                    <div className="grow">
                      <b>{section.name}</b>
                      <small>{section.items.length} ürün{outOfStock ? ` · ${outOfStock} tükendi` : ""}</small>
                    </div>
                    <motion.i animate={{ rotate: isCollapsed ? -90 : 0 }} transition={{ duration: 0.18 }}>
                      <ChevronDown size={18} />
                    </motion.i>
                  </button>

                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.div
                        className="counter-rows"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {section.items.map((product) => {
                          const empty = product.stock <= 0;
                          const low = product.minimumStock > 0 && product.stock <= product.minimumStock;
                          return (
                            <div className={`counter-row ${empty ? "empty" : ""}`} key={product.id}>
                              <div className="counter-info">
                                <b>{product.name}</b>
                                <small>{[product.brand, product.model].filter(Boolean).join(" ") || product.sku || "—"}</small>
                              </div>

                              <span className="counter-price">{formatMoney(product.salePrice)}</span>

                              <span className={`counter-stock ${empty ? "out" : low ? "low" : ""}`}>
                                <b>{product.stock}</b>
                                <small>{empty ? "Tükendi" : low ? "Kritik" : "adet"}</small>
                              </span>

                              <button
                                className="sell-button"
                                onClick={() => sell(product)}
                                disabled={empty || busyId === product.id}
                                title={empty ? "Stokta yok" : `${product.name} sat`}
                              >
                                {busyId === product.id ? <span className="spinner" aria-hidden /> : <ShoppingBag size={17} />}
                                Sat
                              </button>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              );
            })}
          </div>
        )}
      </section>

      <aside className="counter-side">
        <div className="till-card">
          <span className="till-label"><Wallet size={15} />Bugünkü kasa</span>
          <strong>{formatMoney(todayTotal, true)}</strong>
          <small>{todayCount} satış</small>
        </div>

        <section className="panel counter-history">
          <header className="panel-header">
            <div><h2>Son Satışlar</h2><span>Bugün</span></div>
            <span className="round-icon"><Receipt size={16} /></span>
          </header>

          {todaySales.length ? (
            <div className="history-list">
              {todaySales.slice(0, 14).map((sale) => (
                <motion.div
                  key={sale.id}
                  className={`history-row ${sale.status === "voided" ? "voided" : ""}`}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <span className="history-icon"><ShoppingBag size={14} /></span>
                  <div className="grow">
                    <b>{sale.summary || "Satış"}</b>
                    <small>{formatDate(sale.saleDate, true)}{sale.status === "voided" ? " · geri alındı" : ""}</small>
                  </div>
                  <strong>{formatMoney(sale.total)}</strong>
                  {sale.status === "completed" && (
                    <button
                      className="icon-button small"
                      onClick={() => setUndoTarget(sale)}
                      title="Bu satışı geri al"
                      aria-label="Satışı geri al"
                    >
                      <Undo2 size={14} />
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Receipt} title="Bugün satış yok" detail="Sat tuşuna bastığınızda satışlar burada listelenir." />
          )}
        </section>
      </aside>

      <ConfirmDialog
        open={Boolean(pending)}
        title="Satış yapılsın mı?"
        detail={pending ? `${pending.name} · ${formatMoney(pending.salePrice)}` : ""}
        confirmLabel="Sat"
        icon={ShoppingBag}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />

      <ConfirmDialog
        open={Boolean(undoTarget)}
        title="Satış geri alınsın mı?"
        detail={undoTarget ? `${undoTarget.summary} · ${formatMoney(undoTarget.total)} kasadan düşülecek, stok iade edilecek.` : ""}
        tone="warning"
        confirmLabel="Geri Al"
        icon={Undo2}
        onConfirm={undoSale}
        onCancel={() => setUndoTarget(null)}
      />
    </div>
  );
}
