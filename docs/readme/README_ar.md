<div dir="rtl">

<div align="center">

[English](../../README.md) · [简体中文](README_zh.md) · [繁體中文](README_zh-TW.md) · [日本語](README_ja.md) · [한국어](README_ko.md) · [Español](README_es.md) · [Français](README_fr.md) · [Deutsch](README_de.md) · [Português (Brasil)](README_pt-BR.md) · [Русский](README_ru.md) · [Italiano](README_it.md) · [Tiếng Việt](README_vi.md) · [Türkçe](README_tr.md) · **العربية** · [Bahasa Indonesia](README_id.md) · [हिन्दी](README_hi.md)

<br />

<img src="../assets/logo.png" alt="BotHub" width="88" />

# BotHub

### **اجمع كل وكلائك الشخصيين واستخدمهم في عميل واحد، تمامًا مثل Grok Bot**

**تطبيق لنظامي macOS وWindows يجمع بوتاتك على Meta Muse وGrok Bot وHark وDot في نافذة واحدة، ويسجّل كل بوت دخوله بحسابه المعزول الخاص.**

[![Release](https://img.shields.io/github/v/release/qybaihe/bothub?style=for-the-badge&label=%D8%A7%D9%84%D8%A5%D8%B5%D8%AF%D8%A7%D8%B1&color=2563eb)](https://github.com/qybaihe/bothub/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/qybaihe/bothub/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/qybaihe/bothub/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/%D8%A7%D9%84%D9%85%D9%86%D8%B5%D8%A9-macOS_%7C_Windows-6e56cf?style=for-the-badge)](#-البدء-السريع)
[![Electron](https://img.shields.io/badge/Electron-45-47848f?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![MIT License](https://img.shields.io/badge/%D8%A7%D9%84%D8%AA%D8%B1%D8%AE%D9%8A%D8%B5-MIT-38bdf8?style=for-the-badge)](../../LICENSE)

**[⬇️ تنزيل لنظام macOS](https://github.com/qybaihe/bothub/releases/latest) · [⬇️ تنزيل لنظام Windows](https://github.com/qybaihe/bothub/releases/latest) · [📦 كل الإصدارات](https://github.com/qybaihe/bothub/releases) · [🐛 الإبلاغ عن مشكلة](https://github.com/qybaihe/bothub/issues)**

[البدء السريع](#-البدء-السريع) · [المنصات](#-المنصات-المدعومة) · [الميزات](#-الميزات) · [التطوير](#-التطوير) · [إصدار النسخ](#-إصدار-النسخ) · [البروتوكولات](#-توثيق-البروتوكولات) · [الأسئلة الشائعة](#-الأسئلة-الشائعة)

</div>

---

</div>

> [!NOTE]
> BotHub عميل مستقل ولا يرتبط بـ Meta أو xAI أو Hark أو OpenAI. تسجّل الدخول بحساباتك الخاصة، وتبقى بيانات الاعتماد على جهازك فقط.

<div dir="rtl">

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bothub-dark.webp">
  <img src="../assets/bothub-light.webp" alt="BotHub: بوتات Muse وDot وHark وGrok Bot مجمّعة في الشريط الجانبي، ومحادثة، ولوحة تفاصيل البوت (بيانات تجريبية)" width="100%">
</picture>
<sub>لقطة شاشة ببيانات تجريبية خيالية.</sub>
</div>

<br />

<table>
<tr>
<td width="33%" valign="top">

### 🧩 كل الوكلاء في نافذة واحدة
بوتات Muse وGrok Bot وHark وDot جنبًا إلى جنب، مجمّعة في الشريط الجانبي، ولكل منها محادثته ولوحة تفاصيله وإعداداته.

</td>
<td width="33%" valign="top">

### 🔐 حسابات معزولة
يعمل كل حساب في قسم جلسة خاص به أو في خانة بيانات اعتماد مشفّرة، فلا تختلط أبدًا عدة حسابات على المنصة نفسها.

</td>
<td width="33%" valign="top">

### ✅ تسليم موثوق
تعرض الرسائل الحالات *جارٍ الإرسال* و*تم التسليم · جارٍ الرد* و*لا يوجد رد* و*فشل*. الرسالة التي قبلتها المنصة لا تُعرض أبدًا على أنها غير مُرسلة، لذا لا تؤدي إعادة المحاولة إلى إرسالها مرتين.

</td>
</tr>
</table>

---

## ⚡ البدء السريع

نزّل الملف المناسب لنظامك من [أحدث إصدار](https://github.com/qybaihe/bothub/releases/latest):

| النظام | الملف |
| :--- | :--- |
| macOS، شرائح Apple | `BotHub-<الإصدار>-arm64.dmg` |
| macOS، Intel | `BotHub-<الإصدار>-x64.dmg` |
| Windows 10/11 (x64) | `BotHub-Setup-<الإصدار>-x64.exe` |

</div>

> [!TIP]
> النسخ غير موقّعة رقميًا حتى الآن.
> - **macOS**: اسحب `BotHub.app` إلى مجلد التطبيقات، ثم انقر عليه بزر الفأرة الأيمن واختر **فتح** في المرة الأولى (أو *إعدادات النظام ← الخصوصية والأمن ← فتح على أي حال*). يمكنك أيضًا إزالة علامة الحجر بالأمر `xattr -cr /Applications/BotHub.app`.
> - **Windows**: إذا ظهرت رسالة SmartScreen «قام Windows بحماية الكمبيوتر»، فانقر على **مزيد من المعلومات ← التشغيل على أي حال**.

<div dir="rtl">

بعد ذلك انقر على **+** في الشريط الجانبي، واختر منصة، وسجّل الدخول. يحتفظ كل بوت بحسابه الخاص.

**التحديثات**: على Windows، ينزّل BotHub الإصدارات الجديدة في الخلفية ويثبّتها بنقرة واحدة. وعلى macOS، ينبّهك عند صدور إصدار جديد ويفتح صفحة التنزيل.

## 🤖 المنصات المدعومة

| المنصة | البروتوكول والنقل | ما تحصل عليه |
| :--- | :--- | :--- |
| **Meta Muse** (`muse.ai`) | قسم Electron معزول + بوابة WebSocket أصلية | حسابات متعددة، واستيراد جماعي برموز البريد الإلكتروني، ووكيل HTTP/SOCKS5 لكل حساب، وكمبيوتر سحابي، وأهداف، ونظراء، وملفات مساحة العمل، والموافقة على الموصلات، والتشخيص |
| **Grok Bot** (`grok.com`) | Connect-RPC / Protobuf عبر بوابة Sand (`*.sand.x.ai`) | حسابات متعددة، ومساحة عمل Sand السحابية، وبث مباشر، وسجل استدعاءات الأدوات، والجلسات، والمهام المجدولة، والذاكرة، والمهارات |
| **Hark** (`hark.com`) | WebSocket RPC + REST متعدد الوسائط | تسجيل الدخول عبر المتصفح (Google أو البريد الإلكتروني)، وبث مباشر مع مزامنة الردود في الخلفية، ومرفقات الملفات والصور، وبطاقات المستندات، والمهام المجدولة، والذاكرة، والموصلات |
| **Dot** (`chatgpt.com/dots`) | OpenAI Orbit/TBO REST + أحداث مرسلة من الخادم (SSE) | تسجيل الدخول عبر OAuth في المتصفح أو استيراد Access/Refresh Token، وتخزين مشفّر للرموز، وبث مباشر، ورفع الملفات، والمهارات، والأتمتة، والموصلات، ووكيل لكل حساب |

## ✨ الميزات

- **حسابات كثيرة بلا تداخل**: يعيش كل حساب في قسم Electron `persist:` خاص به أو في خانة بيانات اعتماد مشفّرة، لذا يمكنك استخدام عدة حسابات من المنصة نفسها في الوقت ذاته.
- **لوحة الإدارة**: عرض بملء الشاشة يضم نظرة عامة، وتصفية البوتات والبحث عنها، وفحص الاتصال دفعة واحدة، وإدارة الحسابات والرموز والوكلاء لكل منصة.
- **محادثة غنية مع الوكلاء**: بث مباشر مع خطوات التفكير وبطاقات الأدوات، واستئناف المهام الطويلة في الخلفية، وجداول Markdown، وتلوين الشيفرة، ومعاينة المستندات، وتنزيل المرفقات.
- **لوحة تفاصيل البوت**: تعرض اللوحة اليمنى جلسات كل بوت ومهامه المجدولة وذاكرته ومهاراته وملفاته وأعضاءه، بحسب المنصة.
- **صور رمزية حيّة**: لكل بوت شخصية متحركة `GrokBotMark` تتبع المؤشر وتتفاعل أثناء العمل؛ اختر الشكل واللون أو ارفع صورة.
- **آمن افتراضيًا**: تُشفَّر الرموز وكلمات مرور الوكلاء باستخدام `safeStorage` في Electron (سلسلة المفاتيح على macOS) وتُحفظ بأذونات `0600`. لا أسرار مضمّنة في الشيفرة ولا قياس عن بُعد.
- **واجهة بالإنجليزية والصينية**، مع سمتين فاتحة وداكنة.

## 🧰 التطوير

</div>

<div dir="ltr">

```bash
npm ci
npm run dev          # Electron + Vite مع إعادة التحميل الفوري
```

</div>

<div dir="rtl">

| الأمر | الوصف |
| :--- | :--- |
| `npm run dev` | يشغّل عملية Electron الرئيسية وpreload وواجهة React مع إعادة التحميل الفوري |
| `npm run dev:web` | يشغّل الواجهة فقط في المتصفح (بلا Electron وبلا حسابات) |
| `npm run typecheck` | يفحص الأنواع لهدفي Node والويب |
| `npm test` | اختبارات الوحدات (Vitest) |
| `npm run build` | يفحص الأنواع ويبني حزم الإنتاج في `out/` |
| `npm run dist:mac` / `npm run dist:win` | يحزم macOS `dmg` + `zip` (arm64 + x64) / مثبّت Windows NSIS في `release/` |
| `npm run dist:dir` | تطبيق macOS arm64 غير محزوم لاختبار سريع |

تُنشأ لقطة شاشة README من بيانات خيالية: `npx -y -p playwright@1.64 node scripts/screenshot/capture.mjs [--dark]`.

## 🚀 إصدار النسخ

مع كل push، يجري CI ([`ci.yml`](../../.github/workflows/ci.yml)) فحص الأنواع والاختبارات والبناء والتحزيم على macOS وWindows.

1. ارفع قيمة `version` في `package.json` وادمج التغيير في `main`.
2. ادفع وسمًا `vX.Y.Z` يطابق الإصدار.
3. ينشئ [`release.yml`](../../.github/workflows/release.yml) مسودة إصدار، ويبني macOS (arm64 + x64 `dmg`/`zip`، `latest-mac.yml`) وWindows (NSIS `exe`، `latest.yml`)، ويرفع كل الملفات، وينشر الإصدار عند اكتمالها.

لا تُوقَّع النسخ افتراضيًا. يُفعَّل التوقيع والتوثيق عند ضبط أسرار المستودع التالية: `CSC_LINK`، `CSC_KEY_PASSWORD`، `APPLE_ID`، `APPLE_APP_SPECIFIC_PASSWORD`، `APPLE_TEAM_ID` (macOS) أو `WIN_CSC_LINK`، `WIN_CSC_KEY_PASSWORD` (Windows).

## 📁 بنية المشروع

</div>

<div dir="ltr">

```text
src/
  adapters/        محوّلات المنصات (Meta Muse وGrok Bot وHark وDot) وواجهة PlatformAdapter المشتركة
  main/            عملية Electron الرئيسية
    muse/          جلسات أقسام Muse وتسجيل الدخول الجماعي وتوجيه الوكيل لكل حساب
    muse-native/   عميل بوابة WebSocket الأصلية للكمبيوتر السحابي ومساحة عمل Muse
    grok/          مصادقة Sand وعميل Connect-RPC ومعالجات IPC لـ Grok Bot
    hark/          عميل WebSocket/REST ورفع المرفقات ومعالجات IPC لـ Hark
    dot/           عميل OpenAI Dot (Orbit/TBO) وخزنة رموز مشفّرة وبث SSE وIPC
  preload/         واجهة contextBridge مُنمّطة متاحة باسم window.electron
  shared/          عقود قنوات IPC والأنواع المشتركة بين العملية الرئيسية والواجهة
  renderer/        واجهة سطح المكتب بـ React + Tailwind + Zustand
    components/    الشريط الجانبي والمحادثة ولوحة التفاصيل ولوحات المنصات ولوحة الإدارة وGrokBotMark
    store/         حالة البوتات ودمج الرسائل المتدفقة والحفظ المحلي
scripts/screenshot/  لقطة شاشة README من بيانات تجريبية خيالية
```

</div>

<div dir="rtl">

## 📚 توثيق البروتوكولات

توجد البروتوكولات وملاحظات الواجهات البرمجية لكل منصة في [`docs/`](../README.md):

- **OpenAI Dot** (`chatgpt.com/dots`): [`docs/dot/protocol.md`](../dot/protocol.md): مصادقة OAuth PKCE وجلسة الويب، وملفات Orbit الشخصية، وSSE وREST للغرف، وWebSocket بنظام JSON-RPC 2.0، وPages، والمكتبة، وترحيل الذاكرة
- **Meta Muse** (`muse.ai`): [`docs/museai/protocol.md`](../museai/protocol.md): مصافحة WebSocket المشفّرة `Noise_XX_25519_ChaChaPoly_SHA256` وأكثر من 65 أسلوب JSON-RPC
- **xAI Grok Bot** (`grok.com`): [`docs/grokbot-protocol/protocol.md`](../grokbot-protocol/protocol.md): استدعاءات Connect-RPC الأحادية والمتدفقة عبر HTTP/2، ومصادقة Sand، والمهارات، والذاكرة، والأتمتة، وبيئة الحماية السحابية
- **Hark** (`hark.com`): [`docs/hark/protocol.md`](../hark/protocol.md): نقاط نهاية REST وبث NDJSON، والموصلات، والمهام المجدولة، وشجرة ملفات الآلة الافتراضية، وجلسات الكمبيوتر

## ❓ الأسئلة الشائعة

<details>
<summary><b>هل BotHub تطبيق رسمي لهذه المنصات؟</b></summary>

لا. BotHub عميل مستقل ولا يرتبط بـ Meta أو xAI أو Hark أو OpenAI، ويستخدم حساباتك الخاصة على كل منصة.

</details>

<details>
<summary><b>أين تُحفظ حساباتي ورموزي؟</b></summary>

على جهازك فقط. تُحفظ جلسات الويب في أقسام Electron منفصلة لكل حساب، وتُشفَّر الرموز وكلمات مرور الوكلاء باستخدام `safeStorage` (سلسلة المفاتيح على macOS) وتُحفظ بأذونات `0600`. لا يرسل BotHub أي بيانات قياس عن بُعد.

</details>

<details>
<summary><b>يقول macOS إنه لا يمكن فتح BotHub. ماذا أفعل؟</b></summary>

النسخ غير موقّعة بعد. انقر على التطبيق بزر الفأرة الأيمن واختر **فتح**، أو شغّل `xattr -cr /Applications/BotHub.app`. راجع [البدء السريع](#-البدء-السريع).

</details>

<details>
<summary><b>تظهر رسالة «تم التسليم · جارٍ الرد» لوقت طويل. هل ستُرسل مرتين إذا أعدت المحاولة؟</b></summary>

لا. بمجرد أن تقبل المنصة الرسالة، لا يعرضها BotHub أبدًا على أنها غير مُرسلة. وإذا لم يصل رد، تظهر حالة *لا يوجد رد* مع زر **إرسال مجددًا** يوضّح أنه سيرسل نسخة ثانية.

</details>

<details>
<summary><b>هل يمكن لكل حساب استخدام وكيل خاص به؟</b></summary>

نعم، لحسابات Muse وDot (HTTP أو SOCKS5). وإذا تعذّر تطبيق الوكيل، يحظر BotHub حركة ذلك الحساب بدل التحول إلى اتصال مباشر.

</details>

## 📄 الترخيص

منشور بموجب [ترخيص MIT](../../LICENSE).

</div>
