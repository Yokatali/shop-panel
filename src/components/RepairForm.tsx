import { Save, Smartphone, Trash2, UserRound, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { useShop } from "../data/store";
import type { Repair, RepairInput, RepairStatus } from "../types";
import { formatMoney, isValidPhone, repairStatus, todayIso } from "../utils";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";
import { DateField, MoneyField, SelectField, TextAreaField, TextField } from "./fields";
import { PhoneField } from "./fields";

const blank = (): RepairInput => ({
  id: undefined, customerName: "", customerPhone: "", brand: "", model: "", imei: "", problem: "",
  status: "received", receivedAt: todayIso(), plannedDeliveryAt: "", estimatedCost: 0, chargedAmount: 0,
  depositAmount: 0, notes: "",
});

export function RepairForm({ open, repair, onClose, onDirtyChange }: {
  open: boolean;
  repair: Repair | null;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { saveRepair, deleteRepair, notify } = useShop();
  const [form, setForm] = useState<RepairInput>(blank());
  const [dirty, setDirty] = useState(false);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(repair ? { ...repair, id: repair.id, receivedAt: repair.receivedAt.slice(0, 10), plannedDeliveryAt: repair.plannedDeliveryAt.slice(0, 10) } : blank());
    setDirty(false);
    onDirtyChange(false);
  }, [open, repair, onDirtyChange]);

  const update = <K extends keyof RepairInput>(key: K, value: RepairInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    onDirtyChange(true);
  };

  const requestClose = () => (dirty ? setDiscardConfirm(true) : onClose());

  const requestSave = () => {
    if (!form.brand.trim() || !form.model.trim() || !form.problem.trim()) {
      return notify("Marka, model ve sorun alanları zorunludur", "error");
    }
    if (form.customerPhone && !isValidPhone(form.customerPhone)) {
      return notify("Telefon numarası 10 haneli geçerli bir numara olmalı", "error");
    }
    if (form.plannedDeliveryAt && form.plannedDeliveryAt < form.receivedAt) {
      return notify("Planlanan teslim, alınma tarihinden önce olamaz", "error");
    }
    setSaveConfirm(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveRepair(form);
      setDirty(false);
      onDirtyChange(false);
      setSaveConfirm(false);
      onClose();
      notify(
        form.status === "delivered"
          ? `Teslim edildi · ${formatMoney(form.chargedAmount)} kasaya işlendi`
          : repair ? "Tamir güncellendi" : "Tamir kaydedildi",
      );
    } catch (error) {
      setSaveConfirm(false);
      notify(String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!repair) return;
    setBusy(true);
    try {
      await deleteRepair(repair.id);
      setDeleteConfirm(false);
      setDirty(false);
      onDirtyChange(false);
      onClose();
      notify("Tamir kaydı silindi");
    } catch (error) {
      notify(String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const balance = form.chargedAmount - form.depositAmount;

  return (
    <>
      <Modal
        open={open}
        title={repair ? `${repair.ticketNo}` : "Yeni Tamir"}
        eyebrow="SERVİS"
        onClose={requestClose}
        wide
        footer={<>
          {repair && (
            <button className="button ghost-danger" onClick={() => setDeleteConfirm(true)}>
              <Trash2 size={16} />Sil
            </button>
          )}
          <span className="footer-spacer" />
          <button className="button secondary" onClick={requestClose}>Vazgeç</button>
          <button className="button primary" onClick={requestSave}><Save size={17} />Kaydet</button>
        </>}
      >
        {/* Başlık ayrı satırda: ikon ızgaranın içinde durunca ilk satır
            diğer sütunlarla hizasını kaybediyordu. */}
        <div className="form-section-head">
          <span aria-hidden><Smartphone size={18} /></span>
          <div><b>Cihaz ve müşteri</b><small>Marka, model ve sorun zorunlu</small></div>
        </div>

        <div className="form-grid">
          <TextField label="Marka *" autoFocus value={form.brand} onChange={(value) => update("brand", value)} placeholder="Samsung" />
          <TextField label="Model *" value={form.model} onChange={(value) => update("model", value)} placeholder="Galaxy A54" />

          <TextField
            label="Müşteri"
            value={form.customerName}
            onChange={(value) => update("customerName", value)}
            icon={<UserRound size={16} aria-hidden />}
            placeholder="Ad soyad"
          />
          <PhoneField value={form.customerPhone} onChange={(value) => update("customerPhone", value)} />

          <TextAreaField
            label="Sorun *"
            span
            rows={2}
            value={form.problem}
            onChange={(value) => update("problem", value)}
            icon={<Wrench size={16} aria-hidden />}
            placeholder="Ekran kırık, dokunmatik çalışmıyor…"
          />

          <TextField label="IMEI" value={form.imei} onChange={(value) => update("imei", value)} inputMode="numeric" maxLength={15} />
          <SelectField
            label="Durum"
            value={form.status}
            onChange={(value) => update("status", value as RepairStatus)}
            options={Object.entries(repairStatus).map(([value, meta]) => ({ value, label: meta.label }))}
            hint={form.status === "delivered" ? "Teslim edilince tutar ciroya eklenir" : undefined}
          />

          <DateField label="Alınma" value={form.receivedAt} onChange={(value) => update("receivedAt", value || todayIso())} clearable={false} />
          <DateField
            label="Planlanan teslim"
            value={form.plannedDeliveryAt}
            onChange={(value) => update("plannedDeliveryAt", value)}
            min={form.receivedAt}
            placeholder="Plansız"
          />

          <MoneyField label="Tahmini tutar" value={form.estimatedCost} onChange={(value) => update("estimatedCost", value)} />
          <MoneyField label="Alınacak tutar" value={form.chargedAmount} onChange={(value) => update("chargedAmount", value)} />
          <MoneyField
            label="Kapora"
            value={form.depositAmount}
            onChange={(value) => update("depositAmount", value)}
            hint={form.chargedAmount > 0 ? `Kalan ${formatMoney(balance)}` : undefined}
          />

          <TextAreaField label="Not" span rows={2} value={form.notes} onChange={(value) => update("notes", value)} />
        </div>
      </Modal>

      <ConfirmDialog
        open={saveConfirm}
        title={repair ? "Tamir güncellensin mi?" : "Tamir kaydedilsin mi?"}
        detail={`${form.brand} ${form.model} · ${repairStatus[form.status].label}`}
        confirmLabel={repair ? "Güncelle" : "Kaydet"}
        icon={Wrench}
        onConfirm={save}
        onCancel={() => setSaveConfirm(false)}
        busy={busy}
      />
      <ConfirmDialog
        open={deleteConfirm}
        title="Tamir kaydı silinsin mi?"
        detail={repair ? `${repair.ticketNo} · ${repair.brand} ${repair.model}` : ""}
        tone="danger"
        confirmLabel="Sil"
        onConfirm={remove}
        onCancel={() => setDeleteConfirm(false)}
        busy={busy}
      />
      <ConfirmDialog
        open={discardConfirm}
        title="Değişiklikler kaybolacak"
        detail="Kaydetmeden çıkmak istiyor musunuz?"
        tone="warning"
        confirmLabel="Kaydetmeden Çık"
        onConfirm={() => { setDiscardConfirm(false); setDirty(false); onDirtyChange(false); onClose(); }}
        onCancel={() => setDiscardConfirm(false)}
      />
    </>
  );
}
