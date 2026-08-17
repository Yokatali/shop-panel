import { Banknote, CreditCard, Landmark, ReceiptText, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useShop } from "../data/store";
import type { Expense, ExpenseInput } from "../types";
import { formatMoney, todayIso } from "../utils";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";
import { DateField, MoneyField, SelectField, TextField } from "./fields";

const CATEGORIES = ["Sarf", "Kira", "Elektrik", "Su", "İnternet", "Kargo", "Ürün Alımı", "Personel", "Vergi", "Diğer"];

const blank = (): ExpenseInput => ({
  category: "Sarf", description: "", amount: 0, expenseDate: todayIso(), paymentMethod: "cash",
});

export function ExpenseForm({ open, expense, onClose, onDirtyChange }: {
  open: boolean;
  expense: Expense | null;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { saveExpense, deleteExpense, notify } = useShop();
  const [form, setForm] = useState<ExpenseInput>(blank());
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(expense ? {
      id: expense.id, category: expense.category, description: expense.description,
      amount: expense.amount, expenseDate: expense.expenseDate.slice(0, 10), paymentMethod: expense.paymentMethod,
    } : blank());
    setDirty(false);
    onDirtyChange(false);
  }, [open, expense, onDirtyChange]);

  const update = <K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    onDirtyChange(true);
  };

  const requestClose = () => (dirty ? setDiscard(true) : onClose());

  const requestSave = () => {
    if (!form.description.trim()) return notify("Gider açıklaması gerekli", "error");
    if (form.amount <= 0) return notify("Tutar sıfırdan büyük olmalı", "error");
    setConfirm(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveExpense(form);
      setConfirm(false);
      setDirty(false);
      onDirtyChange(false);
      onClose();
      notify(expense ? "Gider güncellendi" : "Gider eklendi");
    } catch (error) {
      setConfirm(false);
      notify(String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!expense) return;
    setBusy(true);
    try {
      await deleteExpense(expense.id);
      setDeleteConfirm(false);
      setDirty(false);
      onDirtyChange(false);
      onClose();
      notify("Gider silindi");
    } catch (error) {
      notify(String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const methods = [
    { id: "cash", label: "Nakit", icon: Banknote },
    { id: "card", label: "Kart", icon: CreditCard },
    { id: "transfer", label: "Havale", icon: Landmark },
  ];

  return (
    <>
      <Modal
        open={open}
        title={expense ? "Gideri Düzenle" : "Yeni Gider"}
        eyebrow="KASA"
        onClose={requestClose}
        footer={<>
          {expense && (
            <button className="button ghost-danger" onClick={() => setDeleteConfirm(true)}>
              <Trash2 size={16} />Sil
            </button>
          )}
          <span className="footer-spacer" />
          <button className="button secondary" onClick={requestClose}>Vazgeç</button>
          <button className="button primary" onClick={requestSave}><Save size={17} />Kaydet</button>
        </>}
      >
        <div className="expense-amount">
          <MoneyField label="Tutar" large autoFocus value={form.amount} onChange={(value) => update("amount", value)} />
        </div>

        <div className="form-grid">
          <TextField
            label="Açıklama *"
            span
            value={form.description}
            onChange={(value) => update("description", value)}
            placeholder="Dükkan kirası"
          />
          <SelectField
            label="Kategori"
            value={form.category}
            onChange={(value) => update("category", value)}
            options={CATEGORIES.map((name) => ({ value: name, label: name }))}
          />
          <DateField
            label="Tarih"
            value={form.expenseDate}
            onChange={(value) => update("expenseDate", value || todayIso())}
            clearable={false}
            max={todayIso()}
          />
        </div>

        <div className="payment-switch" role="radiogroup" aria-label="Ödeme yöntemi">
          {methods.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="radio"
              aria-checked={form.paymentMethod === id}
              className={form.paymentMethod === id ? "active" : ""}
              onClick={() => update("paymentMethod", id)}
            >
              <Icon size={17} />{label}
            </button>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm}
        title={expense ? "Gider güncellensin mi?" : "Gider eklensin mi?"}
        detail={`${form.description || "Gider"} · ${formatMoney(form.amount)}`}
        confirmLabel={expense ? "Güncelle" : "Gider Ekle"}
        icon={ReceiptText}
        onConfirm={save}
        onCancel={() => setConfirm(false)}
        busy={busy}
      />
      <ConfirmDialog
        open={deleteConfirm}
        title="Gider silinsin mi?"
        detail={expense ? `${expense.description} · ${formatMoney(expense.amount)}` : ""}
        tone="danger"
        confirmLabel="Sil"
        onConfirm={remove}
        onCancel={() => setDeleteConfirm(false)}
        busy={busy}
      />
      <ConfirmDialog
        open={discard}
        title="Değişiklikler kaybolacak"
        detail="Kaydetmeden çıkmak istiyor musunuz?"
        tone="warning"
        confirmLabel="Kaydetmeden Çık"
        onConfirm={() => { setDiscard(false); setDirty(false); onDirtyChange(false); onClose(); }}
        onCancel={() => setDiscard(false)}
      />
    </>
  );
}
