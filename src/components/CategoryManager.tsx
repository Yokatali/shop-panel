import { Check, FolderPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useShop } from "../data/store";
import type { Category } from "../types";
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryGlyph } from "./CategoryIcon";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";
import { TextField } from "./fields";

type Draft = { id?: number; name: string; icon: string; color: string; sortOrder: number };

const blank = (sortOrder: number): Draft => ({ name: "", icon: "package", color: "cyan", sortOrder });

export function CategoryManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { categories, products, saveCategory, deleteCategory, notify } = useShop();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setDraft(null); setRemoving(null); } }, [open]);

  const countOf = (name: string) => products.filter((product) => product.category === name).length;

  const commit = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return notify("Kategori adı gerekli", "error");
    setBusy(true);
    try {
      await saveCategory({ ...draft, name: draft.name.trim() });
      notify(draft.id ? "Kategori güncellendi" : "Kategori eklendi");
      setDraft(null);
    } catch (error) {
      notify(String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await deleteCategory(removing.id);
      notify("Kategori kaldırıldı");
      setRemoving(null);
    } catch (error) {
      notify(String(error), "error");
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        title="Kategoriler"
        eyebrow="STOK"
        onClose={onClose}
        wide
        footer={<>
          <span className="footer-spacer" />
          <button className="button secondary" onClick={onClose}>Kapat</button>
          {!draft && (
            <button className="button primary" onClick={() => setDraft(blank(categories.length))}>
              <FolderPlus size={17} />Yeni Kategori
            </button>
          )}
        </>}
      >
        {draft && (
          <div className="category-editor">
            <TextField
              label={draft.id ? "Kategori adı" : "Yeni kategori adı"}
              autoFocus
              value={draft.name}
              onChange={(value) => setDraft({ ...draft, name: value })}
              placeholder="Örn. Akıllı Saat"
              hint={draft.id ? "Adı değiştirince ürünler de yeni ada taşınır" : undefined}
            />

            <div className="picker-block">
              <span className="picker-label">Simge</span>
              <div className="icon-picker">
                {Object.keys(CATEGORY_ICONS).map((icon) => (
                  <button
                    key={icon}
                    className={draft.icon === icon ? "active" : ""}
                    onClick={() => setDraft({ ...draft, icon })}
                    aria-label={icon}
                  >
                    <CategoryGlyph icon={icon} size={17} />
                  </button>
                ))}
              </div>
            </div>

            <div className="picker-block">
              <span className="picker-label">Renk</span>
              <div className="color-picker">
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    className={`swatch tone-${color} ${draft.color === color ? "active" : ""}`}
                    onClick={() => setDraft({ ...draft, color })}
                    aria-label={color}
                  >
                    {draft.color === color && <Check size={13} strokeWidth={3.2} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="editor-actions">
              <button className="button secondary" onClick={() => setDraft(null)} disabled={busy}><X size={16} />Vazgeç</button>
              <button className="button primary" onClick={commit} disabled={busy}>
                {busy ? <span className="spinner" aria-hidden /> : <Check size={16} />}
                {draft.id ? "Güncelle" : "Ekle"}
              </button>
            </div>
          </div>
        )}

        <div className="category-manager-list">
          {categories.map((category) => (
            <div className="category-manager-row" key={category.id}>
              <span className={`category-badge tone-${category.color}`}><CategoryGlyph icon={category.icon} /></span>
              <div className="grow">
                <b>{category.name}</b>
                <small>{countOf(category.name)} ürün</small>
              </div>
              <button
                className="icon-button small"
                onClick={() => setDraft({ id: category.id, name: category.name, icon: category.icon, color: category.color, sortOrder: category.sortOrder })}
                aria-label={`${category.name} düzenle`}
              >
                <Pencil size={15} />
              </button>
              <button
                className="icon-button small danger"
                onClick={() => setRemoving(category)}
                disabled={countOf(category.name) > 0}
                title={countOf(category.name) > 0 ? "Önce ürünleri başka kategoriye taşıyın" : "Kaldır"}
                aria-label={`${category.name} kaldır`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {!categories.length && (
            <button className="category-empty" onClick={() => setDraft(blank(0))}>
              <Plus size={16} />İlk kategoriyi ekleyin
            </button>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Kategori kaldırılsın mı?"
        detail={removing ? `${removing.name} listeden çıkarılacak. Ürünleriniz silinmez.` : ""}
        tone="danger"
        confirmLabel="Kaldır"
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
        busy={busy}
      />
    </>
  );
}
