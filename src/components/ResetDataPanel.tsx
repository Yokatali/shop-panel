import { Eraser, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useShop } from "../data/store";
import { Modal } from "./Modal";

const ONAY_KELIMESI = "SIFIRLA";

/**
 * Tüm verileri silme bölümü. Yanlışlıkla basılmasın diye kullanıcıdan
 * bir kelime yazması istenir; ayrıca silmeden önce otomatik yedek alınır.
 */
export function ResetDataPanel() {
  const { resetAllData, notify, products, repairs, expenses, sales } = useShop();
  const [acik, setAcik] = useState(false);
  const [yazilan, setYazilan] = useState("");
  const [mesgul, setMesgul] = useState(false);

  const kayitSayisi = products.length + repairs.length + expenses.length + sales.length;
  const onayli = yazilan.trim().toLocaleUpperCase("tr-TR") === ONAY_KELIMESI;

  const kapat = () => { setAcik(false); setYazilan(""); };

  const sifirla = async () => {
    if (!onayli) return;
    setMesgul(true);
    try {
      const yedekYolu = await resetAllData();
      kapat();
      notify("Tüm veriler silindi. Uygulama ilk kurulum hâline döndü.", "success");
      if (yedekYolu && !yedekYolu.startsWith("Önizleme")) {
        window.setTimeout(() => notify("Silmeden önce yedek alındı: " + yedekYolu, "info"), 3800);
      }
    } catch (error) {
      notify(String(error), "error");
    } finally {
      setMesgul(false);
    }
  };

  return (
    <>
      <div className="setting-block">
        <span className="setting-label"><Eraser size={15} />Sıfırlama</span>
        <button className="button ghost-danger wide-button" onClick={() => setAcik(true)}>
          <Eraser size={16} />Tüm verileri sil ve sıfırdan başla
        </button>
        <p className="settings-note">
          Ürünler, satışlar, tamir kayıtları ve giderler silinir. Silmeden önce
          otomatik yedek alınır.
        </p>
      </div>

      <Modal
        open={acik}
        title="Tüm veriler silinsin mi?"
        eyebrow="DİKKAT"
        onClose={mesgul ? () => undefined : kapat}
        compact
        footer={<>
          <button className="button secondary" onClick={kapat} disabled={mesgul}>Vazgeç</button>
          <button className="button danger" onClick={sifirla} disabled={!onayli || mesgul}>
            {mesgul ? <span className="spinner" aria-hidden /> : <Eraser size={17} />}
            Verileri Sil
          </button>
        </>}
      >
        <div className="confirm-visual danger"><ShieldAlert size={26} /></div>

        <p className="confirm-detail">
          {kayitSayisi > 0
            ? `${products.length} ürün, ${sales.length} satış hareketi, ${repairs.length} tamir kaydı ve ${expenses.length} gider silinecek.`
            : "Silinecek kayıt görünmüyor, uygulama zaten boş."}
        </p>

        <div className="info-card" style={{ marginTop: 14 }}>
          <ShieldAlert size={17} />
          <p>
            Bu işlem geri alınamaz. Ancak silmeden önce otomatik bir yedek alınır;
            gerekirse <b>Geri Yükle</b> ile o yedeğe dönebilirsiniz.
            Tema ve dükkan bilgisi gibi ayarlarınız korunur.
          </p>
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="sifirla-onay">
            Onaylamak için <b>{ONAY_KELIMESI}</b> yazın
          </label>
          <input
            id="sifirla-onay"
            autoFocus
            autoComplete="off"
            value={yazilan}
            onChange={(event) => setYazilan(event.target.value)}
            placeholder={ONAY_KELIMESI}
          />
        </div>
      </Modal>
    </>
  );
}
