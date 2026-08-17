import { Barcode, Boxes, Package, Save, Smartphone, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useShop } from "../data/store";
import type { Product, ProductInput } from "../types";
import { formatMoney } from "../utils";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";
import { MoneyField, NumberField, SelectField, TextAreaField, TextField } from "./fields";

const blankForm = (): ProductInput => ({
  productType: "bulk", name: "", brand: "", model: "", category: "", sku: "", barcode: "", imei: "",
  description: "", initialStock: 0, minimumStock: 0, purchasePrice: 0, salePrice: 0,
});

export function ProductForm({ open, product, onClose, onDirtyChange }: {
  open: boolean;
  product: Product | null;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { categories, saveProduct, notify } = useShop();
  const [form, setForm] = useState<ProductInput>(blankForm());
  const [dirty, setDirty] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(product ? {
      id: product.id, productType: product.productType, name: product.name, brand: product.brand,
      model: product.model, category: product.category, sku: product.sku, barcode: product.barcode,
      imei: product.imei, description: product.description, initialStock: 0,
      minimumStock: product.minimumStock, purchasePrice: product.purchasePrice, salePrice: product.salePrice,
    } : blankForm());
    setDirty(false);
    onDirtyChange(false);
  }, [open, product, onDirtyChange]);

  const update = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    onDirtyChange(true);
  };

  const categoryOptions = useMemo(() => {
    const names = categories.map((category) => category.name);
    // Ürünün mevcut kategorisi listeden silinmişse yine de görünsün.
    if (form.category && !names.includes(form.category)) names.unshift(form.category);
    return names.map((name) => ({ value: name, label: name }));
  }, [categories, form.category]);

  const margin = form.salePrice - form.purchasePrice;
  const marginRate = form.purchasePrice > 0 ? Math.round((margin / form.purchasePrice) * 100) : 0;

  const requestClose = () => (dirty ? setConfirmDiscard(true) : onClose());

  const requestSave = () => {
    if (!form.name.trim()) return notify("Ürün adı gerekli", "error");
    if (form.productType === "device" && form.initialStock > 1) return notify("Tekil telefonda stok en fazla 1 olabilir", "error");
    if (form.salePrice > 0 && form.salePrice < form.purchasePrice) {
      notify("Satış fiyatı alış fiyatının altında, zararına satıyorsunuz", "info");
    }
    setConfirmSave(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveProduct({
        ...form,
        category: form.category || (form.productType === "device" ? "Telefon" : "Aksesuar"),
      });
      setDirty(false);
      onDirtyChange(false);
      setConfirmSave(false);
      onClose();
      notify(product ? "Ürün güncellendi" : "Ürün eklendi");
    } catch (error) {
      setConfirmSave(false);
      notify(String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        title={product ? "Ürünü Düzenle" : "Yeni Ürün"}
        eyebrow="STOK"
        onClose={requestClose}
        wide
        footer={<>
          <button className="button secondary" onClick={requestClose}>Vazgeç</button>
          <button className="button primary" onClick={requestSave}><Save size={17} />Kaydet</button>
        </>}
      >
        <div className="type-switch" role="radiogroup" aria-label="Ürün türü">
          <button
            role="radio"
            aria-checked={form.productType === "bulk"}
            className={form.productType === "bulk" ? "active" : ""}
            onClick={() => update("productType", "bulk")}
          >
            <Package size={19} />
            <span><b>Adetli Ürün</b><small>Kılıf, kulaklık, şarj, kablo…</small></span>
          </button>
          <button
            role="radio"
            aria-checked={form.productType === "device"}
            className={form.productType === "device" ? "active" : ""}
            onClick={() => {
              update("productType", "device");
              if (!product) setForm((current) => ({ ...current, productType: "device", initialStock: 1 }));
            }}
          >
            <Smartphone size={19} />
            <span><b>Tekil Telefon</b><small>IMEI ile tek cihaz</small></span>
          </button>
        </div>

        <div className="form-grid">
          <TextField
            label="Ürün adı *"
            span
            autoFocus
            value={form.name}
            onChange={(value) => update("name", value)}
            placeholder={form.productType === "device" ? "iPhone 13 128 GB" : "20W Hızlı Şarj Adaptörü"}
          />
          <TextField label="Marka" value={form.brand} onChange={(value) => update("brand", value)} placeholder="Apple" />
          <TextField label="Model" value={form.model} onChange={(value) => update("model", value)} placeholder="iPhone 13" />

          <SelectField
            label="Kategori"
            value={form.category || (form.productType === "device" ? "Telefon" : "Aksesuar")}
            onChange={(value) => update("category", value)}
            options={categoryOptions}
            hint="Kategoriler Stok sayfasından yönetilir"
          />
          <TextField
            label={form.productType === "device" ? "IMEI" : "Stok kodu"}
            value={form.productType === "device" ? form.imei : form.sku}
            onChange={(value) => update(form.productType === "device" ? "imei" : "sku", value)}
            icon={<Barcode size={16} aria-hidden />}
            inputMode={form.productType === "device" ? "numeric" : "text"}
            maxLength={form.productType === "device" ? 15 : 40}
            placeholder={form.productType === "device" ? "15 haneli IMEI" : "SRJ-020"}
          />

          {!product && (
            <NumberField
              label="İlk stok"
              value={form.initialStock}
              onChange={(value) => update("initialStock", value)}
              max={form.productType === "device" ? 1 : undefined}
              icon={<Boxes size={16} aria-hidden />}
            />
          )}
          <NumberField
            label="Kritik stok"
            value={form.minimumStock}
            onChange={(value) => update("minimumStock", value)}
            hint="Bu sayıya düşünce uyarı verilir"
          />

          <MoneyField label="Alış fiyatı" value={form.purchasePrice} onChange={(value) => update("purchasePrice", value)} />
          <MoneyField
            label="Satış fiyatı"
            value={form.salePrice}
            onChange={(value) => update("salePrice", value)}
            hint={form.purchasePrice > 0 && form.salePrice > 0 ? `Kâr ${formatMoney(margin)} · %${marginRate}` : undefined}
          />

          <TextAreaField label="Not" span value={form.description} onChange={(value) => update("description", value)} rows={3} />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmSave}
        title={product ? "Değişiklik kaydedilsin mi?" : "Ürün eklensin mi?"}
        detail={`${form.name || "Yeni ürün"} · ${form.productType === "device" ? "Tekil telefon" : `${form.initialStock} adet`} · ${formatMoney(form.salePrice)}`}
        confirmLabel={product ? "Güncelle" : "Ekle"}
        icon={Tag}
        onConfirm={save}
        onCancel={() => setConfirmSave(false)}
        busy={busy}
      />
      <ConfirmDialog
        open={confirmDiscard}
        title="Değişiklikler kaybolacak"
        detail="Kaydetmeden çıkmak istiyor musunuz?"
        tone="warning"
        confirmLabel="Kaydetmeden Çık"
        onConfirm={() => { setConfirmDiscard(false); setDirty(false); onDirtyChange(false); onClose(); }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}
