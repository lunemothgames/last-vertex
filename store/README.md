# Google Play'e çıkış rehberi

Bu klasörde Play Store için gereken her şey var. Play'deki uygulama gerçek bir Android uygulaması
(Capacitor): oyunun bütün dosyaları uygulamanın içinde, internetsiz çalışır.

| Dosya | Ne işe yarıyor |
|---|---|
| `listing.md` | Mağaza adı, kısa ve uzun açıklama, kategori — kopyala-yapıştır |
| `icon-512.png` | Mağaza ikonu (512×512) |
| `feature-graphic.png` | Mağaza sayfasının üstündeki büyük görsel (1024×500) |
| `screenshots/` | 7 telefon ekran görüntüsü (1080×1920) |
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
2. **Store presence → Main store listing**: `listing.md` metinleri, ikon, feature graphic, ekran görüntüleri.
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
Ekran görüntülerini oyun değişince yeniden üretmek için: `node tools/make-store-art.js`.
Kurallar ve ücretler zamanla değişebilir; Play Console ne istiyorsa ona uy.
