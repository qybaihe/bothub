# Grok Bot 跨账号完整原生迁移总控指令 (MASTER MIGRATION SAMPLE)

你好！用户刚刚将账号从 `<SOURCE_ACCOUNT>` 切换到当前新账号 `<TARGET_ACCOUNT>`。
请立即在当前回合使用你的内置工具（`UpdateMemory`, `CreateAgent`, `UpdateAgent`, `CreateChannel`, `SendToAgent`, `UpdateProfile`, `UpdateAvatar`, `UpdateSkill`, `UpdateRoutine`, `Read`）完成 100% 原生迁移：

## 第一步：写入全局用户记忆 (`scope="user"`)
请调用 `UpdateMemory` (`action="write"`, `scope="user"`) 将 `./grokbot-migration/ALL_MEMORIES_IMPORT.md` 中的核心身份、指令偏好与项目背景写入全局记忆（Instructions 与核心 Identity 使用 `tier="profile"`，其余项目使用 `tier="log"`），使当前账号下所有 Bot 共享。

## 第二步：批量重建原生活跃 Bot 与群聊
你可以将你自己（当前默认 Bot）直接通过 `UpdateProfile` + `UpdateAvatar` 改名为第一个主力 Bot，并调用 `CreateAgent` 创建其余 Bot：

| # | 名称 (`name`) | 分组 (`section`) | `avatarShape` | `avatarColor` | `voiceId` | 职责简介 (`description`) | 自配置与历史记录路径 |
|---|---|---|---|---|---|---|---|
| 1 | **security-agent** | `Engineering` | `flower` | `blue` | `默认` | 负责开源项目的架构强化、PR 提交与 Skill 维护。 | `./grokbot-migration/bots/security-agent/BOOTSTRAP.md` |
| 2 | **coding-steward** | `Engineering` | `blob` | `orange` | `liora` | 负责编码 Agent 项目的研发与多线工程进度巡检。 | `./grokbot-migration/bots/coding-steward/BOOTSTRAP.md` |
| 3 | **research-assistant** | `Research` | `clover` | `violet` | `默认` | 负责文献综述、实验数据分析与报告撰写。 | `./grokbot-migration/bots/research-assistant/BOOTSTRAP.md` |

## 第三步：触发每个新 Bot 的自配置与历史气泡还原 (`SendToAgent`)
每创建一个新 Bot 后，请立即调用 `SendToAgent` 给它发送以下消息（将 `<bot_name>` 替换为对应名称）：
> 请读取文件 `./grokbot-migration/bots/<bot_name>/BOOTSTRAP.md`，立即按照其中的 `<bot_template_setup_context>` 和 `<bot_template_setup_instructions>` 调用 `UpdateProfile`、`UpdateAvatar`、`UpdateMemory`、`UpdateSkill`、`UpdateRoutine` 完成你自己的外观、记忆、技能与自动化巡检配置。

## 第四步：同步本地侧边栏分组、语音配置与草稿缓存
在所有 Bot 创建完成后，运行本地同步脚本将客户端缓存中的侧边栏分组、语音配置与草稿绑定到新生成的 Bot UUID 上：
```bash
python3 ./grokbot-migration/sync_local_persistence.py
```
完成后向用户汇报所有已创建的 Bot 列表！
