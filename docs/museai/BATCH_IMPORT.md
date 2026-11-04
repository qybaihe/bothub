# Muse 批量导入（email one-time-code）

入口：新建 Bot → 「批量导入 Muse 账号」。

## 输入格式

每行一个账号，`#` 或 `//` 开头为注释，空行忽略：

```
name@example.com | https://generator.email/name@example.com
other@example.com----https://generator.email/other@example.com
third@example.com<TAB>https://generator.email/third@example.com
```

分隔符可用 `|`、`----`（两个及以上 `-`）、Tab、逗号、分号或空白。收件箱链接必须是 https。重复邮箱只保留第一行。

## 流程（主进程 `src/main/muse/museAutoLogin.ts`）

1. 每个账号新建 accountId → 独立 `persist:` partition；`openLogin(..., { hidden: true })` 打开**不显示**的 muse.ai 登录窗。
2. 先读取一次收件箱页面（独立内存 partition 的隐藏窗口，JS 渲染后取 `innerText`），记录已有验证码（视为过期）。
3. 在 `input[autocomplete~=username]` 输入邮箱 → 点「继续」。
4. 等待 `input[autocomplete=one-time-code]`，轮询收件箱（4s 间隔，≤120s），取第一个**新**的 6 位码（`Use code NNNNNN to log in` 等）。
5. 填码 → 「下一步」，等待 `hatch_sess` cookie（原有 openLogin 逻辑负责发出 login 事件并关闭窗口）。
6. 若 Meta 出现「Confirm you're human」等 checkpoint：**不自动化**，行状态为「需人工验证」，可点「打开窗口」手动完成，完成后自动建 Bot。

失败行会清空该 partition（`cancelLogin`）；支持重试、取消、并发 1–2。

## 隐私

- 日志只记录失败原因枚举，不记录邮箱、链接或验证码。
- 收件箱链接只在本次导入的内存里使用，不落盘（暂不支持用它自动重新登录）。
