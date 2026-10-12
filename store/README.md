# Google Play'e çıkış rehberi

Bu klasörde Play Store için gereken her şey var. Oyunun kendisi zaten
`https://ahmetozeladam.github.io/last-vertex/` adresinde; Play'deki uygulama bu adresi tam ekran açan bir kılıf olacak.

| Dosya | Ne işe yarıyor |
|---|---|
| `listing.md` | Mağaza adı, kısa ve uzun açıklama, kategori — kopyala-yapıştır |
| `icon-512.png` | Mağaza ikonu (512×512) |
| `feature-graphic.png` | Mağaza sayfasının üstündeki büyük görsel (1024×500) |
| `screenshots/` | 7 telefon ekran görüntüsü (1080×1920) |
| `assetlinks/.well-known/assetlinks.json` | Uygulamayı siteye bağlayan doğrulama dosyası (şablon, 4. adımda doldurulacak) |
| `../privacy.html` | Gizlilik politikası; adresi: `https://ahmetozeladam.github.io/last-vertex/privacy.html` |

---

## 1. Geliştirici hesabı
1. https://play.google.com/console → hesap aç, 25 $ öde, kimlik doğrulamasını tamamla (birkaç gün sürebilir).
2. Kişisel hesaplarda yayından önce **kapalı test** zorunlu: en az **12 test kullanıcısı**, **14 gün** boyunca uygulamayı yüklü tutmalı.
   Test kullanıcılarının Gmail adreslerini şimdiden topla.

## 2. Uygulama paketini oluştur (PWABuilder)
1. https://www.pwabuilder.com → adres kutusuna `https://ahmetozeladam.github.io/last-vertex/` yaz → **Start**.
2. **Package for stores → Android → Generate Package**. Ayarlarda:
   - **Package ID:** `io.github.ahmetozeladam.lastvertex` (sonradan değiştirilemez; doğrulama dosyası da bunu kullanıyor)
   - **App name:** `Last Vertex: Idle Defense` · **Short name:** `Last Vertex`
   - **Version:** `1.0.0` · **Version code:** `1` (her yeni yüklemede bir artır)
   - **Display mode:** Standalone · **Orientation:** Portrait
   - **Signing key:** *Create new* (PWABuilder bir imza anahtarı oluşturur)
3. İnen zip içinde: `.aab` dosyası (Play'e yüklenecek), imza anahtarı (`signing.keystore`) ve şifreleri (`signing-key-info.txt`).
   **Bu üçünü kaybetme**, güvenli bir yere yedekle — güncellemeler aynı anahtarla imzalanmak zorunda.

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

## 4. Uygulamayı siteye bağla (tam ekran için ŞART)
Bu adım olmazsa uygulama açılınca üstte adres çubuğu görünür.

1. Play Console → **Setup → App integrity → App signing** → *App signing key certificate* altındaki **SHA-256** değerini kopyala.
2. `assetlinks/.well-known/assetlinks.json` içinde `PASTE:THE:...` yazan yere yapıştır.
3. **Önemli:** Android bu dosyayı sitenin **kök adresinde** arar:
   `https://ahmetozeladam.github.io/.well-known/assetlinks.json` — `last-vertex` klasörünün içinde değil.
   Bunun için GitHub'da **`ahmetozeladam.github.io`** adında yeni bir public repo aç ve içine:
   - `.well-known/assetlinks.json` dosyasını,
   - boş bir `.nojekyll` dosyasını
   koy, Pages'i aç (main / root). Bunu bana söylersen dosyayı hazırlayıp gönderirim.
4. Kontrol: https://developers.google.com/digital-asset-links/tools/generator adresinde site ve paket adını girip **Test statement**.

## 5. Yayın
Kapalı test 14 günü doldurunca Play Console → **Production** başvurusu. İnceleme genelde birkaç gün sürer.

---
Ekran görüntülerini oyun değişince yeniden üretmek için: `node tools/make-store-art.js`.
Kurallar ve ücretler zamanla değişebilir; Play Console ne istiyorsa ona uy.
