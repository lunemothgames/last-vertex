# Google Play'e çıkış rehberi

Bu klasörde Play Store için gereken her şey var. Play'deki uygulama gerçek bir Android uygulaması
(Capacitor): oyunun bütün dosyaları uygulamanın içinde, internetsiz çalışır.

| Dosya | Ne işe yarıyor |
|---|---|
| `listing.md` | Mağaza adı, kısa ve uzun açıklama (EN, TR, ES, PT), kategori — kopyala-yapıştır |
| `icon-512.png` | Mağaza ikonu (512×512) |
| `feature-graphic.png` | Mağaza sayfasının üstündeki büyük görsel (1024×500) |
| `screenshots/<dil>/` | Her dil için 7 başlıklı ekran görüntüsü (1080×1920), dosya sırasıyla yükle |
| `video/promo-<dil>.mp4` | 30 sn dikey tanıtım videosu (sessiz). Repo'da yok, `npm run promo-video` ile üretilir |
| `../privacy.html` | Gizlilik politikası; adresi: `https://ahmetozeladam.github.io/last-vertex/privacy.html` |

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
3. **Policy → App content** formları:
   - Privacy policy: yukarıdaki privacy.html adresi
   - Ads: **No** (şu an gerçek reklam yok)
   - App access: tüm özellikler girişsiz kullanılabiliyor
   - Content rating anketi: şiddet = soyut şekiller yok oluyor, kan yok; kumar yok (gacha gerçek parayla değil)
   - Target audience: 13+ önerilir (gacha mekaniği yüzünden çocuklara yönelik işaretleme)
   - Data safety: uygulama veri **toplamıyor** ve **paylaşmıyor** (kayıt sadece cihazda; geri bildirim formu tarayıcıda, isteğe bağlı açılıyor)
4. **Testing → Closed testing**: test grubu oluştur, e-postaları ekle, `.aab` dosyasını yükle, yayınla. 14 gün sayacı başlar.

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
