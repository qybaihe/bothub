<div align="center">

[English](../../README.md) · [简体中文](README_zh.md) · [繁體中文](README_zh-TW.md) · [日本語](README_ja.md) · [한국어](README_ko.md) · [Español](README_es.md) · [Français](README_fr.md) · [Deutsch](README_de.md) · [Português (Brasil)](README_pt-BR.md) · [Русский](README_ru.md) · [Italiano](README_it.md) · [Tiếng Việt](README_vi.md) · **Türkçe** · [العربية](README_ar.md) · [Bahasa Indonesia](README_id.md) · [हिन्दी](README_hi.md)

<br />

<img src="../assets/logo.png" alt="BotHub" width="88" />

# BotHub

### **Tüm kişisel ajanlarınızı bir araya getirin ve hepsini tek bir istemcide, tıpkı Grok Bot gibi kullanın**

**Meta Muse, Grok Bot, Hark ve Dot botlarınızı tek bir pencerede toplayan macOS ve Windows uygulaması; her bot kendi yalıtılmış hesabıyla oturum açar.**

[![Release](https://img.shields.io/github/v/release/qybaihe/bothub?style=for-the-badge&label=S%C3%BCr%C3%BCm&color=2563eb)](https://github.com/qybaihe/bothub/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/qybaihe/bothub/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/qybaihe/bothub/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Windows-6e56cf?style=for-the-badge)](#-hızlı-başlangıç)
[![Electron](https://img.shields.io/badge/Electron-45-47848f?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![MIT License](https://img.shields.io/badge/Lisans-MIT-38bdf8?style=for-the-badge)](../../LICENSE)

**[⬇️ macOS için indir](https://github.com/qybaihe/bothub/releases/latest) · [⬇️ Windows için indir](https://github.com/qybaihe/bothub/releases/latest) · [📦 Tüm sürümler](https://github.com/qybaihe/bothub/releases) · [🐛 Sorun bildir](https://github.com/qybaihe/bothub/issues)**

[Hızlı başlangıç](#-hızlı-başlangıç) · [Platformlar](#-desteklenen-platformlar) · [Özellikler](#-özellikler) · [Geliştirme](#-geliştirme) · [Sürüm yayınlama](#-sürüm-yayınlama) · [Protokoller](#-protokol-belgeleri) · [SSS](#-sık-sorulan-sorular)

</div>

---

> [!NOTE]
> BotHub bağımsız bir istemcidir; Meta, xAI, Hark veya OpenAI ile bağlantısı yoktur. Kendi hesaplarınızla oturum açarsınız ve kimlik bilgileriniz yalnızca bilgisayarınızda kalır.

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bothub-dark.webp">
  <img src="../assets/bothub-light.webp" alt="BotHub: kenar çubuğunda gruplanmış Muse, Dot, Hark ve Grok Bot botları, bir sohbet ve bot ayrıntı paneli (örnek veriler)" width="100%">
</picture>
<sub>Kurgusal örnek verilerle alınmış ekran görüntüsü.</sub>
</div>

<br />

<table>
<tr>
<td width="33%" valign="top">

### 🧩 Tüm ajanlar tek pencerede
Muse, Grok Bot, Hark ve Dot botları kenar çubuğunda gruplar hâlinde yan yana durur; her birinin kendi sohbeti, ayrıntı paneli ve ayarları vardır.

</td>
<td width="33%" valign="top">

### 🔐 Yalıtılmış hesaplar
Her hesap kendi oturum bölümünde veya şifreli kimlik bilgisi yuvasında çalışır; aynı platformdaki birden fazla hesap asla birbirine karışmaz.

</td>
<td width="33%" valign="top">

### ✅ Güvenilir teslim
Mesajlarda *gönderiliyor*, *teslim edildi · yanıtlanıyor*, *yanıt yok* veya *başarısız* durumu görünür. Platformun kabul ettiği bir mesaj asla gönderilmemiş gibi gösterilmez; bu yüzden yeniden denemek mesajı iki kez göndermez.

</td>
</tr>
</table>

---

## ⚡ Hızlı başlangıç

Sisteminize uygun dosyayı [en son sürümden](https://github.com/qybaihe/bothub/releases/latest) indirin:

| Sistem | Dosya |
| :--- | :--- |
| macOS, Apple Silicon | `BotHub-<sürüm>-arm64.dmg` |
| macOS, Intel | `BotHub-<sürüm>-x64.dmg` |
| Windows 10/11 (x64) | `BotHub-Setup-<sürüm>-x64.exe` |

> [!TIP]
> Derlemeler henüz kod imzalı değil.
> - **macOS**: `BotHub.app` dosyasını Uygulamalar klasörüne sürükleyin, ilk açılışta sağ tıklayıp **Aç**'ı seçin (veya *Sistem Ayarları → Gizlilik ve Güvenlik → Yine de Aç*). Karantina işaretini `xattr -cr /Applications/BotHub.app` ile de kaldırabilirsiniz.
> - **Windows**: SmartScreen "Windows bilgisayarınızı korudu" uyarısı gösterirse **Ek bilgi → Yine de çalıştır**'a tıklayın.

Ardından kenar çubuğundaki **+** düğmesine tıklayın, bir platform seçin ve oturum açın. Her bot kendi hesabını kullanır.

**Güncellemeler**: Windows'ta BotHub yeni sürümleri arka planda indirir ve tek tıklamayla kurar. macOS'ta yeni sürüm çıktığında haber verir ve indirme sayfasını açar.

## 🤖 Desteklenen platformlar

| Platform | Protokol ve aktarım | Sunduklarınız |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | Yalıtılmış Electron bölümü + yerel WebSocket ağ geçidi | Birden fazla hesap, e-posta koduyla toplu içe aktarma, hesap başına HTTP/SOCKS5 proxy, bulut bilgisayar, hedefler, eşler, çalışma alanı dosyaları, bağlayıcı onayları ve tanılama |
| **Grok Bot** (`grok.com`) | Sand ağ geçidi (`*.sand.x.ai`) üzerinden Connect-RPC / Protobuf | Birden fazla hesap, Sand bulut çalışma alanı, canlı akış, araç çağrısı geçmişi, oturumlar, zamanlanmış görevler, anılar ve beceriler |
| **Hark** (`hark.com`) | WebSocket RPC + çok kipli REST | Tarayıcıda oturum açma (Google veya e-posta), arka planda yanıt eşitlemeli canlı akış, dosya ve görsel ekleri, belge kartları, zamanlanmış görevler, anılar ve bağlayıcılar |
| **Dot** (`chatgpt.com/dots`) | OpenAI Orbit/TBO REST + sunucu gönderimli olaylar (SSE) | Tarayıcıda OAuth ile oturum açma veya Access/Refresh Token içe aktarma, şifreli token saklama, canlı akış, dosya yükleme, beceriler, otomasyonlar, bağlayıcılar ve hesap başına proxy |

## ✨ Özellikler

- **Çok hesap, sıfır karışıklık**: her hesap kendi Electron `persist:` bölümünde veya şifreli kimlik bilgisi yuvasında yaşar; böylece aynı platformun birden fazla hesabını aynı anda kullanabilirsiniz.
- **Yönetim konsolu**: genel bakış, bot filtreleme ve arama, toplu bağlantı denetimi ile platform başına hesap, token ve proxy yönetimini sunan tam ekran görünüm.
- **Zengin ajan sohbeti**: düşünme adımları ve araç kartlarıyla canlı akış, uzun arka plan görevlerinin kurtarılması, Markdown tabloları, vurgulanmış kod, belge önizleme ve ek indirme.
- **Bot ayrıntı paneli**: sağdaki panel, platforma göre her botun oturumlarını, zamanlanmış görevlerini, anılarını, becerilerini, dosyalarını ve üyelerini gösterir.
- **Canlı avatarlar**: her botun imleci takip eden ve çalışırken tepki veren animasyonlu bir `GrokBotMark` karakteri vardır; şekil ve renk seçebilir ya da fotoğraf yükleyebilirsiniz.
- **Varsayılan olarak güvenli**: token'lar ve proxy parolaları Electron `safeStorage` (macOS'ta Anahtar Zinciri) ile şifrelenir ve `0600` izinleriyle kaydedilir. Kodda gömülü gizli bilgi yok, telemetri yok.
- **İngilizce ve Çince arayüz**, açık ve koyu tema.

## 🧰 Geliştirme

```bash
npm ci
npm run dev          # Electron + Vite, anında yeniden yükleme
```

| Komut | Açıklama |
| :--- | :--- |
| `npm run dev` | Electron ana sürecini, preload'u ve React arayüzünü anında yeniden yüklemeyle çalıştırır |
| `npm run dev:web` | Yalnızca arayüzü tarayıcıda çalıştırır (Electron ve hesap yok) |
| `npm run typecheck` | Node ve web hedeflerinin tür denetimini yapar |
| `npm test` | Birim testleri (Vitest) |
| `npm run build` | Tür denetimi yapar ve üretim paketlerini `out/` içine derler |
| `npm run dist:mac` / `npm run dist:win` | macOS `dmg` + `zip` (arm64 + x64) / Windows NSIS yükleyicisini `release/` içine paketler |
| `npm run dist:dir` | Hızlı deneme için paketlenmemiş macOS arm64 uygulaması |

README ekran görüntüsü kurgusal verilerden üretilir: `npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark]`.

## 🚀 Sürüm yayınlama

Her push'ta CI ([`ci.yml`](../../.github/workflows/ci.yml)) macOS ve Windows'ta tür denetimi, test, derleme ve paketleme yapar.

1. `package.json` içindeki `version` değerini artırın ve `main` dalına birleştirin.
2. Sürümle eşleşen `vX.Y.Z` etiketini gönderin.
3. [`release.yml`](../../.github/workflows/release.yml) taslak bir sürüm oluşturur, macOS (arm64 + x64 `dmg`/`zip`, `latest-mac.yml`) ve Windows (NSIS `exe`, `latest.yml`) derler, hepsini yükler ve tüm dosyalar hazır olduğunda sürümü yayımlar.

Derlemeler varsayılan olarak imzalanmaz. Şu depo gizli anahtarları ayarlandığında imzalama ve noter onayı devreye girer: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (macOS) veya `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (Windows).

## 📁 Proje yapısı

```text
src/
  adapters/        Platform bağdaştırıcıları (Meta Muse, Grok Bot, Hark, Dot) ve ortak PlatformAdapter arayüzü
  main/            Electron ana süreci
    muse/          Muse bölüm oturumları, toplu oturum açma ve hesap başına proxy yönlendirme
    muse-native/   Muse bulut bilgisayarı ve çalışma alanı çağrıları için yerel WebSocket ağ geçidi istemcisi
    grok/          Grok Bot Sand kimlik doğrulaması, Connect-RPC istemcisi ve IPC işleyicileri
    hark/          Hark WebSocket/REST istemcisi, ek yükleyici ve IPC işleyicileri
    dot/           OpenAI Dot (Orbit/TBO) istemcisi, şifreli token kasası, SSE akışı ve IPC
  preload/         window.electron olarak sunulan türlü contextBridge API'si
  shared/          Ana süreç ile arayüzün paylaştığı IPC kanal sözleşmeleri ve türler
  renderer/        React + Tailwind + Zustand masaüstü arayüzü
    components/    Kenar çubuğu, sohbet, ayrıntı paneli, platform panelleri, yönetim konsolu, GrokBotMark
    store/         Bot durumu, akış birleştirme ve kalıcı depolama
scripts/screenshot/  Kurgusal örnek verilerden README ekran görüntüsü
```

## 📚 Protokol belgeleri

Her platformun protokolleri ve API notları [`docs/`](../README.md) içinde:

- **OpenAI Dot** (`chatgpt.com/dots`): [`docs/dot/protocol.md`](../dot/protocol.md): OAuth PKCE ve web oturumu kimlik doğrulaması, Orbit profilleri, oda SSE ve REST, JSON-RPC 2.0 WebSocket, Pages, Kitaplık ve anı taşıma
- **Meta Muse** (`muse.ai`): [`docs/museai/protocol.md`](../museai/protocol.md): `Noise_XX_25519_ChaChaPoly_SHA256` WebSocket el sıkışması ve 65'ten fazla JSON-RPC yöntemi
- **xAI Grok Bot** (`grok.com`): [`docs/grokbot-protocol/protocol.md`](../grokbot-protocol/protocol.md): HTTP/2 üzerinde tekli ve akışlı Connect-RPC çağrıları, Sand kimlik doğrulaması, beceriler, anılar, otomasyonlar ve bulut sanal alanı
- **Hark** (`hark.com`): [`docs/hark/protocol.md`](../hark/protocol.md): REST ve NDJSON akış uç noktaları, bağlayıcılar, zamanlanmış görevler, sanal makine dosya ağacı ve bilgisayar oturumları

## ❓ Sık sorulan sorular

<details>
<summary><b>BotHub bu platformların resmî uygulaması mı?</b></summary>

Hayır. BotHub bağımsız bir istemcidir ve Meta, xAI, Hark veya OpenAI ile bağlantısı yoktur. Her platformda kendi hesaplarınızı kullanır.

</details>

<details>
<summary><b>Hesaplarım ve token'larım nerede saklanıyor?</b></summary>

Yalnızca bilgisayarınızda. Web oturumları hesap başına ayrı Electron bölümlerinde tutulur; token'lar ve proxy parolaları `safeStorage` (macOS'ta Anahtar Zinciri) ile şifrelenip `0600` izinleriyle kaydedilir. BotHub telemetri göndermez.

</details>

<details>
<summary><b>macOS, BotHub'ın açılamadığını söylüyor. Ne yapmalıyım?</b></summary>

Derlemeler henüz imzalı değil. Uygulamaya sağ tıklayıp **Aç**'ı seçin veya `xattr -cr /Applications/BotHub.app` komutunu çalıştırın. Ayrıntılar için [Hızlı başlangıç](#-hızlı-başlangıç) bölümüne bakın.

</details>

<details>
<summary><b>Bir mesaj uzun süredir "teslim edildi · yanıtlanıyor" durumunda. Yeniden denersem iki kez gider mi?</b></summary>

Hayır. Platform bir mesajı kabul ettiğinde BotHub onu asla gönderilmemiş gibi göstermez. Yanıt gelmezse *yanıt yok* durumu ve ikinci bir kopya gönderileceğini açıkça belirten **Tekrar gönder** düğmesi görünür.

</details>

<details>
<summary><b>Her hesap kendi proxy'sini kullanabilir mi?</b></summary>

Evet, Muse ve Dot hesapları için (HTTP veya SOCKS5). Proxy uygulanamazsa BotHub doğrudan bağlantıya geçmek yerine o hesabın trafiğini engeller.

</details>

## 📄 Lisans

[MIT Lisansı](../../LICENSE) ile yayımlanmıştır.
