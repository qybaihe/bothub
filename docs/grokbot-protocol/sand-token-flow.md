# Grok Bot (sand) 登录 / accessToken 获取流程（静态分析 app.asar，2026-11-03）

源：`/Applications/Grok Bot.app/Contents/Resources/app.asar` → 解包 `dist/electron-main/main-app.cjs`（偏移为字节 offset）、`main-core.cjs`。只看代码，没读 Keychain 或 secrets。

## 结论
- sand 不用网页 cookie 或 `WorkosCursorSessionToken`（代码里根本没有这个字符串）。
- 它走 **PKCE 深链登录 + /auth/poll 轮询**，拿到 `{accessToken, refreshToken}`（Cursor 的 OAuth access JWT，不是 type:"web"）。之后用 `/oauth/token` 的 refresh_token 续期。
- 所有 GrokBotService RPC（List / Send / Transcript）都用**同一个** `Bearer accessToken`，代码里不区分。List 能过而写操作 401，基本可以确定是 web 类型 token 被写接口拒了。
- 没有 cursor:// 或 sand:// 回调来传 token。`open-url` 和 `setAsDefaultProtocolClient` 都存在，但 token 只从 poll 结果拿。

## 1. 发起登录（main-app.cjs @1143770 `Zne.startLogin`，@816xxx `hpn`）
```js
verifier  = base64url(randomBytes(32))
challenge = base64url(sha256(verifier))     // 对 verifier 字符串做 sha256
uuid      = randomUUID()
url = https://cursor.com/loginDeepControl?challenge=<challenge>&uuid=<uuid>&mode=login&redirectTarget=sand&supportsSelectedTeamLogin=true
```
用户在浏览器里打开这个 URL，完成登录（邮箱验证码或 SSO），然后在页面上确认授权给 sand。

## 2. 轮询（@819110 `Epn` / `pollLoginResult`）
```
GET https://api2.cursor.sh/auth/poll?uuid=<uuid>&verifier=<verifier>
Headers: Content-Type: application/json  (+ 可选 x-cursor-mdm-signin-policy，来自 MDM，可不带)
404 → 继续等；退避 1s×1.2^n，上限 10s，最多 150 次；连续 3 次非 404 错误就放弃
403 {error:"sign_in_policy_violation"} → 策略拒绝
200 → JSON
```
200 时的响应形态（`hgn` @1142806 校验），二选一：
- Cursor 身份：`{ accessToken, refreshToken, authId?, selectedTeamId? }` ← 普通账号走这个
- xAI 身份：`{ xaiAccessToken, xaiRefreshToken, xaiAccessTokenExpiresAt, xaiIssuer, selectedTeamId? }`，只在 tenant backend 下出现（`acceptXaiIdentityLogin` @1249815）

拿到后 `storeAuthentication({accessToken, refreshToken})` 存进 secrets（@1267117）。

## 3. 刷新（@1270312 `runRefreshAccessToken`）
```
POST https://api2.cursor.sh/oauth/token
content-type: application/json
{"client_id":"<authClientId>","grant_type":"refresh_token","refresh_token":"<refreshToken>"}
→ {access_token?, refresh_token?(轮换), shouldLogout?, error?}
```
- `authClientId` 由 main-core.cjs @663920 的 `zh` 决定：生产 api2.cursor.sh 用 `KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB`（公开 client_id，不是密钥），dev host 用另一个。
- 何时刷新（`j2`/`ZTe`）：JWT 的 exp 剩不到 5 分钟，或者没有 exp。
- `shouldLogout:true` 表示需要重新登录。

## 4. 备用：API key 换 token（@817613 `Apn`，CLI 路径）
```
POST https://api2.cursor.sh/auth/exchange_user_api_key
Authorization: Bearer <user API key>
body {}
→ {accessToken, refreshToken?}
```
sand 的 `loginWithApiKey` 也会调它。BotHub 如果有用户的 Cursor API key，可以直接走这条。

## 5. RPC 时带哪个 token（@~ `W9t` / `Ha` / `mOe`）
- `getValidAccessToken()`：有 xAI 会话时用 xAI token，否则用 `getValidCursorAccessToken`（读存储的 pair，需要时先 refresh）。
- `authorization: Bearer <accessToken>`；有 team 时加 `x-cursor-team-id`（来自 `getTeamId` 或 poll 返回的 selectedTeamId）。
- 唯一特例：`aiserver.v1.InferenceService/Stream` 用 `getGrokBotAccessToken` 覆盖 authorization。GrokBotService 不走这个特例。
- 其余头见 checksum-and-headers.md。不需要 Cookie。

## BotHub 应该怎么做
1. 实现 PKCE 登录：生成 verifier、challenge、uuid → 在 BrowserWindow 或外部浏览器打开 loginDeepControl（redirectTarget=sand）→ main 进程轮询 /auth/poll → 存 accessToken 和 refreshToken（用 safeStorage）。
2. 用这个 accessToken 调所有 GrokBotService 方法；exp 剩不到 5 分钟时调 /oauth/token 刷新，并保存轮换后的 refresh_token。
3. 弃用 web 的 WorkosCursorSessionToken。
4. 有 selectedTeamId 时带上 x-cursor-team-id。
