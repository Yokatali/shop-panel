import {
  CircleDollarSign, Clock3, MessageSquarePlus, Package, Pencil, Phone, Plus, Trash2, Wrench,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useShop } from "../data/store";
import type { Repair, RepairDetail, RepairStatus } from "../types";
import { formatDate, formatMoney, formatPhone, repairStatus } from "../utils";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";
import { MoneyField, TextField } from "./fields";

/** Durumlar akış sırasına göre; teslim ve iptal sona alınır. */
const AKIS: RepairStatus[] = ["received", "diagnosis", "waiting_approval", "waiting_part", "in_progress", "ready"];
const BITIS: RepairStatus[] = ["delivered", "cancelled"];

/**
 * Tamir takip paneli. Kayıt açıldıktan sonraki günlük iş burada yapılır:
 * durum güncelleme, not düşme, parça ekleme, tutar belirleme.
 * Cihaz/müşteri bilgisi gibi alanlar burada DEĞİŞTİRİLEMEZ — onun için
 * ayrıca "Düzenle" düğmesi vardır. Böylece fiyat kazara bozulmaz.
 */
export function RepairTrackModal({ open, repair, onClose, onEdit }: {
  open: boolean;
  repair: Repair | null;
  onClose: () => void;
  onEdit: (repair: Repair) => void;
}) {
  const {
    repairDetail, updateRepairStatus, addRepairNote, addRepairPart,
    deleteRepairPart, updateRepairCharge, deleteRepair, notify,
  } = useShop();

  const [detay, setDetay] = useState<RepairDetail | null>(null);
  const [mesgul, setMesgul] = useState(false);

  const [durumNotu, setDurumNotu] = useState("");
  const [not, setNot] = useState("");
  const [parcaAdi, setParcaAdi] = useState("");
  const [parcaTutari, setParcaTutari] = useState(0);
  const [alinacak, setAlinacak] = useState(0);
  const [kapora, setKapora] = useState(0);
  const [silinecekParca, setSilinecekParca] = useState<number | null>(null);
  const [silmeOnayi, setSilmeOnayi] = useState(false);

  const yukle = useCallback(async (id: number) => {
    try {
      const sonuc = await repairDetail(id);
      setDetay(sonuc);
      setAlinacak(sonuc.repair.chargedAmount);
      setKapora(sonuc.repair.depositAmount);
    } catch (error) {
      notify(String(error), "error");
    }
  }, [repairDetail, notify]);

  useEffect(() => {
    if (!open || !repair) { setDetay(null); return; }
    setDurumNotu(""); setNot(""); setParcaAdi(""); setParcaTutari(0);
    void yukle(repair.id);
  }, [open, repair, yukle]);

  if (!repair) return null;

  const calis = async (islem: () => Promise<unknown>, basariMesaji: string) => {
    setMesgul(true);
    try {
      await islem();
      await yukle(repair.id);
      notify(basariMesaji);
    } catch (error) {
      notify(String(error), "error");
    } finally {
      setMesgul(false);
    }
  };

  const durumDegistir = (yeni: RepairStatus) => {
    if (yeni === detay?.repair.status && !durumNotu.trim()) return;
    void calis(
      () => updateRepairStatus({ repairId: repair.id, status: yeni, note: durumNotu }),
      `Durum: ${repairStatus[yeni].label}`,
    ).then(() => setDurumNotu(""));
  };

  const notEkle = () => {
    if (!not.trim()) return notify("Not boş olamaz", "error");
    void calis(() => addRepairNote(repair.id, not), "Not eklendi").then(() => setNot(""));
  };

  const parcaEkle = () => {
    if (!parcaAdi.trim()) return notify("Parça adı gerekli", "error");
    void calis(
      () => addRepairPart({ repairId: repair.id, name: parcaAdi, cost: parcaTutari, note: "" }),
      "Parça eklendi",
    ).then(() => { setParcaAdi(""); setParcaTutari(0); });
  };

  const tutarKaydet = () => {
    void calis(
      () => updateRepairCharge({ repairId: repair.id, chargedAmount: alinacak, depositAmount: kapora, note: "" }),
      "Tutar güncellendi",
    );
  };

  const guncel = detay?.repair ?? repair;
  const durum = repairStatus[guncel.status];
  const parcaMaliyeti = detay?.partsCost ?? 0;
  const kalan = alinacak - kapora;
  const kar = alinacak - parcaMaliyeti;
  const tutarDegisti = alinacak !== guncel.chargedAmount || kapora !== guncel.depositAmount;

  return (
    <>
      <Modal
        open={open}
        title={`${guncel.brand} ${guncel.model}`}
        eyebrow={guncel.ticketNo}
        onClose={onClose}
        wide
        footer={<>
          <button className="button ghost-danger" onClick={() => setSilmeOnayi(true)} disabled={mesgul}>
            <Trash2 size={16} />Sil
          </button>
          <span className="footer-spacer" />
          <button className="button secondary" onClick={() => onEdit(guncel)} disabled={mesgul}>
            <Pencil size={16} />Bilgileri Düzenle
          </button>
          <button className="button primary" onClick={onClose}>Kapat</button>
        </>}
      >
        {/* Üst özet */}
        <div className="track-head">
          <span className={`repair-device ${durum.tone}`}><Wrench size={20} /></span>
          <div className="grow">
            <b>{guncel.problem}</b>
            <small>
              {guncel.customerName || "Müşteri belirtilmedi"}
              {guncel.customerPhone && <> · <Phone size={11} /> {formatPhone(guncel.customerPhone)}</>}
            </small>
          </div>
          <em className={`status ${durum.tone}`}>{durum.label}</em>
        </div>

        {/* 1. Durum */}
        <section className="track-section">
          <h3><Clock3 size={15} />Durumu güncelle</h3>
          <div className="status-picker">
            {AKIS.map((s) => (
              <button
                key={s}
                className={`status-option ${repairStatus[s].tone} ${guncel.status === s ? "active" : ""}`}
                onClick={() => durumDegistir(s)}
                disabled={mesgul}
              >
                {repairStatus[s].label}
              </button>
            ))}
          </div>
          <div className="status-picker son">
            {BITIS.map((s) => (
              <button
                key={s}
                className={`status-option ${repairStatus[s].tone} ${guncel.status === s ? "active" : ""}`}
                onClick={() => durumDegistir(s)}
                disabled={mesgul}
              >
                {repairStatus[s].label}
              </button>
            ))}
          </div>
          <TextField
            label="Bu değişikliğe not (isteğe bağlı)"
            value={durumNotu}
            onChange={setDurumNotu}
            placeholder="Örn. Ekran siparişi verildi, 2 gün sürecek"
          />
        </section>

        {/* 2. Parçalar */}
        <section className="track-section">
          <h3><Package size={15} />Kullanılan parçalar</h3>
          {detay?.parts.length ? (
            <div className="part-list">
              {detay.parts.map((parca) => (
                <div className="part-row" key={parca.id}>
                  <span className="part-dot"><Package size={13} /></span>
                  <div className="grow">
                    <b>{parca.name}</b>
                    <small>{formatDate(parca.createdAt, true)}</small>
                  </div>
                  <strong>{formatMoney(parca.cost)}</strong>
                  <button
                    className="icon-button small danger"
                    onClick={() => setSilinecekParca(parca.id)}
                    disabled={mesgul}
                    aria-label="Parçayı kaldır"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div className="part-total">
                <span>Parça maliyeti</span>
                <b>{formatMoney(parcaMaliyeti)}</b>
              </div>
            </div>
          ) : <p className="track-empty">Henüz parça eklenmedi.</p>}

          <div className="part-form">
            <TextField label="Parça adı" value={parcaAdi} onChange={setParcaAdi} placeholder="Orijinal ekran" />
            <MoneyField label="Maliyeti" value={parcaTutari} onChange={setParcaTutari} />
            <button className="button secondary" onClick={parcaEkle} disabled={mesgul}>
              <Plus size={16} />Ekle
            </button>
          </div>
        </section>

        {/* 3. Tutar */}
        <section className="track-section">
          <h3><CircleDollarSign size={15} />Tutar</h3>
          <div className="charge-grid">
            <div className="charge-info">
              <small>Tahmini (kayıt anında)</small>
              <b>{formatMoney(guncel.estimatedCost)}</b>
            </div>
            <MoneyField label="Alınacak tutar" value={alinacak} onChange={setAlinacak} />
            <MoneyField label="Kapora" value={kapora} onChange={setKapora} />
          </div>
          <div className="charge-summary">
            <span>Kalan tahsilat <b>{formatMoney(kalan)}</b></span>
            <span>Parça düşünce kâr <b className={kar < 0 ? "negative" : "positive"}>{formatMoney(kar)}</b></span>
          </div>
          {tutarDegisti && (
            <button className="button primary wide-button" onClick={tutarKaydet} disabled={mesgul}>
              Tutarı Kaydet
            </button>
          )}
        </section>

        {/* 4. Not + geçmiş */}
        <section className="track-section">
          <h3><MessageSquarePlus size={15} />Not ekle</h3>
          <div className="note-form">
            <TextField label="Not" value={not} onChange={setNot} placeholder="Müşteri arandı, onay verdi" />
            <button className="button secondary" onClick={notEkle} disabled={mesgul}>Kaydet</button>
          </div>

          <h3 style={{ marginTop: 18 }}><Clock3 size={15} />Geçmiş</h3>
          <div className="timeline">
            <AnimatePresence initial={false}>
              {(detay?.events ?? []).map((olay) => (
                <motion.div
                  className="timeline-row"
                  key={olay.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <i className={`timeline-dot ${olay.kind}`} />
                  <div className="grow">
                    <b>{olay.note}</b>
                    <small>
                      {formatDate(olay.createdAt, true)}
                      {olay.status && repairStatus[olay.status as RepairStatus]
                        ? ` · ${repairStatus[olay.status as RepairStatus].label}`
                        : ""}
                    </small>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {!detay?.events.length && <p className="track-empty">Geçmiş boş.</p>}
          </div>
        </section>
      </Modal>

      <ConfirmDialog
        open={silinecekParca !== null}
        title="Parça kaldırılsın mı?"
        detail="Maliyeti kâr hesabından da çıkarılır."
        tone="danger"
        confirmLabel="Kaldır"
        onConfirm={() => {
          const id = silinecekParca!;
          setSilinecekParca(null);
          void calis(() => deleteRepairPart(id), "Parça kaldırıldı");
        }}
        onCancel={() => setSilinecekParca(null)}
      />

      <ConfirmDialog
        open={silmeOnayi}
        title="Tamir kaydı silinsin mi?"
        detail={`${guncel.ticketNo} · ${guncel.brand} ${guncel.model}`}
        tone="danger"
        confirmLabel="Sil"
        busy={mesgul}
        onConfirm={async () => {
          setMesgul(true);
          try {
            await deleteRepair(repair.id);
            setSilmeOnayi(false);
            onClose();
            notify("Tamir kaydı silindi");
          } catch (error) {
            notify(String(error), "error");
          } finally {
            setMesgul(false);
          }
        }}
        onCancel={() => setSilmeOnayi(false)}
      />
    </>
  );
}
