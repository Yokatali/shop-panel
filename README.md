# Dükkan Paneli

Telefon mağazası için çevrimdışı stok, satış, tamir, gider ve rapor uygulaması.
Telefonun yanı sıra kılıf, kulaklık, şarj aleti, kablo, powerbank gibi tüm
aksesuarlar kategorilerle yönetilir.

## Çalıştırma

Son kullanıcı yalnızca Windows kurulum dosyasını çalıştırır:

`src-tauri/target/release/bundle/nsis/Dükkan Paneli_0.1.0_x64-setup.exe`

Node.js, Rust, terminal, sunucu veya internet bağlantısı gerekmez. Kurulum paketi
WebView2'yi çevrimdışı olarak içerir. Uygulama açılırken arka planda konsol
(CMD) penceresi açılmaz.

## Bölümler

Her bölümün tek bir işi vardır. Satış yalnızca Tezgah'ta yapılır, depo yalnızca
Stok'ta düzenlenir.

| Bölüm | Tek işi | Burada **yapılmaz** |
|---|---|---|
| **Genel Bakış** | Günün özeti: ciro, kâr, tamir sırası, stok uyarısı | Kayıt değiştirme |
| **Tezgah** | Satış. Ürünün **Sat** tuşuna basmak yeterli | Stok girişi, ürün düzenleme, kategori |
| **Stok** | Depo: ürün ekleme/düzenleme, stok girişi, müşteri iadesi, kategoriler, arşiv | Satış |
| **Tamir** | Servis kayıtları; teslim edilince tutar otomatik ciroya girer | Ürün satışı |
| **Kasa** | Gider girişi, gider dağılımı, satış hareketleri ve geri alma | Yeni satış |
| **Raporlar** | Kâr/zarar analizi, tarih aralığı seçimi | Kayıt değiştirme |

Yanlış satış yapılırsa Tezgah veya Kasa sayfasındaki **Geri Al** ile iptal edilir;
stok iade edilir ve tutar kasadan düşülür.

## Kısayollar

| Tuş | İşlev |
|---|---|
| `F2` | Aramaya odaklan |
| `Ctrl + N` | Bulunduğun bölüme yeni kayıt |
| `Ctrl + S` | Tezgah sayfasına git |
| `Esc` | Açık pencereyi kapat |

## Geliştirme

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd test
cargo test --manifest-path src-tauri/Cargo.toml
npm.cmd run tauri:build
```

## Güncelleme

Uygulama kendiliğinden internete bağlanmaz. Güncelleme denetimi yalnızca siz
isteyince çalışır: **Ayarlar → Veri → Güncellemeleri denetle**.

Yeni sürüm varsa indirilip kurulur, ardından uygulama yeniden başlatılır.
**Ürünler, satışlar, tamir kayıtları ve giderler korunur** — veriler kurulum
klasöründe değil, ayrı bir veri klasöründe (`%APPDATA%\com.telefondukkan.panel`)
tutulur. Şema değişiklikleri sürümlü migration ile veri kaybı olmadan uygulanır.

Güncelleme paketleri minisign ile imzalanır; imzası doğrulanmayan bir dosya
kurulmaz.

### Yeni sürüm yayınlama (geliştirici)

1. `package.json` ve `src-tauri/tauri.conf.json` içindeki `version` değerini artırın.
2. Değişiklikleri commit'leyip gönderin.
3. Etiket atın: `git tag v0.2.0 && git push origin v0.2.0`
4. GitHub Actions kurulum dosyasını derler, imzalar ve Release olarak yayınlar.

## Veri güvenliği

- SQLite veritabanı uygulama kurulumundan bağımsız Windows veri klasöründe tutulur.
- Stok ve finans işlemleri tek transaction içinde tamamlanır.
- Uygulama günlük yerel yedek alır (Ayarlar > Veri bölümünden kapatılabilir).
- Ayarlar > Veri bölümünden harici klasöre yedek alınabilir.
- Geri yüklemeden önce mevcut veritabanı otomatik olarak ayrıca yedeklenir.
- Silinen ürün ve tamir kayıtları fiziksel olarak silinmez, arşivlenir.
- Yanlış yapılan satış "Geri Al" ile iptal edilir: stok iade edilir, ciro düşülür,
  kayıt geçmişte `geri alındı` olarak görünür.

## Ücretsiz kullanım

Uygulamada abonelik, lisans ücreti, sunucu, bulut hizmeti veya ücretli API yoktur.
Tüm bağımlılıklar izin verici açık kaynak lisanslıdır; ayrıntı için
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

Bu yazılım dükkân içi operasyon takibidir; resmi e-Fatura veya mali müşavir
yazılımı değildir.
