import { ArrowRight, Boxes, RotateCcw, Search, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useShop } from "../data/store";
import type { Product } from "../types";
import { formatMoney, matches } from "../utils";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";
import { MoneyField, Stepper } from "./fields";

/** Satış burada yapılmaz; Tezgah sayfasının işidir. Bu pencere yalnızca depoyu düzenler. */
type Action = "stock_in" | "customer_return";

const actionMeta: Record<Action, { title: string; label: string; short: string; icon: typeof Boxes; hint: string }> = {
  stock_in: {
    title: "Stok Girişi",
    label: "Stoğa Ekle",
    short: "Stok Girişi",
    icon: Boxes,
    hint: "Tedarikçiden gelen ürünü depoya ekler. Kasayı etkilemez.",
  },
  customer_return: {
    title: "Müşteri İadesi",
    label: "İadeyi Onayla",
    short: "Müşteri İadesi",
    icon: RotateCcw,
    hint: "Satılan ürün geri geldi. Stok artar, tutar kasadan düşülür.",
  },
};

export function StockActionModal({ open, initialProduct, initialAction = "stock_in", onClose, onDirtyChange }: {
  open: boolean;
  initialProduct: Product | null;
  initialAction?: Action;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { products, stockMovement, notify } = useShop();
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState<number | null>(null);
  const [action, setAction] = useState<Action>(initialAction);
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  // Ürün canlı listeden okunur; stok başka bir yerde değişse bile günceldir.
  const product = useMemo(
    () => (productId === null ? null : products.find((item) => item.id === productId) ?? null),
    [products, productId],
  );

  useEffect(() => {
    if (!open) return;
    setProductId(initialProduct?.id ?? null);
    setAction(initialAction);
    setQuantity(1);
    setQuery("");
    setPrice(initialAction === "customer_return" ? initialProduct?.salePrice ?? 0 : initialProduct?.purchasePrice ?? 0);
    setConfirm(false);
    onDirtyChange(false);
  }, [open, initialProduct, initialAction, onDirtyChange]);

  const priceFor = (next: Product, mode: Action) =>
    mode === "customer_return" ? next.salePrice : next.purchasePrice;

  const selectProduct = (next: Product) => {
    setProductId(next.id);
    setPrice(priceFor(next, action));
    setQuery("");
    onDirtyChange(true);
  };

  const meta = actionMeta[action];
  const Icon = meta.icon;

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return products
      .filter((item) => matches(`${item.name} ${item.brand} ${item.model} ${item.category} ${item.sku} ${item.barcode} ${item.imei}`, query))
      .slice(0, 7);
  }, [products, query]);

  const requestSave = () => {
    if (!product) return notify("Önce ürün seçin", "error");
    if (quantity < 1) return notify("Adet en az 1 olmalı", "error");
    setConfirm(true);
  };

  const save = async () => {
    if (!product) return;
    setBusy(true);
    try {
      const result = await stockMovement({
        productId: product.id,
        movementType: action,
        quantityDelta: quantity,
        unitPrice: price,
        note: "",
      });
      setConfirm(false);
      onDirtyChange(false);
      onClose();
      notify(
        action === "stock_in"
          ? `${product.name} · stok ${result.stock} adet`
          : `İade alındı · stok ${result.stock} adet`,
      );
    } catch (error) {
      setConfirm(false);
      notify(String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        title={meta.title}
        eyebrow="STOK"
        onClose={onClose}
        footer={<>
          <button className="button secondary" onClick={onClose}>Vazgeç</button>
          <button className="button primary" onClick={requestSave} disabled={!product}><Icon size={17} />{meta.label}</button>
        </>}
      >
        <div className="action-switch" role="radiogroup" aria-label="İşlem türü">
          {(Object.keys(actionMeta) as Action[]).map((id) => {
            const ItemIcon = actionMeta[id].icon;
            return (
              <button
                key={id}
                role="radio"
                aria-checked={action === id}
                className={action === id ? "active" : ""}
                onClick={() => {
                  setAction(id);
                  if (product) setPrice(priceFor(product, id));
                  onDirtyChange(true);
                }}
              >
                <ItemIcon size={16} />{actionMeta[id].short}
              </button>
            );
          })}
        </div>

        <p className="modal-hint">{meta.hint}</p>

        {!product ? (
          <div className="product-picker">
            <div className="input-with-icon">
              <Search size={17} aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ürün adı, kategori, barkod veya IMEI"
              />
            </div>
            {query.trim() && (
              <div className="picker-results">
                {results.length ? results.map((item) => (
                  <button key={item.id} onClick={() => selectProduct(item)}>
                    <span className={`product-thumb ${item.productType}`}><Tag size={17} /></span>
                    <span className="grow">
                      <b>{item.name}</b>
                      <small>{item.category} · {item.stock} adet</small>
                    </span>
                    <ArrowRight size={15} aria-hidden />
                  </button>
                )) : <p className="picker-empty">Eşleşen ürün yok</p>}
              </div>
            )}
          </div>
        ) : (
          <div className="selected-product">
            <span className={`product-thumb ${product.productType}`}><Tag size={18} /></span>
            <div className="grow">
              <b>{product.name}</b>
              <small>{product.category} · Stok {product.stock} adet</small>
            </div>
            <button className="text-button" onClick={() => { setProductId(null); setQuery(""); }}>Değiştir</button>
          </div>
        )}

        <div className="sale-controls">
          <div className="stepper-field">
            <label>Adet</label>
            <Stepper value={quantity} onChange={setQuantity} />
          </div>
          <MoneyField
            label={action === "stock_in" ? "Birim alış fiyatı" : "İade edilen tutar"}
            value={price}
            onChange={(value) => { setPrice(value); onDirtyChange(true); }}
          />
        </div>

        {product && (
          <div className="stock-preview up">
            <span>Stok durumu</span>
            <b>{product.stock}</b>
            <ArrowRight size={16} aria-hidden />
            <strong>{product.stock + quantity}</strong>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirm}
        title={action === "stock_in" ? `${quantity} adet stoğa eklensin mi?` : `${quantity} adet iade alınsın mı?`}
        detail={product ? `${product.name} · Stok ${product.stock} → ${product.stock + quantity}` : ""}
        confirmLabel={meta.label}
        icon={Icon}
        onConfirm={save}
        onCancel={() => setConfirm(false)}
        busy={busy}
      />
    </>
  );
}
