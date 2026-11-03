# x-cursor-checksum + Sand 请求头（来自 Grok Bot.app asar，2026-11-03）

## checksum 算法（导出名 `createCursorChecksum` / 内部 `T_`）

```js
function obfuscateTimestampBytes(bytes) {
  let t = 165;
  for (let n = 0; n < bytes.length; n++) {
    bytes[n] = (bytes[n] ^ t) + (n % 256);
    t = bytes[n];
  }
  return bytes;
}

/** machineId 非空时必须带；空则客户端不加此头，服务端写接口可能 401 */
function createCursorChecksum(machineId) {
  const ts = Math.floor(Date.now() / 1e6); // ms / 1e6
  const n = new Uint8Array([
    (ts >> 40) & 255,
    (ts >> 32) & 255,
    (ts >> 24) & 255,
    (ts >> 16) & 255,
    (ts >> 8) & 255,
    ts & 255,
  ]);
  return Buffer.from(obfuscateTimestampBytes(n)).toString("base64url") + machineId;
}
```

注意：`F9t` **原地修改** Uint8Array。

## 基础头 `getSandBackendClientHeaders`

```js
// SAND_CLIENT_TYPE === "sand"
{
  "user-agent": `Mozilla/5.0 ${osUa(clientOS)} AppleWebKit/537.36 (KHTML, like Gecko) Sand/${clientVersion} Safari/537.36`,
  "x-cursor-client-type": "sand",
  "x-cursor-client-version": clientVersion, // 取自 app，约 0.78.x
  "x-sand-box-namespace": boxNamespace,
  "x-cursor-client-os": clientOS, // darwin|win32|linux
  // optional: "x-cursor-client-source": ...
}
```

darwin UA 片段：`(Macintosh; Intel Mac OS X 10_15_7)`

## 每次 RPC 拦截器还会加（`fOe` / `mOe`）

- `authorization: Bearer ${accessToken}`（authMode required）
- `x-cursor-team-id`（有 team 时）
- `x-cursor-checksum: createCursorChecksum(machineId)`（**仅 machineId.length > 0**）
- `x-ghost-mode: "true"|"false"`
- `x-request-id: uuid`
- 可能还有 lineage / inference 相关头

## 对 BotHub 401 的含义

List 能过、Send/Transcript 401，优先怀疑：

1. 没传或传空 `machineId` → 没带 checksum  
2. 缺 `x-cursor-client-*` / `x-sand-box-namespace` / `x-ghost-mode`  
3. token 形态不对时部分方法更严（先按上面补齐头再试）

实现时生成一个稳定 UUID 作 machineId 即可，勿读本机 Keychain。
