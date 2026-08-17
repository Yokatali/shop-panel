import {
  CheckCircle2, DatabaseBackup, Keyboard, Moon, Palette, RotateCcw, Rows3, Rows4,
  ShieldCheck, Store, Sun,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useShop } from "../data/store";
import type { Settings } from "../types";
import { formatDate } from "../utils";
import { Modal } from "./Modal";
import { UpdatePanel } from "./UpdatePanel";
import { PhoneField, TextField, ToggleRow } from "./fields";

type Tab = "appearance" | "shop" | "data" | "about";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "appearance", label: "Görünüm" },
  { id: "shop", label: "Dükkan" },
  { id: "data", label: "Veri" },
  { id: "about", label: "Hakkında" },
];

const SHORTCUTS: Array<[string, string]> = [
  ["F2", "Aramaya odaklan"],
  ["Ctrl + N", "Bulunduğun bölüme yeni kayıt"],
  ["Ctrl + S", "Hızlı satış penceresi"],
  ["Esc", "Açık pencereyi kapat"],
];

export function SettingsModal({ open, onClose, lastBackup, onBackup, onRestore, initialTab = "appearance" }: {
  open: boolean;
  onClose: () => void;
  lastBackup: string;
  onBackup: () => void;
  onRestore: () => void;
  initialTab?: Tab;
}) {
  const { settings, saveSettings, notify } = useShop();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [draft, setDraft] = useState<Settings>(settings);
  const [surum, setSurum] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(settings);
    setTab(initialTab);
  }, [open, settings, initialTab]);

  // Sürüm numarası tek yerde (tauri.conf.json) tutulur, buraya elle yazılmaz.
  useEffect(() => {
    if (!open || surum) return;
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setSurum)
      .catch(() => setSurum(""));
  }, [open, surum]);

  /** Ayarlar anında uygulanır ve kalıcı olarak yazılır. */
  const apply = async (patch: Partial<Settings>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    try {
      await saveSettings(next);
    } catch (error) {
      notify(String(error), "error");
    }
  };

  return (
    <Modal
      open={open}
      title="Ayarlar"
      eyebrow="PANEL"
      onClose={onClose}
      wide
      footer={<><span className="footer-spacer" /><button className="button primary" onClick={onClose}>Bitti</button></>}
    >
      <div className="settings-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "appearance" && (
        <div className="settings-panel">
          <div className="setting-block">
            <span className="setting-label"><Palette size={15} />Tema</span>
            <div className="choice-grid">
              <button className={draft.theme === "light" ? "active" : ""} onClick={() => apply({ theme: "light" })}>
                <Sun size={19} /><b>Açık</b><small>Gündüz için net</small>
              </button>
              <button className={draft.theme === "dark" ? "active" : ""} onClick={() => apply({ theme: "dark" })}>
                <Moon size={19} /><b>Koyu</b><small>Göz yormayan</small>
              </button>
            </div>
          </div>

          <div className="setting-block">
            <span className="setting-label"><Rows3 size={15} />Satır aralığı</span>
            <div className="choice-grid">
              <button className={draft.density === "comfortable" ? "active" : ""} onClick={() => apply({ density: "comfortable" })}>
                <Rows3 size={19} /><b>Rahat</b><small>Ferah aralıklı</small>
              </button>
              <button className={draft.density === "compact" ? "active" : ""} onClick={() => apply({ density: "compact" })}>
                <Rows4 size={19} /><b>Sık</b><small>Ekrana daha çok kayıt</small>
              </button>
            </div>
            <p className="settings-note">Yazı boyutu iki seçenekte de aynı kalır.</p>
          </div>

          <ToggleRow
            label="Tezgahta satış onayı iste"
            description="Kapalıyken Sat tuşuna basınca satış anında tamamlanır"
            checked={draft.confirmQuickSale === "1"}
            onChange={(checked) => apply({ confirmQuickSale: checked ? "1" : "0" })}
          />
        </div>
      )}

      {tab === "shop" && (
        <div className="settings-panel">
          <div className="form-grid">
            <TextField
              label="Dükkan adı"
              span
              value={draft.shopName}
              onChange={(value) => setDraft({ ...draft, shopName: value })}
              placeholder="Yusuf Telekom"
              icon={<Store size={16} aria-hidden />}
            />
            <PhoneField
              label="Dükkan telefonu"
              span
              value={draft.shopPhone}
              onChange={(value) => setDraft({ ...draft, shopPhone: value })}
            />
          </div>
          <button className="button primary wide-button" onClick={() => apply({ shopName: draft.shopName, shopPhone: draft.shopPhone })}>
            Dükkan bilgilerini kaydet
          </button>
          <p className="settings-note">Dükkan adı sol üstteki başlıkta görünür.</p>
        </div>
      )}

      {tab === "data" && (
        <div className="settings-panel">
          <div className="backup-status-card">
            <span><CheckCircle2 size={22} /></span>
            <div>
              <small>Son yedek</small>
              <b>{lastBackup ? formatDate(lastBackup, true) : "Henüz alınmadı"}</b>
            </div>
          </div>

          <div className="backup-actions">
            <button onClick={onBackup}>
              <span className="summary-icon cyan"><DatabaseBackup size={19} /></span>
              <div><b>Yedek Al</b><small>Klasör seçip kopyala</small></div>
            </button>
            <button onClick={onRestore}>
              <span className="summary-icon violet"><RotateCcw size={19} /></span>
              <div><b>Geri Yükle</b><small>Yedek dosyası seç</small></div>
            </button>
          </div>

          <ToggleRow
            label="Günlük otomatik yedek"
            description="Uygulama her gün ilk açılışta sessizce yedek alır"
            checked={draft.autoBackup === "1"}
            onChange={(checked) => apply({ autoBackup: checked ? "1" : "0" })}
          />

          <UpdatePanel notify={notify} />

          <div className="info-card">
            <ShieldCheck size={17} />
            <p>Tüm veriler yalnızca bu bilgisayarda, çevrimdışı bir SQLite dosyasında tutulur. Güncelleme dışında internete hiçbir şey gönderilmez.</p>
          </div>
        </div>
      )}

      {tab === "about" && (
        <div className="settings-panel">
          <div className="about-card">
            <b>Dükkan Paneli</b>
            <small>{surum ? `Sürüm ${surum}` : "Sürüm okunuyor…"} · Çevrimdışı çalışır</small>
          </div>

          <div className="setting-block">
            <span className="setting-label"><Keyboard size={15} />Kısayollar</span>
            <div className="shortcut-list">
              {SHORTCUTS.map(([keys, description]) => (
                <div key={keys}><kbd>{keys}</kbd><span>{description}</span></div>
              ))}
            </div>
          </div>

          <div className="info-card success">
            <ShieldCheck size={17} />
            <p>
              Uygulama tamamen ücretsizdir. Abonelik, lisans ücreti, sunucu veya bulut hizmeti kullanılmaz;
              ileride de ücret çıkarmaz.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
