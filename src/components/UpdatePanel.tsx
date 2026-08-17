import { CheckCircle2, CloudDownload, RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { updater, type UpdateState } from "../data/updater";

/** Ayarlar > Veri sekmesindeki güncelleme bölümü. */
export function UpdatePanel({ notify }: { notify: (mesaj: string, ton?: "success" | "error" | "info") => void }) {
  const [durum, setDurum] = useState<UpdateState>({ durum: "bos" });
  const [mesgul, setMesgul] = useState(false);

  const denetle = async () => {
    setMesgul(true);
    setDurum({ durum: "denetleniyor" });
    const sonuc = await updater.denetle();
    setDurum(sonuc);
    setMesgul(false);
    if (sonuc.durum === "guncel") notify("En son sürümü kullanıyorsunuz", "info");
    if (sonuc.durum === "hata") notify(sonuc.mesaj, "error");
  };

  const kur = async () => {
    setMesgul(true);
    setDurum({ durum: "indiriliyor", yuzde: 0 });
    const sonuc = await updater.indirVeKur((yuzde) => setDurum({ durum: "indiriliyor", yuzde }));
    setDurum(sonuc);
    setMesgul(false);
    if (sonuc.durum === "hata") notify(sonuc.mesaj, "error");
  };

  if (!updater.desteklenirMi()) {
    return (
      <div className="info-card">
        <CloudDownload size={17} />
        <p>Güncelleme denetimi yalnızca kurulu masaüstü uygulamasında çalışır.</p>
      </div>
    );
  }

  return (
    <div className="setting-block">
      <span className="setting-label"><CloudDownload size={15} />Güncelleme</span>

      {durum.durum === "mevcut" ? (
        <div className="update-card yeni">
          <div className="update-head">
            <span className="update-icon"><CloudDownload size={19} /></span>
            <div>
              <b>Yeni sürüm hazır: {durum.surum}</b>
              <small>Kayıtlarınız ve yedekleriniz olduğu gibi kalır.</small>
            </div>
          </div>
          {durum.notlar && <p className="update-notes">{durum.notlar}</p>}
          <button className="button primary wide-button" onClick={kur} disabled={mesgul}>
            <CloudDownload size={16} />İndir ve kur
          </button>
        </div>
      ) : durum.durum === "indiriliyor" ? (
        <div className="update-card">
          <div className="update-head">
            <span className="update-icon"><RefreshCw size={19} className="spin" /></span>
            <div><b>İndiriliyor… %{durum.yuzde}</b><small>Bu sırada uygulamayı kapatmayın.</small></div>
          </div>
          <div className="update-track"><i style={{ width: `${durum.yuzde}%` }} /></div>
        </div>
      ) : durum.durum === "hazir" ? (
        <div className="update-card yeni">
          <div className="update-head">
            <span className="update-icon"><CheckCircle2 size={19} /></span>
            <div><b>Kurulum tamamlandı</b><small>Yeni sürüme geçmek için yeniden başlatın.</small></div>
          </div>
          <button className="button primary wide-button" onClick={() => void updater.yenidenBaslat()}>
            <RotateCcw size={16} />Yeniden başlat
          </button>
        </div>
      ) : durum.durum === "hata" ? (
        <div className="update-card hata">
          <div className="update-head">
            <span className="update-icon"><TriangleAlert size={19} /></span>
            <div><b>Denetlenemedi</b><small>{durum.mesaj}</small></div>
          </div>
          <button className="button secondary wide-button" onClick={denetle} disabled={mesgul}>
            <RefreshCw size={16} />Tekrar dene
          </button>
        </div>
      ) : (
        <button className="button secondary wide-button" onClick={denetle} disabled={mesgul}>
          <RefreshCw size={16} className={mesgul ? "spin" : ""} />
          {durum.durum === "denetleniyor" ? "Denetleniyor…" : durum.durum === "guncel" ? `Güncel (${durum.surum})` : "Güncellemeleri denetle"}
        </button>
      )}

      <p className="settings-note">
        Uygulama kendiliğinden internete bağlanmaz. Yalnızca bu düğmeye bastığınızda denetler.
      </p>
    </div>
  );
}
