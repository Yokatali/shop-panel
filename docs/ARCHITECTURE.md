# Mimari

## Katmanlar

1. **React/TypeScript arayüzü** — ekranlar, formlar, onaylar ve interaktif tur.
2. **Paylaşılan veri deposu (`src/data/store.tsx`)** — tüm sayfaların okuduğu tek kaynak.
3. **Tauri komut katmanı** — arayüz ile yerel servisler arasındaki sınırlı API.
4. **Rust iş kuralları** — doğrulama, transaction, rapor ve yedekleme işlemleri.
5. **SQLite** — ürünler, stok hareketleri, satışlar, tamirler, giderler ve denetim geçmişi.

## Sayfa sorumlulukları

Her sayfanın tek bir işi vardır; aynı işi iki yerden yapmak mümkün değildir.

| Sayfa | Sorumluluk | Yazma yetkisi |
|---|---|---|
| Genel Bakış | Özet gösterimi | Yok (salt okunur) |
| Tezgah | Satış | `quick_movement` (yalnızca negatif adet) ve `void_sale` |
| Stok | Depo yönetimi | `upsert_product`, `add_stock_movement` (`stock_in`/`customer_return`), kategoriler, arşiv |
| Tamir | Servis kayıtları | `upsert_repair`, `delete_repair` |
| Kasa | Gider ve satış geçmişi | `add_expense`, `delete_expense`, `void_sale` |
| Raporlar | Analiz | Yok (salt okunur) |

`StockActionModal` bilerek satış yapmaz; yalnızca `stock_in` ve `customer_return`
hareketlerini destekler. Üst bardaki "Hızlı Satış" düğmesi ve `Ctrl + S` kısayolu
bir pencere açmaz, Tezgah sayfasına yönlendirir.

## Tek kaynak ilkesi

Sayfalar kendi başlarına veri çekmez. `ShopProvider` ürünleri, kategorileri,
tamirleri, giderleri, satışları ve gösterge verisini tutar; her yazma işleminden
sonra hepsini birlikte tazeler. Bu yüzden tezgahta yapılan bir satış aynı anda
stok sayısını, kasayı, gösterge panelini ve raporları günceller. Kenar çubuğundaki
rozetler de bu veriden hesaplanır, sabit sayı yoktur.

## Temel kurallar

- Stok miktarı doğrudan değiştirilmez; stok hareketlerinin toplamından hesaplanır.
- Satış ile stok düşümü aynı transaction içindedir. Bir adım başarısızsa hiçbir adım yazılmaz.
- Para değerleri kayan noktalı sayı yerine kuruş cinsinden tam sayı olarak saklanır.
- Satış geri alma (`void_sale`) kaydı silmez: ters stok hareketi yazar ve satışı
  `voided` durumuna alır. Ciro sorguları yalnızca `completed` satışları sayar.
- Tamir `delivered` olduğunda `delivered_at` damgalanır; tahsil edilen tutar o tarihle
  ciroya ve rapora girer.
- Ürün ve tamir silme işlemi `archived_at` alanı ile geri alınabilir şekilde yapılır.
- Yedekler SQLite Online Backup API ile tutarlı anlık görüntü olarak oluşturulur ve
  `integrity_check` ile doğrulanır.
- Şema değişiklikleri `PRAGMA user_version` ile sürümlenir; mevcut veritabanları
  veri kaybı olmadan yükseltilir.

## Veri tabloları

- `products` — ürünler (adetli ürün veya IMEI'li tekil telefon)
- `categories` — tezgah sayfasının kategori listesi (simge, renk, sıra)
- `stock_movements` — `initial`, `sale`, `stock_in`, `customer_return`, `adjustment`, `sale_void`
- `sales` / `sale_items` — satış başlığı ve satırları
- `repairs` — servis kayıtları
- `expenses` — giderler
- `app_settings` — tema, yazı boyu, dükkan bilgisi gibi ayarlar
- `audit_log` — işlem geçmişi

## Arayüz ölçeği

Yazı boyutları `--text-*` değişkenleriyle `rem` cinsindendir ve kök yazı boyutuna
bağlıdır. Ayarlar > Görünüm > **Sık** seçeneği kök boyutu küçültür, **Rahat**
büyütür. En küçük metin 12 pikselden aşağı düşmez.

## Ücretsiz çalışma politikası

Üretim uygulaması bulut, hosting, ücretli API, CDN, telemetri veya lisans sunucusuna
bağlanmaz. Bütün çalışma zamanı dosyaları kurulum paketine dahildir. İçerik güvenlik
politikası (`tauri.conf.json`) dış bağlantıları zaten engeller.
