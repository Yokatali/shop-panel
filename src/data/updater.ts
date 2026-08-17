import { api } from "./api";

export type UpdateState =
  | { durum: "bos" }
  | { durum: "denetleniyor" }
  | { durum: "guncel"; surum: string }
  | { durum: "mevcut"; surum: string; notlar: string; tarih: string }
  | { durum: "indiriliyor"; yuzde: number }
  | { durum: "hazir" }
  | { durum: "hata"; mesaj: string };

/**
 * Güncelleme denetimi yalnızca kullanıcı düğmeye bastığında çalışır.
 * Uygulama açılışta internete hiç bakmaz; çevrimdışı çalışması bozulmaz.
 */
export const updater = {
  desteklenirMi: () => api.isDesktop(),

  /** Sunucuda yeni sürüm var mı diye bakar. */
  denetle: async (): Promise<UpdateState> => {
    if (!api.isDesktop()) {
      return { durum: "hata", mesaj: "Güncelleme yalnızca masaüstü uygulamasında çalışır." };
    }
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const guncelleme = await check();
      if (!guncelleme) {
        const { getVersion } = await import("@tauri-apps/api/app");
        return { durum: "guncel", surum: await getVersion() };
      }
      return {
        durum: "mevcut",
        surum: guncelleme.version,
        notlar: guncelleme.body?.trim() || "",
        tarih: guncelleme.date || "",
      };
    } catch (error) {
      return { durum: "hata", mesaj: cevir(error) };
    }
  },

  /**
   * Güncellemeyi indirir ve kurar. Veritabanı ayrı klasörde durduğu için
   * kayıtlar bu işlemden etkilenmez.
   */
  indirVeKur: async (ilerleme: (yuzde: number) => void): Promise<UpdateState> => {
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const guncelleme = await check();
      if (!guncelleme) return { durum: "guncel", surum: "" };

      let toplam = 0;
      let inen = 0;
      await guncelleme.downloadAndInstall((olay) => {
        if (olay.event === "Started") {
          toplam = olay.data.contentLength ?? 0;
          ilerleme(0);
        } else if (olay.event === "Progress") {
          inen += olay.data.chunkLength;
          ilerleme(toplam > 0 ? Math.min(99, Math.round((inen / toplam) * 100)) : 0);
        } else if (olay.event === "Finished") {
          ilerleme(100);
        }
      });
      return { durum: "hazir" };
    } catch (error) {
      return { durum: "hata", mesaj: cevir(error) };
    }
  },

  /** Kurulum bittikten sonra uygulamayı yeniden başlatır. */
  yenidenBaslat: async () => {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  },
};

/** Teknik hata metinlerini kullanıcının anlayacağı dile çevirir. */
function cevir(error: unknown): string {
  const metin = String(error);
  if (/network|connect|dns|timeout|unreachable|tcp/i.test(metin)) {
    return "İnternet bağlantısı kurulamadı. Uygulama çevrimdışı çalışmaya devam ediyor.";
  }
  if (/signature|verify|pubkey/i.test(metin)) {
    return "Güncelleme dosyasının imzası doğrulanamadı. Güvenlik için kurulum yapılmadı.";
  }
  if (/404|not found/i.test(metin)) {
    return "Sunucuda yayınlanmış güncelleme bulunamadı.";
  }
  return metin.replace(/^Error:\s*/, "");
}
