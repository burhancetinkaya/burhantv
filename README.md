# BurhanTv

Samsung Tizen TV ve bilgisayar için Türkçe IPTV oynatıcı. **[simoncena/retlix (Retflix)](https://github.com/simoncena/retlix) projesinin bir forkudur.** Orijinal projenin MIT lisansı ve telif bildirimi korunmuştur; katkılar için [NOTICE](NOTICE) dosyasına bakın.

BurhanTv içerik, yayın aboneliği, sağlayıcı hesabı veya hazır sunucu içermez. Kendi erişim yetkiniz olan kaynakları kullanın. Netflix ile bağlantılı değildir.

## Eklenen özellikler

- Türkçe arayüz ve BurhanTv markası; Tizen 5 uyumluluğu.
- Kumanda ile yatay kaydırma, önceki listeye geri dönüş ve kaldığın yerden devam.
- Telefondan doğrudan MP4/M3U8 gönderme; kayıtlı bağlantı kartları, silme ve devam etme.
- Ortak oynatıcı, sarma ve desteklenen gömülü altyazılar.
- Gerçek IMDb puanları, kalıcı puan önbelleği, puan filtreleri ve tahmini bitiş saati.
- Her TV uygulaması başlangıcında IPTV arşiv yenileme; başarılı film/dizi yenilemesinden sonra asistan kataloğunu gönderme.
- OAuth/PKCE ile ChatGPT: arşiv arama, detay doğrulama, TV seçme ve oynatma komutları.

## Yerel kurulum

Node.js 22.13+ kullanın. Video dönüştürme için FFmpeg gerekebilir.

```sh
npm ci
cp .env.example .env.local
# .env.local alanlarını kendi bilgilerinizle doldurun.
npm run dev
```

Vite geliştirme arayüzü 5173, yerel sunucu 3000 portunu kullanır. Üretim için `npm run build` ve `npm start` çalıştırın. Sağlayıcı ve TMDB bilgilerini arayüzden de girebilirsiniz.

`.env.example` gerçek değer içermez. `.env.local`, veritabanı, üretilen paketler, cihaz eşleştirmeleri ve imza dosyaları Git dışında tutulur.

## Yapılandırma

| Değişken | Amaç |
| --- | --- |
| `VITE_COMPANION_URL` | Telefon/TV, asistan ve IMDb servisi için kendi genel HTTPS servis adresiniz. Boşsa asistan devre dışıdır. |
| `VITE_BACKEND_URL` | İsteğe bağlı masaüstü sunucu adresi; boşsa aynı origin kullanılır. |
| `IPTV_URL`, `IPTV_USERNAME`, `IPTV_PASSWORD` | İsteğe bağlı ilk kurulum sağlayıcısı. Web sunucusu bunları yalnız yeni veritabanında kullanır. TV derlemesi özel widget içine ekleyebilir. |
| `TMDB_API_KEY` | Sunucu metaverisi ve isteğe bağlı özel TV başlangıç ayarı. |
| `COMPANION_PUBLIC_URL` | OAuth/MCP için kendi servisinizin kanonik HTTPS origin adresi. |
| `BURHANTV_ASSISTANT_KEY` | İsteğe bağlı yönetici otomasyonu anahtarı; yalnız companion ortamına koyun. İstemciye veya eklentiye eklemeyin. |
| `CHATGPT_APP_ID` | Kendi ChatGPT hesabınızda kayıtlı MCP uygulamasının isteğe bağlı kimliği. |

`VITE_` değişkenleri istemciye görünür. Sunucu sırlarını bu önekle adlandırmayın. IPTV/TMDB bilgisi ile derlenen TV widget'ı da özel dosyadır; herkese açık release'e yüklemeyin.

## Samsung Tizen

```sh
npm run build:tv
```

`build-tizen.sh` genel kabuğu derler; `scripts/configure-tizen.mjs` yerel ortamı `tizen-build/index.html` içine güvenli JSON olarak yerleştirir. Eski özel HTML dosyasına ihtiyaç yoktur. `tizen-build/` ve `.wgt` dosyaları Git'e girmez. Tizen SDK ile kendi sertifikanızla imzalayıp kendi geliştirici modundaki TV'nize yükleyin. Güncellemelerde cihaz ayarlarını korumak için mevcut teknik uygulama kimliğini değiştirmeyin.

## Companion servisi

`companion/` dizini telefon gönderim sayfasını, IMDb puan servisini, özel katalog deposunu ve OAuth/MCP uç noktalarını içerir. Kendi Netlify hesabınızda yayınlayabilirsiniz:

```sh
cd companion
npm ci
# Hosting ortamında companion/.env.example değişkenlerini yapılandırın.
# COMPANION_PUBLIC_URL kendi HTTPS origin adresiniz olmalı.
netlify deploy --prod --dir public --functions netlify/functions
```

Statik telefon sayfası kendi origin'ini kullanır. IPTV kimlik bilgileri companion'a aktarılmaz; TV sadece güvenli katalog alanlarını gönderir. Video doğrudan kaynağından TV'ye gider. Netlify Blobs uygulamanın özel verisini saklar. Hosting kotası ve kullanım bedelleri kendi hesabınıza bağlıdır.

## ChatGPT eklentisi

Kaynaklar `chatgpt-plugin/burhantv-assistant/` altındadır. Depoda kişisel MCP adresi, kayıtlı uygulama kimliği veya erişim belirteci bulunmaz.

1. Kendi companion servisinizi yayınlayın ve yerel `.env.local` içinde `COMPANION_PUBLIC_URL` alanını doldurun.
2. ChatGPT'de kendi `/mcp` uç noktanızı OAuth ile kaydedin; TV kodunu açılan yetkilendirme sayfasına girin.
3. ChatGPT'deki kayıtlı gerçek App kimliğini `CHATGPT_APP_ID` alanına ekleyin. ChatGPT için bu kayıt gereklidir; yalnız `mcp.json` araçları etkinleştirmez.
4. `npm run plugin:build` çalıştırın.
5. Git dışında üretilen `build/chatgpt-plugin/burhantv-assistant/` dizinini paketleyip kendi özel eklentinizi kurun.

Üretilen MCP/App dosyaları dağıtımınıza özeldir ve repoya gönderilmez. Film sayfası çözümleyici yalnız açık medya kaynaklarını arar; erişim engellerini aşmaz.

## Atıf ve lisans

Temel oynatıcı, sunucu ve arayüz: [Retflix / simoncena/retlix](https://github.com/simoncena/retlix). BurhanTv uyarlamaları bu fork üzerinde geliştirilmiştir. MIT lisansı: [LICENSE](LICENSE). Üçüncü taraf bağımlılıklar kendi lisanslarına tabidir.
