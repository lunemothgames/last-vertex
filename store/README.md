# Google Play'e çıkış rehberi

Bu klasörde Play Store için gereken her şey var. Play'deki uygulama gerçek bir Android uygulaması
(Capacitor): oyunun bütün dosyaları uygulamanın içinde, internetsiz çalışır.

| Dosya | Ne işe yarıyor |
|---|---|
| `listing.md` | Mağaza adı, kısa ve uzun açıklama (EN, TR, ES, PT), kategori — kopyala-yapıştır |
| `icons/icon-512.png` | Mağaza ikonu (512×512) |
| `feature-graphic.png` | Mağaza sayfasının üstündeki büyük görsel (1024×500) |
| `screenshots/<dil>/` | Her dil için 7 başlıklı ekran görüntüsü (1080×1920), dosya sırasıyla yükle |
| `video/promo-<dil>.mp4` | 30 sn dikey tanıtım videosu (oyunun kendi sesi ve müziğiyle). Repo'da yok, `npm run promo-video` ile üretilir |
| `../privacy.html` | Gizlilik politikası; adresi: `https://lunemothgames.github.io/last-vertex/privacy.html` |

---

## 1. Geliştirici hesabı
1. https://play.google.com/console → hesap aç, 25 $ öde, kimlik doğrulamasını tamamla (birkaç gün sürebilir).
2. Kişisel hesaplarda yayından önce **kapalı test** zorunlu: en az **12 test kullanıcısı**, **14 gün** boyunca uygulamayı yüklü tutmalı.
   Test kullanıcılarının Gmail adreslerini şimdiden topla.

## 2. Uygulama paketini oluştur
1. `android/app/build.gradle` içinde `versionCode` değerini her yeni yüklemede bir artır (`versionName` istediğin gibi, ör. 0.7.0).
2. `node tools/build-app.js release` → `android/app/build/outputs/bundle/release/app-release.aab` (Play'e yüklenecek dosya).
   Telefonda denemek için: `node tools/build-app.js debug` → `android/app/build/outputs/apk/debug/app-debug.apk`.
3. İmza anahtarı `keys/upload.jks` + `keys/upload.properties`. **Bunları kaybetme**, `keys/` klasörünü yedekle; repo'ya asla gitmez.
4. Play Console ilk yüklemede "Play App Signing" sorar: kabul et (Google asıl anahtarı saklar, bizimki yükleme anahtarı olur).

## 3. Play Console'da uygulamayı oluştur
1. **Create app** → ad: `Last Vertex: Idle Defense`, dil: English, tür: Game, ücretsiz.
2. **Store presence → Main store listing**: `listing.md` İngilizce metinleri, ikon, feature graphic, `screenshots/en/`.
   - **Manage translations → Add your own translations**: tr-TR, es-419, es-ES, pt-BR, pt-PT. Her dile kendi metnini
     ve kendi `screenshots/<dil>/` görsellerini yükle (es-ES için `es`, pt-PT için `pt` klasörü).
   - **Video**: `video/promo-en.mp4`'yi YouTube'a yükle (herkese açık ya da liste dışı, reklamlar kapalı), linki
     "YouTube URL" alanına yapıştır. Diğer dillerin videoları için de aynısı. Aynı videolar Shorts/TikTok için de uygun.
3. **Store settings / iletişim:** destek e-postası `lunemothgames@gmail.com`, web sitesi olarak oyunun adresi
   `https://lunemothgames.github.io/last-vertex/`, kategori Game → Strategy (ayrıntı `listing.md`).
4. **Policy → App content** formları (hazır cevaplar, 2026-10-17 durumuna göre; Play soruları değiştirirse ona uy):
   - **Privacy policy:** `https://lunemothgames.github.io/last-vertex/privacy.html`
   - **Ads:** Evet (ödüllü reklam var)
   - **App access:** Tüm özellikler giriş yapmadan kullanılabiliyor, özel hesap gerekmiyor
   - **Content rating anketi** (e-posta: `lunemothgames@gmail.com`, kategori: Game): Şiddet yalnızca soyut şekillerin yok edilmesi, kan ve gerçekçi şiddet yok. Cinsellik, küfür, uyuşturucu, korku yok. Gerçek paralı kumar yok. Gacha (tattoo çekilişi) oyun içi elmasla, gerçek parayla değil. Kullanıcıların birbirine yazdığı içerik yok. Konum paylaşımı yok. Anket gacha ya da "simüle kumar" sorarsa dürüst cevap ver (elmasla çekiliş var).
   - **Target audience:** 13 yaş ve üstü seçeneklerini işaretle, 12 yaş ve altını işaretleme (çocuk programına girmemek için). Çocuklara çekici mi sorusuna Hayır.
   - **Advertising ID:** Evet kullanıyor (AdMob ve analiz). Amaç: reklam ve analiz.
   - **Data safety.** Genel sorular: veri topluyor musun → Evet. Aktarım şifreli mi → Evet (internet bağlantıları şifreli). Kullanıcı veriyi sildirebilir mi → Evet, silme adresi: `https://lunemothgames.github.io/last-vertex/delete-account.html` (uygulamada da Settings → Cloud Save → MANAGE DATA → DELETE CLOUD DATA). Toplanan veriler:
     1. **Kişisel bilgi → E-posta adresi:** isteğe bağlı (yalnızca bulut kaydı için e-posta ekleyen oyuncu), amaç: hesap yönetimi ve uygulama işlevi, paylaşılmıyor.
     2. **Kimlikler → Kullanıcı kimliği (rastgele oyuncu numarası) ve Cihaz/diğer kimlikler (reklam kimliği, uygulama örnek kimliği):** amaç: uygulama işlevi, analiz, reklam. Reklam kimliği AdMob ile reklam amacıyla paylaşılıyor.
     3. **Uygulama etkinliği → Uygulama içi etkileşimler** (koşu başladı, bitti, reklam izlendi vb.): amaç: analiz, ayarlanabilir (Ayarlar → USAGE STATS kapatılınca toplanmaz, "isteğe bağlı" de).
     4. **Uygulama etkinliği → Diğer (oyun ilerlemesi):** yalnızca bulut kaydı açık olan oyuncuda sunucuya gider, isteğe bağlı, amaç: uygulama işlevi. Tam kategori adı Play'de değişebilir, en yakın "Uygulama etkinliği" seçeneğini seç.
     5. **Uygulama bilgisi ve performans → Çökme kayıtları, Tanılama:** amaç: analiz ve uygulama işlevi.
     6. **Konum → Yaklaşık konum:** IP adresinden Google tarafından çıkarılıyor (reklam ve analiz). Oyun konum izni istemiyor ama Play bunu veri olarak soruyor, işaretle.
     Satış yok. "Paylaşılıyor" kutusu: yalnızca reklam kimliği, yaklaşık konum ve uygulama etkileşimleri için AdMob rehberinin dediğini yap (AdMob'un kendi Data safety rehberi var, orada hangisini işaretleyeceğin yazar).
   - **Hesap silme (Data deletion):** Uygulama hesap oluşturuyor (isteğe bağlı) → Evet, yukarıdaki silme adresini yaz.
   - **Diğer formlar:** Haber uygulaması Hayır, COVID Hayır, devlet uygulaması Hayır, finansal özellik Hayır, sağlık Hayır.
   - **Uygulama içi satın alma henüz yok.** Satın alma eklendiğinde: "içinde satın alma var" işaretle, bu formu ve gizlilik sayfasını güncelle. Çekiliş (gacha) ihtimalleri oyunda zaten gösteriliyor (Play kuralı için gerekli), ek iş yok.
5. **Testing → Closed testing**: test grubu oluştur, e-postaları ekle, `.aab` dosyasını yükle, yayınla. 14 gün sayacı başlar.

## 4. Yayın
Kapalı test 14 günü doldurunca Play Console → **Production** başvurusu. İnceleme genelde birkaç gün sürer.

---
Oyun görünüşü değişince: `npm run build`, sonra `npm run store-art` (ekran görüntüleri + feature graphic) ve
`npm run promo-video` (4 dilde video, ~10 dk). Görsel başlıkları `tools/store-text.js`'te.
Metinleri değiştirince `npm run check-listing` karakter sınırlarını kontrol eder.

Uygulama içi puanlama: yeni bir tier açılan koşudan sonra HOME'a basınca, oyuncu en az 5 koşu yapmış ve tier 3'ü
açmışsa Google'ın puanlama penceresi istenir (en fazla 3 kez, en az 60 gün arayla). Pencerenin gerçekten çıkıp
çıkmadığına Google karar verir (kota var, her istekte çıkmaz). Sadece Play'den yüklenen sürümde çalışır;
Android Studio'dan yüklenen debug APK'da görünmez, test etmek için internal test kanalını kullan.
Kurallar ve ücretler zamanla değişebilir; Play Console ne istiyorsa ona uy.
