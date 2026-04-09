# AI Word Project — 项目分析文档

> 生成日期：2026-04-07  
> 分析范围：完整项目（前端 + 后端 + 数据库）

---

## 一、项目目录结构

```
ai-word-project-github/
├── app.py                        # 主入口，Flask 路由注册与页面逻辑
├── config.py                     # 配置管理（OpenAI API Key / Model）
├── .env                          # 环境变量（API Key，不提交 git）
├── .gitignore
├── requirements.txt
├── import_dictionary.py          # 字典导入脚本（一次性工具）
├── gptwords.json                 # 原始词库数据（8000+ 单词）
├── project_memory.md             # 开发者备忘录（架构说明 & 注意事项）
├── project_analysis.md           # 本文档
│
├── data/
│   └── ai_word_system.db         # SQLite 数据库（唯一持久化数据源）
│
├── templates/
│   ├── login.html                # 登录流程页面（3 步骤）
│   ├── home.html                 # 主学习界面
│   ├── internal_admin.html       # 内部管理页面（用户创建 + 时长管理）
│   └── account_expired.html      # 账号未开通 / 已到期拦截页
│
├── static/
│   ├── css/
│   │   ├── login.css             # 登录页样式（吉祥物动画 + 响应式）
│   │   └── home.css              # 主页样式（卡片 + 布局）
│   └── js/
│       ├── home.core.js          # 状态与 DOM 初始化（必须最先加载）
│       ├── home.queue.js         # 队列管理与学习启动
│       ├── home.card.js          # 卡片交互与模式切换
│       ├── home.dictation.js     # 听写练习模块
│       ├── home.tts.js           # 文字转语音（浏览器原生）
│       ├── home.dialogue.voice.js # AI 对话 + 语音识别
│       ├── home.example_test.js  # 例句测试模块
│       └── login.js              # 登录页吉祥物眼睛跟踪动画
│
├── routes/
│   ├── ai_routes.py              # AI 相关 API 端点（Blueprint）
│   ├── internal_admin_routes.py  # 内部管理 API（用户创建 + 时长管理，仅 GeorgeJi）
│   ├── tts_routes.py             # TTS 语音合成 API
│   ├── notice_routes.py          # 系统公告内容 API
│   └── word_library_routes.py    # 词库查询 API
│
├── services/
│   ├── word_service.py           # 学习队列核心逻辑（SRS / 队列生成）
│   ├── ai_service.py             # OpenAI API 封装
│   ├── dialogue_service.py       # AI 对话 Prompt 构建
│   ├── notice_service.py         # 公告 Markdown → HTML
│   └── user_expiry_service.py    # 用户有效期状态判断与续费计算
│
├── repositories/
│   ├── word_repo.py              # 系统词库查询
│   └── user_repo.py              # 用户数据 & 学习记录查询
│
├── utils/
│   └── db.py                     # 数据库连接与路径管理
│
├── api/
│   └── internal/
│       └── create-user.py        # 内部用户创建工具脚本
│
└── images/                       # 文档截图（不参与运行）
```

---

## 二、主入口文件：`app.py`

`app.py` 是整个应用的入口，承担以下职责：

- 初始化 Flask 应用并注册 Blueprint（`ai_routes`）
- 定义所有页面路由和部分 API 路由
- 管理 Session（用户身份识别）
- 在 `/home` 路由中预先生成当天学习队列

### 主要路由一览

| 路由 | 方法 | 功能 |
|------|------|------|
| `/` | GET | 根据 Session 跳转到 `/login` 或 `/home` |
| `/login` | GET/POST | 用户名输入（第 1 步） |
| `/pool-size` | GET/POST | 设置每日学习目标词数（第 2 步） |
| `/password` | GET/POST | 设置/验证密码（第 3 步） |
| `/home` | GET | 主学习页面，预生成当天队列；未开通/已到期账号在此拦截 |
| `/api/start-study` | POST | 随机启动学习（持久化队列） |
| `/api/start-study-manual` | POST | 手动指定单词启动学习 |
| `/api/find-word` | GET | 验证单词是否存在于词库 |
| `/api/check-dictation` | POST | 核对听写拼写答案 |
| `/logout` | GET | 清除 Session，退出登录 |
| `/internal-user-create` | GET | 内部管理页面（仅 GeorgeJi，已迁移至 Blueprint） |

---

## 三、前端结构

### 3.1 HTML 模板

#### `templates/login.html`
三步登录流程，单一模板通过 Jinja2 动态渲染：
1. 输入用户名 → POST `/login`
2. 设置每日目标词数 → POST `/pool-size`
3. 设置/输入密码 → POST `/password` → 跳转 `/home`

页面特点：
- 左侧为可交互的吉祥物（Blob），眼睛跟随鼠标移动
- 密码模式下眼睛会自动闭合

#### `templates/home.html`
主学习界面，分为以下区域：
- **顶部栏**：TTS 开关、用户名、目标词数、退出
- **启动面板**：随机开始 / 手动添加单词
- **学习阶段区**（启动后显示）：进度条 + 卡片区 + 右侧词队
- **单词卡片**：可上/下/左/右滑动进入子模式
- **右侧词队侧栏**：可滚动的当天学习单词列表

### 3.2 JavaScript 模块

JS 模块有严格的加载顺序依赖，`home.core.js` 必须最先加载：

| 文件 | 职责 |
|------|------|
| `home.core.js` | 初始化全局状态 `window.homeState` 和 DOM 引用 `window.homeDom` |
| `home.queue.js` | 渲染词队、启动学习（调用 `/api/start-study`）、手动添词验证 |
| `home.card.js` | 卡片 5 种模式切换（正面/例句/对话/听写/词根信息）、翻转动画 |
| `home.dictation.js` | 听写输入、提交拼写检查、进度事件上报 |
| `home.tts.js` | 浏览器原生 TTS，自动朗读单词/例句，支持开关切换 |
| `home.dialogue.voice.js` | 调用 Web Speech API 语音识别 + 驱动 AI 对话 (`/api/dialogue/start`, `/api/dialogue/reply`) |
| `home.example_test.js` | 例句播放、用户答题、AI 评分 (`/api/example-test/check`) |

### 3.3 CSS

| 文件 | 说明 |
|------|------|
| `login.css` | 吉祥物动画、两栏布局、响应式（900px 断点） |
| `home.css` | 卡片阴影、渐变按钮、灵活网格布局 |

---

## 四、后端逻辑

### 4.1 Blueprint：`routes/ai_routes.py`

AI 相关功能单独组织为 Flask Blueprint，所有接口返回 `{"ok": bool, ...}` 格式：

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/ai/ping` | POST | AI 连通性测试 |
| `/api/dialogue/start` | POST | 启动单词 AI 对话（返回第一轮提示） |
| `/api/dialogue/reply` | POST | 继续对话（传入历史 + 当前阶段） |
| `/api/example-test/check` | POST | AI 评分用户的例句理解回答 |
| `/api/example-test/fill-examples` | POST | AI 补全缺失的例句（不足 3 条时） |
| `/api/progress/event` | POST | 记录学习进度（正确/错误次数 + SRS 更新） |

### 4.2 Blueprint：`routes/internal_admin_routes.py`

内部管理功能，所有接口仅限 GeorgeJi 登录后访问：

| 端点 | 方法 | 功能 |
|------|------|------|
| `/internal-user-create` | GET | 内部管理页面（从 `app.py` 迁移至此 Blueprint） |
| `/api/internal/create-user` | POST | 创建新用户（无密码，首次登录自设） |
| `/api/internal/user-expiry-info` | POST | 查询用户到期状态（by user_id 或 username） |
| `/api/internal/extend-user-expiry` | POST | 为用户增加时长（months: 1/2/3） |

### 4.3 Service 层

#### `services/word_service.py`（核心：队列生成）

这是整个系统最复杂的模块，负责每日学习队列的生成与持久化。

关键函数：

- `build_study_queue(user_id)` — 主入口，决定返回已有队列还是新建队列
- `calculate_queue_quota(target_word_count)` — 计算新词/复习词比例（新词 40%，复习词 60%）
- `get_due_review_words(user_id, quota)` — 获取到期复习词（`next_review_at <= now`，`level < 6`）
- `get_new_words_from_user_words(user_id, quota)` — 获取新词（`level=1, last_review_at=NULL`）
- `fill_words_from_words_table(user_id, need_count, exclude_words)` — 从系统词库补充不足的词
- `persist_queue_words_to_user_words(user_id, items)` — 批量写入用户词表（去重）

#### `services/user_expiry_service.py`

用户有效期管理的计算层：
- `get_expiry_status(expires_at)` — 返回 `{"status": "未开通"|"已到期"|"有效中", "expires_at": ...}`
- `calculate_new_expiry(expires_at, months)` — 计算续费后新到期时间：
  - `expires_at` 为空或已过期 → 从 `now` 起算
  - `expires_at` 未过期 → 从 `expires_at` 续加（不吞剩余时长）
  - 1个月=31天，2个月=62天，3个月=93天

#### `services/ai_service.py`

OpenAI API 的轻量封装，懒加载客户端，提供 `chat_text(prompt, system_prompt)` 接口。

#### `services/dialogue_service.py`

构建三阶段对话的 Prompt：
1. **guess（猜词）**：AI 给出含义提示，用户猜单词
2. **sentence（造句）**：用户用该词造句
3. **check（确认）**：AI 验证用户真正理解了单词

### 4.4 Repository 层

| 文件 | 职责 |
|------|------|
| `word_repo.py` | 按文本/ID 查询系统词库，获取词的完整信息（含例句、词根、故事等） |
| `user_repo.py` | 用户查询、密码管理、用户词记录读写、SRS 时间更新、用户有效期读写 |

`user_repo.py` 有效期相关新增函数：
- `get_user_expiry(user_id)` — 获取 `expires_at` 字段值
- `set_user_expires_at(user_id, expires_at)` — 更新 `expires_at` 字段

#### SRS 间隔配置（`user_repo.py`）

| Level | 复习间隔 |
|-------|---------|
| 1 | 1 天 |
| 2 | 3 天 |
| 3 | 7 天 |
| 4 | 15 天 |
| 5 | 30 天 |

---

## 五、主要功能模块

| 模块 | 状态 | 说明 |
|------|------|------|
| 三步登录流程 | 完整 | 用户名 → 目标词数 → 密码 |
| 每日队列生成 | 完整 | SRS 复习 + 新词补充 + 锁定逻辑 |
| 单词卡片浏览 | 完整 | 翻面、例句、词根信息展示 |
| 听写练习 | 完整 | 拼写检查 + 进度反馈 |
| TTS 朗读 | 完整 | 浏览器原生，支持自动重复 |
| AI 对话练习 | 后端完整，前端基础可用 | 三阶段对话（猜词→造句→确认） |
| 例句测试 | 完整 | AI 评分 + 语音输入答题 |
| 手动添词 | 完整 | 词库验证 + 追加到当日队列 |
| 进度事件上报 | 部分完整 | 听写记录，完整 SRS 更新待完善 |
| 内容编辑保存 | 未完成 | 编辑按钮存在但不写回数据库 |

---

## 六、单词学习流程详解

```
用户访问 /home
    │
    ▼
app.py: home()
    │  调用 word_service.build_study_queue(user_id)
    │  预生成今日队列（但不锁定）
    ▼
渲染 home.html（含队列数据注入到 JS 变量）
    │
    ▼
用户点击「随机开始」或「手工添加」
    │
    ├─「随机开始」→ POST /api/start-study
    │       word_service.build_study_queue()
    │       word_service.persist_queue_words_to_user_words()
    │       返回队列项 + queue_locked 状态
    │
    └─「手工添加」→ 验证词 → POST /api/start-study-manual
            （手动词优先，不足部分自动补充）
    │
    ▼
前端 home.queue.js: revealStudyUi() + renderStudyItems()
    显示右侧词队 + 激活第一个单词卡片
    │
    ▼
用户浏览单词卡片（可翻面查看释义）
    │
    ├── 向上滑 → 例句模式（example_test）
    │       播放例句 TTS → 用户回答 → POST /api/example-test/check → AI 评分
    │
    ├── 向左滑 → AI 对话模式（dialogue）
    │       POST /api/dialogue/start → 进入 guess 阶段
    │       用户语音/文字回答 → POST /api/dialogue/reply
    │       阶段推进：guess → sentence → check → done
    │
    ├── 向右滑 → 听写模式（dictation）
    │       TTS 朗读单词 → 用户输入拼写 → POST /api/check-dictation
    │       正确：进度 +1（0~3 步）→ POST /api/progress/event
    │       错误：提示反馈，允许重试
    │
    └── 向下滑 → 词汇信息模式（词根 / 词缀 / 词史 / 变形 / 记忆法 / 故事）
    │
    ▼
用户点击下一个单词（右侧词队或进度导航）
    重复上述卡片学习循环
    │
    ▼
当日队列所有词学习完毕
    队列状态锁定（queue_locked = true）
    次日访问 /home 将生成新队列
```

### 核心设计特点

1. **渐进式记忆（SRS）**：答对次数越多，level 越高，复习间隔越长（最长 30 天）
2. **队列预生成**：进入 `/home` 时即生成当日队列，点击开始后才写入数据库
3. **新词/复习比例**：固定 40% 新词 + 60% 复习词，保证新旧平衡
4. **每日锁定机制**：达到目标词数后队列锁定，当日不再追加（手动添词亦受限）
5. **多模态练习**：同一单词可通过听写、对话、例句测试多角度强化记忆
6. **语音全程支持**：TTS 自动朗读 + Web Speech API 语音输入，减少打字负担

---

## 七、数据库核心表结构

| 表名 | 行数（约） | 说明 |
|------|-----------|------|
| `users` | 少量 | 用户账号与权限，含 `expires_at` 有效期字段（2026-04-09 新增） |
| `user_study_settings` | 少量 | 用户每日目标词数 |
| `words` | ~8,027 | 系统词库（含释义、例句、词根等） |
| `word_examples` | ~25,646 | 系统例句 |
| `word_stories` | ~8,581 | 系统短文/记忆故事 |
| `user_words` | 动态增长 | 每个用户的学习记录（SRS 状态） |
| `user_word_examples` | 动态增长 | 用户私有例句副本 |
| `user_word_stories` | 动态增长 | 用户私有故事副本 |

---

## 八、技术栈总览

| 层次 | 技术 |
|------|------|
| 后端框架 | Python + Flask |
| 数据库 | SQLite（单文件，`data/ai_word_system.db`） |
| AI 接口 | OpenAI Responses API（`gpt-5.4-mini`） |
| 前端 | 原生 HTML/CSS/JavaScript（无框架） |
| 语音合成 | Web Speech API（浏览器原生） |
| 语音识别 | Web Speech API（浏览器原生） |
| 会话管理 | Flask Session（服务端 Cookie） |
| 部署方式 | 本地开发服务器（Flask dev server） |
