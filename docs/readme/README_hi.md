<div align="center">

[English](../../README.md) · [简体中文](README_zh.md) · [繁體中文](README_zh-TW.md) · [日本語](README_ja.md) · [한국어](README_ko.md) · [Español](README_es.md) · [Français](README_fr.md) · [Deutsch](README_de.md) · [Português (Brasil)](README_pt-BR.md) · [Русский](README_ru.md) · [Italiano](README_it.md) · [Tiếng Việt](README_vi.md) · [Türkçe](README_tr.md) · [العربية](README_ar.md) · [Bahasa Indonesia](README_id.md) · **हिन्दी**

<br />

<img src="../assets/logo.png" alt="BotHub" width="88" />

# BotHub

### **अपने सभी पर्सनल एजेंट एक जगह लाएँ और उन्हें एक ही क्लाइंट में Grok Bot की तरह इस्तेमाल करें**

**macOS और Windows के लिए एक ऐप, जो आपके Meta Muse, Grok Bot, Hark और Dot बॉट्स को एक ही विंडो में लाता है; हर बॉट अपने अलग, सुरक्षित खाते से साइन इन करता है।**

[![Release](https://img.shields.io/github/v/release/qybaihe/bothub?style=for-the-badge&label=%E0%A4%B0%E0%A4%BF%E0%A4%B2%E0%A5%80%E0%A4%9C%E0%A4%BC&color=2563eb)](https://github.com/qybaihe/bothub/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/qybaihe/bothub/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/qybaihe/bothub/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/%E0%A4%AA%E0%A5%8D%E0%A4%B2%E0%A5%87%E0%A4%9F%E0%A4%AB%E0%A4%BC%E0%A5%89%E0%A4%B0%E0%A5%8D%E0%A4%AE-macOS_%7C_Windows-6e56cf?style=for-the-badge)](#-जल्दी-शुरू-करें)
[![Electron](https://img.shields.io/badge/Electron-45-47848f?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![MIT License](https://img.shields.io/badge/%E0%A4%B2%E0%A4%BE%E0%A4%87%E0%A4%B8%E0%A5%87%E0%A4%82%E0%A4%B8-MIT-38bdf8?style=for-the-badge)](../../LICENSE)

**[⬇️ macOS के लिए डाउनलोड करें](https://github.com/qybaihe/bothub/releases/latest) · [⬇️ Windows के लिए डाउनलोड करें](https://github.com/qybaihe/bothub/releases/latest) · [📦 सभी रिलीज़](https://github.com/qybaihe/bothub/releases) · [🐛 समस्या बताएँ](https://github.com/qybaihe/bothub/issues)**

[जल्दी शुरू करें](#-जल्दी-शुरू-करें) · [प्लेटफ़ॉर्म](#-समर्थित-प्लेटफ़ॉर्म) · [सुविधाएँ](#-सुविधाएँ) · [डेवलपमेंट](#-डेवलपमेंट) · [रिलीज़ प्रक्रिया](#-रिलीज़-प्रक्रिया) · [प्रोटोकॉल](#-प्रोटोकॉल-दस्तावेज़) · [अक्सर पूछे जाने वाले सवाल](#-अक्सर-पूछे-जाने-वाले-सवाल)

</div>

---

> [!NOTE]
> BotHub एक स्वतंत्र क्लाइंट है और इसका Meta, xAI, Hark या OpenAI से कोई संबंध नहीं है। आप अपने खातों से साइन इन करते हैं और आपकी क्रेडेंशियल सिर्फ़ आपके कंप्यूटर पर रहती हैं।

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bothub-dark.webp">
  <img src="../assets/bothub-light.webp" alt="BotHub: साइडबार में समूहों में रखे Muse, Dot, Hark और Grok Bot बॉट, एक बातचीत और बॉट विवरण पैनल (नमूना डेटा)" width="100%">
</picture>
<sub>काल्पनिक नमूना डेटा वाला स्क्रीनशॉट।</sub>
</div>

<br />

<table>
<tr>
<td width="33%" valign="top">

### 🧩 सभी एजेंट, एक विंडो
Muse, Grok Bot, Hark और Dot के बॉट साइडबार में समूहों में साथ-साथ; हर बॉट की अपनी बातचीत, विवरण पैनल और सेटिंग्स।

</td>
<td width="33%" valign="top">

### 🔐 अलग-अलग खाते
हर खाता अपने सेशन पार्टिशन या एन्क्रिप्टेड क्रेडेंशियल स्लॉट में चलता है, इसलिए एक ही प्लेटफ़ॉर्म के कई खाते कभी आपस में नहीं मिलते।

</td>
<td width="33%" valign="top">

### ✅ भरोसेमंद डिलीवरी
संदेशों पर *भेजा जा रहा है*, *पहुँच गया · जवाब आ रहा है*, *कोई जवाब नहीं* या *विफल* दिखता है। जिस संदेश को प्लेटफ़ॉर्म स्वीकार कर चुका है, उसे कभी न भेजा गया नहीं माना जाता, इसलिए दोबारा कोशिश करने पर वह दो बार नहीं जाता।

</td>
</tr>
</table>

---

## ⚡ जल्दी शुरू करें

[नवीनतम रिलीज़](https://github.com/qybaihe/bothub/releases/latest) से अपने सिस्टम की फ़ाइल डाउनलोड करें:

| सिस्टम | फ़ाइल |
| :--- | :--- |
| macOS, Apple silicon | `BotHub-<संस्करण>-arm64.dmg` |
| macOS, Intel | `BotHub-<संस्करण>-x64.dmg` |
| Windows 10/11 (x64) | `BotHub-Setup-<संस्करण>-x64.exe` |

> [!TIP]
> बिल्ड अभी कोड-साइन नहीं किए गए हैं।
> - **macOS**: `BotHub.app` को Applications फ़ोल्डर में खींचें, फिर पहली बार राइट-क्लिक करके **Open** चुनें (या *System Settings → Privacy & Security → Open Anyway*)। आप `xattr -cr /Applications/BotHub.app` से क्वारंटीन फ़्लैग भी हटा सकते हैं।
> - **Windows**: अगर SmartScreen "Windows protected your PC" दिखाए, तो **More info → Run anyway** पर क्लिक करें।

इसके बाद साइडबार में **+** पर क्लिक करें, प्लेटफ़ॉर्म चुनें और साइन इन करें। हर बॉट अपना खाता रखता है।

**अपडेट**: Windows पर BotHub नए संस्करण बैकग्राउंड में डाउनलोड करता है और एक क्लिक में इंस्टॉल करता है। macOS पर नया संस्करण आने पर यह बताता है और डाउनलोड पेज खोलता है।

## 🤖 समर्थित प्लेटफ़ॉर्म

| प्लेटफ़ॉर्म | प्रोटोकॉल और ट्रांसपोर्ट | आपको क्या मिलता है |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | अलग Electron पार्टिशन + नेटिव WebSocket गेटवे | कई खाते, ईमेल कोड से एक साथ इंपोर्ट, हर खाते के लिए HTTP/SOCKS5 प्रॉक्सी, क्लाउड कंप्यूटर, लक्ष्य, पीयर, वर्कस्पेस फ़ाइलें, कनेक्टर की मंज़ूरी और डायग्नोस्टिक्स |
| **Grok Bot** (`grok.com`) | Sand गेटवे (`*.sand.x.ai`) के ज़रिए Connect-RPC / Protobuf | कई खाते, Sand क्लाउड वर्कस्पेस, लाइव स्ट्रीमिंग, टूल कॉल का इतिहास, सेशन, शेड्यूल किए गए काम, मेमोरी और स्किल्स |
| **Hark** (`hark.com`) | WebSocket RPC + मल्टीमोडल REST | ब्राउज़र से साइन इन (Google या ईमेल), बैकग्राउंड में जवाब सिंक के साथ लाइव स्ट्रीमिंग, फ़ाइल और इमेज अटैचमेंट, डॉक्यूमेंट कार्ड, शेड्यूल किए गए काम, मेमोरी और कनेक्टर |
| **Dot** (`chatgpt.com/dots`) | OpenAI Orbit/TBO REST + सर्वर-सेंट इवेंट्स (SSE) | ब्राउज़र से OAuth साइन इन या Access/Refresh Token इंपोर्ट, एन्क्रिप्टेड टोकन स्टोरेज, लाइव स्ट्रीमिंग, फ़ाइल अपलोड, स्किल्स, ऑटोमेशन, कनेक्टर और हर खाते के लिए प्रॉक्सी |

## ✨ सुविधाएँ

- **कई खाते, कोई गड़बड़ी नहीं**: हर खाता अपने Electron `persist:` पार्टिशन या एन्क्रिप्टेड क्रेडेंशियल स्लॉट में रहता है, इसलिए आप एक ही प्लेटफ़ॉर्म के कई खाते एक साथ चला सकते हैं।
- **प्रबंधन कंसोल**: फ़ुल-स्क्रीन व्यू, जिसमें कुल झलक, बॉट फ़िल्टर और खोज, एक साथ कनेक्शन जाँच, और हर प्लेटफ़ॉर्म के खाते, टोकन और प्रॉक्सी का प्रबंधन है।
- **भरपूर एजेंट चैट**: सोचने के चरणों और टूल कार्ड के साथ लाइव स्ट्रीमिंग, लंबे बैकग्राउंड कामों की रिकवरी, Markdown टेबल, हाइलाइट किया गया कोड, डॉक्यूमेंट प्रीव्यू और अटैचमेंट डाउनलोड।
- **बॉट विवरण पैनल**: दाईं ओर का पैनल प्लेटफ़ॉर्म के हिसाब से हर बॉट के सेशन, शेड्यूल किए गए काम, मेमोरी, स्किल्स, फ़ाइलें और सदस्य दिखाता है।
- **जीवंत अवतार**: हर बॉट का एक एनिमेटेड `GrokBotMark` किरदार होता है जो पॉइंटर का पीछा करता है और काम के दौरान प्रतिक्रिया देता है; आकार और रंग चुनें या फ़ोटो अपलोड करें।
- **डिफ़ॉल्ट रूप से सुरक्षित**: टोकन और प्रॉक्सी पासवर्ड Electron के `safeStorage` (macOS पर Keychain) से एन्क्रिप्ट होकर `0600` अनुमतियों के साथ सहेजे जाते हैं। कोड में कोई छिपा सीक्रेट नहीं, कोई टेलीमेट्री नहीं।
- **अंग्रेज़ी और चीनी इंटरफ़ेस**, लाइट और डार्क थीम।

## 🧰 डेवलपमेंट

```bash
npm ci
npm run dev          # Electron + Vite, हॉट रीलोड के साथ
```

| कमांड | विवरण |
| :--- | :--- |
| `npm run dev` | Electron मुख्य प्रोसेस, preload और React इंटरफ़ेस को हॉट रीलोड के साथ चलाता है |
| `npm run dev:web` | सिर्फ़ इंटरफ़ेस ब्राउज़र में चलाता है (बिना Electron, बिना खातों के) |
| `npm run typecheck` | Node और वेब टारगेट की टाइप जाँच |
| `npm test` | यूनिट टेस्ट (Vitest) |
| `npm run build` | टाइप जाँच करके प्रोडक्शन बंडल `out/` में बनाता है |
| `npm run dist:mac` / `npm run dist:win` | macOS `dmg` + `zip` (arm64 + x64) / Windows NSIS इंस्टॉलर को `release/` में पैकेज करता है |
| `npm run dist:dir` | जल्दी जाँच के लिए बिना पैकेज किया macOS arm64 ऐप |

README का स्क्रीनशॉट काल्पनिक डेटा से बनाया जाता है: `npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark]`।

## 🚀 रिलीज़ प्रक्रिया

हर push पर CI ([`ci.yml`](../../.github/workflows/ci.yml)) macOS और Windows पर टाइप जाँच, टेस्ट, बिल्ड और पैकेजिंग करता है।

1. `package.json` में `version` बढ़ाएँ और `main` में मर्ज करें।
2. संस्करण से मेल खाता टैग `vX.Y.Z` पुश करें।
3. [`release.yml`](../../.github/workflows/release.yml) एक ड्राफ़्ट रिलीज़ बनाता है, macOS (arm64 + x64 `dmg`/`zip`, `latest-mac.yml`) और Windows (NSIS `exe`, `latest.yml`) बिल्ड करता है, सब कुछ अपलोड करता है और सभी फ़ाइलें आ जाने पर रिलीज़ प्रकाशित करता है।

डिफ़ॉल्ट रूप से बिल्ड साइन नहीं होते। ये रिपॉज़िटरी सीक्रेट सेट होने पर साइनिंग और नोटराइज़ेशन चालू हो जाते हैं: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (macOS) या `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (Windows)।

## 📁 प्रोजेक्ट संरचना

```text
src/
  adapters/        प्लेटफ़ॉर्म एडैप्टर (Meta Muse, Grok Bot, Hark, Dot) और साझा PlatformAdapter इंटरफ़ेस
  main/            Electron मुख्य प्रोसेस
    muse/          Muse पार्टिशन सेशन, एक साथ साइन इन और हर खाते की प्रॉक्सी रूटिंग
    muse-native/   Muse क्लाउड कंप्यूटर और वर्कस्पेस के लिए नेटिव WebSocket गेटवे क्लाइंट
    grok/          Grok Bot का Sand ऑथ, Connect-RPC क्लाइंट और IPC हैंडलर
    hark/          Hark का WebSocket/REST क्लाइंट, अटैचमेंट अपलोडर और IPC हैंडलर
    dot/           OpenAI Dot (Orbit/TBO) क्लाइंट, एन्क्रिप्टेड टोकन वॉल्ट, SSE स्ट्रीमिंग और IPC
  preload/         window.electron के रूप में उपलब्ध टाइप्ड contextBridge API
  shared/          मुख्य प्रोसेस और इंटरफ़ेस के साझा IPC चैनल अनुबंध और टाइप
  renderer/        React + Tailwind + Zustand डेस्कटॉप इंटरफ़ेस
    components/    साइडबार, चैट, विवरण पैनल, प्लेटफ़ॉर्म पैनल, प्रबंधन कंसोल, GrokBotMark
    store/         बॉट स्थिति, स्ट्रीमिंग संदेशों का मिलान और लोकल स्टोरेज
scripts/screenshot/  काल्पनिक नमूना डेटा से README स्क्रीनशॉट
```

## 📚 प्रोटोकॉल दस्तावेज़

हर प्लेटफ़ॉर्म के प्रोटोकॉल और API नोट्स [`docs/`](../README.md) में हैं:

- **OpenAI Dot** (`chatgpt.com/dots`): [`docs/dot/protocol.md`](../dot/protocol.md): OAuth PKCE और वेब सेशन ऑथ, Orbit प्रोफ़ाइल, रूम SSE और REST, JSON-RPC 2.0 WebSocket, Pages, लाइब्रेरी और मेमोरी माइग्रेशन
- **Meta Muse** (`muse.ai`): [`docs/museai/protocol.md`](../museai/protocol.md): `Noise_XX_25519_ChaChaPoly_SHA256` WebSocket हैंडशेक और 65 से ज़्यादा JSON-RPC मेथड
- **xAI Grok Bot** (`grok.com`): [`docs/grokbot-protocol/protocol.md`](../grokbot-protocol/protocol.md): HTTP/2 पर Connect-RPC के एकल और स्ट्रीमिंग कॉल, Sand ऑथ, स्किल्स, मेमोरी, ऑटोमेशन और क्लाउड सैंडबॉक्स
- **Hark** (`hark.com`): [`docs/hark/protocol.md`](../hark/protocol.md): REST और NDJSON स्ट्रीमिंग एंडपॉइंट, कनेक्टर, शेड्यूल किए गए काम, VM फ़ाइल ट्री और कंप्यूटर सेशन

## ❓ अक्सर पूछे जाने वाले सवाल

<details>
<summary><b>क्या BotHub इन प्लेटफ़ॉर्म का आधिकारिक ऐप है?</b></summary>

नहीं। BotHub एक स्वतंत्र क्लाइंट है और इसका Meta, xAI, Hark या OpenAI से कोई संबंध नहीं है। यह हर प्लेटफ़ॉर्म पर आपके अपने खाते इस्तेमाल करता है।

</details>

<details>
<summary><b>मेरे खाते और टोकन कहाँ सहेजे जाते हैं?</b></summary>

सिर्फ़ आपके कंप्यूटर पर। वेब सेशन हर खाते के अलग Electron पार्टिशन में रहते हैं; टोकन और प्रॉक्सी पासवर्ड `safeStorage` (macOS पर Keychain) से एन्क्रिप्ट होकर `0600` अनुमतियों के साथ सहेजे जाते हैं। BotHub कोई टेलीमेट्री नहीं भेजता।

</details>

<details>
<summary><b>macOS कहता है कि BotHub नहीं खुल सकता। क्या करूँ?</b></summary>

बिल्ड अभी साइन नहीं किए गए हैं। ऐप पर राइट-क्लिक करके **Open** चुनें, या `xattr -cr /Applications/BotHub.app` चलाएँ। [जल्दी शुरू करें](#-जल्दी-शुरू-करें) देखें।

</details>

<details>
<summary><b>संदेश बहुत देर से "पहुँच गया · जवाब आ रहा है" दिखा रहा है। क्या दोबारा कोशिश करने पर वह दो बार जाएगा?</b></summary>

नहीं। प्लेटफ़ॉर्म के संदेश स्वीकार करने के बाद BotHub उसे कभी न भेजा गया नहीं दिखाता। अगर जवाब नहीं आता, तो *कोई जवाब नहीं* के साथ **फिर से भेजें** बटन दिखता है, जो साफ़ बताता है कि दूसरी कॉपी भेजी जाएगी।

</details>

<details>
<summary><b>क्या हर खाता अपनी अलग प्रॉक्सी इस्तेमाल कर सकता है?</b></summary>

हाँ, Muse और Dot खातों के लिए (HTTP या SOCKS5)। अगर प्रॉक्सी लागू नहीं हो पाती, तो BotHub सीधे कनेक्शन पर जाने के बजाय उस खाते का ट्रैफ़िक रोक देता है।

</details>

## 📄 लाइसेंस

[MIT लाइसेंस](../../LICENSE) के तहत जारी।
