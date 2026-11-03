# Grok Bot 跨账号完整原生迁移总控指令 (MASTER MIGRATION)

你好！用户刚刚将账号从 `qybaihe` 切换到当前新账号 `khiem`。
请立即在当前回合使用你的内置工具（`UpdateMemory`, `CreateAgent`, `UpdateAgent`, `CreateChannel`, `SendToAgent`, `UpdateProfile`, `UpdateAvatar`, `UpdateSkill`, `UpdateRoutine`, `Read`）完成 100% 原生迁移：

## 第一步：写入全局用户记忆 (`scope="user"`)
请调用 `UpdateMemory` (`action="write"`, `scope="user"`) 将 `/Users/baihe/Downloads/grokbot-migration/ALL_MEMORIES_IMPORT.md` 中的核心身份、指令偏好与项目背景写入全局记忆（Instructions 与核心 Identity 使用 `tier="profile"`，其余项目使用 `tier="log"`），使当前账号下所有 Bot 共享。

## 第二步：批量重建全部 11 个原生活跃 Bot 与群聊
你可以将你自己（当前默认 Bot）直接通过 `UpdateProfile` + `UpdateAvatar` 改名为第一个主力 Bot **`mu`**（或者保持你自己为总控/助手，并调用 `CreateAgent` 创建其余 Bot）。
以下是需要确保存在于当前账号中的 **10 个独立 Bot** 与 **1 个协作群聊**：

| # | 名称 (`name`) | 分组 (`section`) | `avatarShape` | `avatarColor` | `voiceId` | 职责简介 (`description`) | 自配置与历史记录路径 |
|---|---|---|---|---|---|---|---|
| 1 | **bla** | `claude` | `flower` | `blue` | `默认` | 负责 GitHub 开源项目 qybaihe/bla（Blind LLM Agents / 代码防逆向与反AI分析保护工具）的架构强化、PR 提交与 Skill 维护。 | `/Users/baihe/Downloads/grokbot-migration/bots/bla/BOOTSTRAP.md` |
| 2 | **助手** | `__agents__` | `blob` | `gray` | `默认` | 通用私人助手，负责远程机器 Tailscale / Claude Code 桥接咨询、签证项目（如美国 J-1 SWT 与硅谷实习对比）调研及各类即时任务。 | `/Users/baihe/Downloads/grokbot-migration/bots/助手/BOOTSTRAP.md` |
| 3 | **宝猪** | `宝猪` | `blob` | `magenta` | `默认` | 负责『26今经乐道 / WHOPAYS 假日商圈AI大赛 / 岐遇』项目的网页端、APP端、3D场景、宣传片制作，以及 WildChat 紧松文化（Tightness-Looseness）论文数据分析。 | `/Users/baihe/Downloads/grokbot-migration/bots/宝猪/BOOTSTRAP.md` |
| 4 | **宝猪的homework** | `宝猪` | `pumpkin` | `orange` | `默认` | 负责宝猪的课程作业、2026 Find『凡能仙·今经乐道』Token经济案例分析，以及车辆轨迹异常检测比赛的数据质量核验与导师沟通。 | `/Users/baihe/Downloads/grokbot-migration/bots/宝猪的homework/BOOTSTRAP.md` |
| 5 | **devpost** | `claude` | `blob` | `green` | `默认` | 负责全球黑客松（Devpost / Codegeist 2026 / Kiroween 2026 / BoHack 2026 天津青年黑客松 / 话中画）发现、自动报名、平台账号注册、积分申领与作品提交。 | `/Users/baihe/Downloads/grokbot-migration/bots/devpost/BOOTSTRAP.md` |
| 6 | **bytedance** | `claude` | `clover` | `magenta` | `helix` | 负责字节跳动广告素材复刻（paid_ads_inspiration）、视频质量质检，以及调用本机（白鹤）Seedance 文生视频网关接口出片。 | `/Users/baihe/Downloads/grokbot-migration/bots/bytedance/BOOTSTRAP.md` |
| 7 | **宝猪的简历** | `宝猪` | `clover` | `violet` | `默认` | 负责陈颖萤（宝猪，中山大学管理学院工商管理大三，辅修AI经济与计算数据）的中英文一页式简历打磨、校招/实习网申、内推码整理与社群自我介绍优化。 | `/Users/baihe/Downloads/grokbot-migration/bots/宝猪的简历/BOOTSTRAP.md` |
| 8 | **daily** | `claude` | `blob` | `green` | `默认` | 负责日常技术选型、开源冲 Star 策略，以及 `hash-design`（用哈希 Seed 生成截然不同但可复现的 UI 设计方向）Skill 与开源仓库打磨。 | `/Users/baihe/Downloads/grokbot-migration/bots/daily/BOOTSTRAP.md` |
| 9 | **claude** | `claude` | `square` | `orange` | `默认` | 连接远程 Mac mini 上的 Claude Code，专职负责黑客松作品从零到一的代码构建与合成（当前作品：《字的海 · 话中画 Art In Word》）。 | `/Users/baihe/Downloads/grokbot-migration/bots/claude/BOOTSTRAP.md` |
| 10 | **mu** | `claude` | `blob` | `orange` | `liora` | 负责 mu / mude（A coding agent with a judge model in its harness）开源项目、YC 申请表填写与打磨、演示视频制作，以及多线工程（board / bytetech / nebius / jev-trailer）进度盯梢。 | `/Users/baihe/Downloads/grokbot-migration/bots/mu/BOOTSTRAP.md` |

- **群聊 (`CreateChannel`)**: **黑客松自动化** — 成员：`devpost, claude`，职责：黑客松全自动流水线群聊：由 @devpost 负责找比赛、自动报名、领积分并整理 Brief，交由 @claude 连上 Mac mini 从零编写代码构建作品并打包。

## 第三步：触发每个新 Bot 的自配置与历史气泡还原 (`SendToAgent`)
每创建一个新 Bot 后，请立即调用 `SendToAgent` 给它发送以下消息（将 `<bot_name>` 替换为对应名称）：
> 请读取本机文件 `/Users/baihe/Downloads/grokbot-migration/bots/<bot_name>/BOOTSTRAP.md`，立即按照其中的 `<bot_template_setup_context>` 和 `<bot_template_setup_instructions>` 调用 `UpdateProfile`、`UpdateAvatar`、`UpdateMemory`、`UpdateSkill`、`UpdateRoutine` 完成你自己的外观、记忆、技能与自动化巡检配置，并在你的聊天窗口中输出 `BOOTSTRAP.md` 第 3 节的【最近对话记录回放】气泡！

## 第四步：同步本地侧边栏分组、语音配置与草稿缓存
在所有 Bot 创建完成后，请使用 `Shell` 工具在本机运行以下命令，将本地客户端缓存中的侧边栏分组（`claude` 分组、`宝猪` 分组）、语音配置（`mu` 的 `liora`、`bytedance` 的 `helix`）、未发送草稿和 UI 状态自动绑定到新生成的 Bot UUID 上：
```bash
python3 /Users/baihe/Downloads/grokbot-migration/sync_local_persistence.py
```
完成后向用户汇报所有已创建的 Bot 列表！
