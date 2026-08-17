import {
  Archive, Boxes, ChevronRight, PackageOpen, RotateCcw, SearchX, Settings2, ShoppingBag, Smartphone,
  Tag, TriangleAlert,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { CategoryManager } from "../components/CategoryManager";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { useShop } from "../data/store";
import type { Product } from "../types";
import { formatMoney, formatNumber, matches } from "../utils";

type Filter = "all" | "bulk" | "device" | "low";

/**
 * Stok sayfası yalnızca depoyu yönetir: ürün ekleme/düzenleme, stok girişi,
 * müşteri iadesi, arşivleme ve kategori yönetimi. Satış Tezgah sayfasında yapılır.
 */
export function InventoryPage({ search, onEdit, onAction, onDelete }: {
  search: string;
  onEdit: (product: Product) => void;
  onAction: (product: Product, action: "stock_in" | "customer_return") => void;
  onDelete: (product: Product) => void;
}) {
  const { products, categories, ready } = useShop();
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState("");
  const [managerOpen, setManagerOpen] = useState(false);

  const searched = useMemo(
    () => products.filter((product) =>
      !search.trim() ||
      matches(`${product.name} ${product.brand} ${product.model} ${product.category} ${product.sku} ${product.barcode} ${product.imei}`, search)),
    [products, search],
  );

  const isLow = (product: Product) => product.minimumStock > 0 && product.stock <= product.minimumStock;

  const filtered = useMemo(() => searched.filter((product) => {
    if (category && product.category !== category) return false;
    if (filter === "low") return isLow(product);
    if (filter === "all") return true;
    return product.productType === filter;
  }), [searched, filter, category]);

  const filters: Array<{ id: Filter; label: string; count: number }> = [
    { id: "all", label: "Tümü", count: searched.length },
    { id: "bulk", label: "Ürün", count: searched.filter((item) => item.productType === "bulk").length },
    { id: "device", label: "Telefon", count: searched.filter((item) => item.productType === "device").length },
    { id: "low", label: "Kritik", count: searched.filter(isLow).length },
  ];

  const usedCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of searched) counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    return categories
      .filter((item) => counts.has(item.name))
      .map((item) => ({ name: item.name, count: counts.get(item.name) ?? 0 }));
  }, [searched, categories]);

  const stockValue = products.reduce((sum, product) => sum + Math.max(product.stock, 0) * product.purchasePrice, 0);
  const totalUnits = products.reduce((sum, product) => sum + Math.max(product.stock, 0), 0);

  return (
    <div className="inventory-page">
      <section className="summary-row">
        <SummaryCard icon={Boxes} tone="cyan" label="Toplam Ürün" value={ready ? formatNumber(products.length) : "—"} note={`${formatNumber(totalUnits)} adet stokta`} />
        <SummaryCard icon={Smartphone} tone="violet" label="Telefon" value={ready ? formatNumber(products.filter((item) => item.productType === "device").length) : "—"} note="Tekil cihaz" />
        <SummaryCard icon={ShoppingBag} tone="green" label="Stok Değeri" value={ready ? formatMoney(stockValue, true) : "—"} note="Alış fiyatına göre" />
        <SummaryCard icon={TriangleAlert} tone="amber" label="Kritik" value={ready ? formatNumber(products.filter(isLow).length) : "—"} note="Sipariş verilmeli" />
      </section>

      <section className="panel inventory-panel">
        <div className="inventory-toolbar">
          <div className="toolbar-row">
            <div className="segmented-control">
              {filters.map((item) => (
                <button key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>
                  {item.label}<span>{item.count}</span>
                </button>
              ))}
            </div>

            <button className="button secondary compact" onClick={() => setManagerOpen(true)}>
              <Settings2 size={15} />Kategoriler
            </button>
          </div>

          {usedCategories.length > 1 && (
            <div className="category-filter">
              <button className={category === "" ? "active" : ""} onClick={() => setCategory("")}>Tümü</button>
              {usedCategories.map((item) => (
                <button key={item.name} className={category === item.name ? "active" : ""} onClick={() => setCategory(category === item.name ? "" : item.name)}>
                  {item.name}<span>{item.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="table-scroll">
          <div className="product-table">
            <div className="table-head">
              <span>Ürün</span><span>Kategori</span><span>Alış / Satış</span><span>Stok</span><span>Satılan</span><span />
            </div>

            {!ready ? <Skeleton rows={6} /> : (
              <AnimatePresence mode="popLayout">
                {filtered.map((product) => {
                  const low = isLow(product);
                  return (
                    <motion.div className="product-row" key={product.id} layout exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
                      <button className="product-main" onClick={() => onEdit(product)}>
                        <span className={`product-thumb ${product.productType}`}>
                          {product.productType === "device" ? <Smartphone size={19} /> : <Tag size={19} />}
                        </span>
                        <span className="grow">
                          <b>{product.name}</b>
                          <small>{[product.brand, product.model, product.imei ? `IMEI ···${product.imei.slice(-4)}` : ""].filter(Boolean).join(" · ") || product.sku || "—"}</small>
                        </span>
                      </button>

                      <span className="category-chip">{product.category || "Diğer"}</span>

                      <span className="price-stack">
                        <small>{formatMoney(product.purchasePrice)}</small>
                        <b>{formatMoney(product.salePrice)}</b>
                      </span>

                      <span className={`stock-count ${low ? "low" : ""} ${product.stock <= 0 ? "out" : ""}`}>
                        <b>{product.stock}</b>
                        <small>{product.stock <= 0 ? "Tükendi" : low ? "Kritik" : "Mevcut"}</small>
                      </span>

                      <span className="sold-count">{product.soldCount}</span>

                      <div className="row-actions">
                        <button className="mini-action" onClick={() => onAction(product, "stock_in")}>
                          <Boxes size={14} />Stok Ekle
                        </button>
                        <button className="icon-button small" onClick={() => onAction(product, "customer_return")} title="Müşteri iadesi al" aria-label="İade al">
                          <RotateCcw size={14} />
                        </button>
                        <button className="icon-button small danger" onClick={() => onDelete(product)} title="Arşivle" aria-label="Arşivle">
                          <Archive size={14} />
                        </button>
                        <button className="icon-button small ghost" onClick={() => onEdit(product)} title="Düzenle" aria-label="Düzenle">
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}

            {ready && !filtered.length && (
              <EmptyState
                icon={search ? SearchX : PackageOpen}
                title={search ? "Sonuç bulunamadı" : "Bu listede ürün yok"}
                detail={search ? "Farklı bir kelime deneyin." : "Yeni butonuyla ürün ekleyebilirsiniz."}
              />
            )}
          </div>
        </div>
      </section>

      <CategoryManager open={managerOpen} onClose={() => setManagerOpen(false)} />
    </div>
  );
}

function SummaryCard({ icon: Icon, tone, label, value, note }: {
  icon: typeof Boxes; tone: string; label: string; value: string; note: string;
}) {
  return (
    <motion.div className="summary-card" whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
      <span className={`summary-icon ${tone}`}><Icon size={19} /></span>
      <div>
        <small>{label}</small>
        <b>{value}</b>
        <em>{note}</em>
      </div>
    </motion.div>
  );
}
