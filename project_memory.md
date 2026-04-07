# 1. 项目概况

- 这是一个基于 Flask + SQLite 的英语单词学习项目，核心目标是为用户生成“当天学习队列”，并在前端以卡片式界面完成看词、看义、例句、默写、朗读等学习流程。
- 后端主入口是 `app.py`，学习队列和用户词记录逻辑主要集中在 `services/word_service.py`，AI 调用只在 `services/ai_service.py` 中做了极薄封装。
- 当前项目已经从“静态词库展示”扩展为“带登录、用户设置、学习队列、手工加词、TTS、默写”的小型 Web 应用。
- 数据源以本地 SQLite 为主，`data/ai_word_system.db` 是运行核心依赖；`gptwords.json` 和 `import_dictionary.py` 主要服务于词库导入/解析。
- 当前数据库中词库规模不是玩具数据：`words` 约 8027 条，`word_examples` 约 25646 条，`word_stories` 约 8581 条。

# 2. 项目目录结构

- `app.py`
  Flask 应用主入口。当前已开始做第一轮拆分：保留登录、首页、学习主流程，以及蓝图注册；数据库连接、repo 查询、AI 对话规则、AI 路由已陆续迁出。
- `services/`
  业务服务层。
  `word_service.py` 负责学习队列、用户词持久化、例句/故事复制。
  `ai_service.py` 负责 OpenAI Responses API 调用。
  `dialogue_service.py` 负责 AI 单词对话规则、上下文整理、prompt 生成。
- `templates/`
  Jinja 模板。
  `login.html` 是三步登录流程页面。
  `home.html` 是学习主页面。
- `static/js/`
  前端主逻辑，按功能拆分，而不是按页面生命周期拆分。
- `static/css/`
  登录页和首页样式。
- `repositories/`
  数据查询层。
  `word_repo.py` 负责单词查询与详情读取。
  `user_repo.py` 负责用户、密码、学习设置查询与保存。
- `routes/`
  路由拆分层。
  `ai_routes.py` 负责 `/api/ai/ping`、`/api/dialogue/start`、`/api/dialogue/reply`。
- `utils/`
  基础工具层。
  `db.py` 负责 `DB_PATH` 与 `get_conn()`。
- `data/ai_word_system.db`
  运行时数据库，后续改后端前应优先确认这里的真实表结构。
- `gptwords.json`
  词库原始文本数据来源之一。
- `import_dictionary.py`
  解析 `gptwords.json` 并导入词库的脚本。
- `app_backup_2026-03-30-1.py`
  备份文件，不是当前入口。
- `index.html`、`README.md`、`images/`
  偏展示/资料用途，不参与 Flask 主流程。

# 3. 关键文件清单

- `app.py`
  当前仍是主入口，但已不再承担全部底层逻辑。现在主要看登录流程、首页渲染、学习接口、蓝图注册。
- `services/word_service.py`
  这是最关键的业务文件；凡是“为什么今天抽到这些词”“为什么开始学习后锁定”“为什么例句会出现在用户词里”，都在这里。
- `templates/home.html`
  首页 DOM 非常重，很多 JS 都依赖这里的固定 `id` 和内联数据结构。
- `static/js/home.core.js`
  统一维护 `window.homeDom` 和 `window.homeState`，其他首页脚本都依赖它先加载。
- `static/js/home.queue.js`
  负责开始学习、手工加词、渲染右侧词队列、切换当前单词。
- `static/js/home.card.js`
  负责主卡片与四向功能卡的交互切换，是首页交互复杂度最高的文件。
- `static/js/home.dictation.js`
  负责默写提交流程，调用 `/api/check-dictation`。
- `static/js/home.tts.js`
  负责浏览器朗读和自动重复播放逻辑。
- `services/ai_service.py`
  目前只有 `chat_text()` 一个薄封装，AI 功能仍很轻。
- `services/dialogue_service.py`
  AI 单词对话规则中心。以后改三层对话规则、prompt、上下文拼接，优先看这里。
- `repositories/word_repo.py`
  单词查询入口。以后凡是“按文字找词 / 按 ID 找词 / 取单词详情”，优先看这里。
- `repositories/user_repo.py`
  用户与设置查询入口。以后改登录取用户、密码是否已设置、学习数量设置，优先看这里。
- `routes/ai_routes.py`
  AI 路由入口。AI ping、开始对话、继续对话都已集中到这里。
- `utils/db.py`
  数据库连接基底。以后凡是 repo 查 SQLite，都通过这里的 `get_conn()`。

# 4. 入口与调用流程

- Web 入口流程：
  `/` -> 根据 session 跳转到 `/login` 或 `/home`。
- 登录流程是三步式：
  `/login` 输入用户名 -> `/pool-size` 设置学习数量 -> `/password` 首次设密码或输入密码 -> `/home`。
- 首页渲染流程：
  `/home` 会直接调用 `build_study_queue(user_id)` 预生成当前展示队列，并把 `items`、`queue_locked`、`target_word_count` 注入 `home.html`。
- 随机开始学习：
  前端 `home.queue.js:startRandomStudy()` -> POST `/api/start-study` -> 后端 `build_study_queue()` -> `persist_queue_words_to_user_words()` -> 返回实际学习项 -> 前端 `revealStudyUi()` + `renderStudyItems()`。
- 手工开始学习：
  前端先用 `/api/find-word` 校验单词存在，再用 `/api/start-study-manual` 提交手工单词数组；后端会不足额时用普通队列补齐到 `target_word_count`。
- 卡片交互流程：
  `home.queue.js` 决定当前选中单词；
  `home.card.js` 根据方向或按钮切换到 `examples / dialogue / dictation / info` 等模式；
  `home.tts.js` 根据当前模式决定朗读单词还是例句；
  `home.dictation.js` 在默写模式中提交答案。
- AI 流程（已完成第一轮后端拆分）：
  `/api/ai/ping`、`/api/dialogue/start`、`/api/dialogue/reply`
  已从 `app.py` 迁入 `routes/ai_routes.py`。
  其中：
  - `ai_routes.py` 负责收请求、校验参数、返回 JSON
  - `dialogue_service.py` 负责单词对话规则与 prompt
  - `ai_service.py` 负责真正调用 OpenAI Responses API
  当前状态是：后端 AI 对话接口已具备，但首页前端对话 UI 仍未正式接入。

# 5. 核心模块说明

- 后端登录与会话
  `app.py` 使用 Flask session 保存 `pending_user_id`、`pending_username`、`user_id`、`username`。
  用户不开放注册，必须先在 `users` 表里手工建账号。
- 学习队列模块
  `build_study_queue()` 是队列总入口。
  逻辑顺序是：先看今天是否已经开始过学习；若已开始且数量足够，直接返回今天已锁定队列；否则重新按“复习词 + 新词 + 用户词补位 + 总词库临时补位”组队。
- 用户词持久化模块
  `persist_queue_words_to_user_words()` 会把本次开始学习的词写入 `user_words`；如果词原本已在 `user_words`，则跳过。
  新插入用户词时会复制系统例句和故事到 `user_word_examples`、`user_word_stories`。
- 前端状态模块
  `home.core.js` 中的 `window.homeState` 是首页所有脚本共享状态源，包含学习状态、当前模式、TTS、例句索引、故事索引、默写状态、进度状态等。
- 卡片模式模块
  `home.card.js` 把主卡周围四个方向映射成：
  上 `examples`
  左 `dialogue`
  右 `dictation`
  下 `info`
  其中 `dialogue` 仍是占位文本，未真正接 AI。
- 默写模块
  当前只做“答案对错判断 + 前端进度 +1”，还没有把正确率、错误次数、复习等级写回数据库。
- TTS 模块
  完全依赖浏览器 `speechSynthesis`，不是后端音频服务。
  普通模式每 2 秒重复朗读一次；例句模式会在播放结束后再排下一次。
- Repo 查询模块
  已开始把 `app.py` 中的底层查询拆到 `repositories/`：
  `word_repo.py` 负责单词查询；
  `user_repo.py` 负责用户与学习设置查询。
- AI 对话规则模块
  `dialogue_service.py` 已独立出来，负责：
  - 单词上下文整理
  - 三层对话规则 prompt
  - 开始对话 / 继续对话 prompt 生成
- AI 路由模块
  `routes/ai_routes.py` 已独立出来，负责：
  - `/api/ai/ping`
  - `/api/dialogue/start`
  - `/api/dialogue/reply`

# 6. 重要函数索引

- `app.py`
  `login()`
  用户名输入入口。
  `pool_size()`
  设置或更新 `user_study_settings.target_word_count`。
  `password_step()`
  首次设密码或校验密码。
  `home()`
  渲染首页，并预取学习队列。
  `api_start_study()`
  随机开始学习并持久化本次队列。
  `api_find_word()`
  校验手工输入单词是否存在于 `words`。
  `api_start_study_manual()`
  手工词启动学习，不足额时自动补齐。
  `api_check_dictation()`
  仅比较输入和正确单词，未更新学习统计。

- `services/word_service.py`
  `get_target_word_count(user_id)`
  读取学习数，默认 20。
  `calculate_queue_quota(target_word_count)`
  小词池复习 60% / 新词 40%；大词池复习 70% / 新词 30%。
  `get_due_review_words(user_id, review_quota)`
  抽取到期复习词，按 `wrong_count DESC` 等规则排序。
  `get_new_words_from_user_words(user_id, new_quota)`
  从 `user_words` 中抽“从未复习过的新词”，当前按 `RANDOM()`。
  `get_additional_user_words(user_id, need_count, exclude_ids)`
  配额不足时继续从用户词里补。
  `fill_words_from_words_table(user_id, need_count, exclude_words)`
  仍不足时从 `words` 临时补词，但此阶段只返回，不立即写 `user_words`。
  `persist_word_to_user_words(user_id, item)`
  新建用户词记录，并复制系统例句/故事。
  `persist_queue_words_to_user_words(user_id, items)`
  批量入库队列词。
  `get_today_started_queue_words(user_id, target_word_count)`
  读取当天已开始学习的锁定队列。
  `get_started_study_queue(user_id)`
  若今天已凑满目标学习数，则直接返回锁定队列。
  `build_study_queue(user_id)`
  全项目最重要的队列组装函数。

- `services/ai_service.py`
  `get_openai_client()`
  延迟初始化 OpenAI 客户端。
  `chat_text(prompt, system_prompt=None)`
  用 Responses API 发送系统消息和用户消息。

- `services/dialogue_service.py`
  `clean_dialogue_text(value)`
  清洗对话输入与上下文字段。
  `build_word_dialogue_context(word_row, fallback_word="")`
  把单词详情整理成对话上下文。
  `build_dialogue_system_prompt()`
  生成三层单词对话的系统提示词。
  `build_dialogue_start_prompt(context)`
  生成第一轮“猜词”提示。
  `build_dialogue_reply_prompt(context, stage, user_message, history)`
  生成继续对话提示。

- `repositories/word_repo.py`
  `get_word_by_text(word)`
  按单词文本查词。
  `get_word_by_id(word_id)`
  按 ID 查基础单词。
  `get_word_detail_by_id(word_id)`
  按 ID 查单词完整对话所需字段。

- `repositories/user_repo.py`
  `get_user_by_username(username)`
  按用户名查用户。
  `get_user_by_id(user_id)`
  按 ID 查用户。
  `get_user_setting(user_id)`
  读取学习数量设置。
  `save_user_setting(user_id, target_word_count)`
  保存学习数量设置。
  `save_user_password(user_id, password_hash)`
  保存密码哈希。
  `is_password_set(user_row)`
  判断密码是否已设置。

- `routes/ai_routes.py`
  `api_ai_ping()`
  AI 连通性测试接口。
  `api_dialogue_start()`
  开始单词对话接口。
  `api_dialogue_reply()`
  继续单词对话接口。

- `import_dictionary.py`
  `parse_loose_chunk()`
  宽松解析单条词库记录。
  `parse_sections()`
  从长文本里拆出词义、例句、词根、词缀、历史、变形、记忆、小故事。
  `parse_examples()`、`parse_story()`
  进一步拆解例句/故事内容。
  【不确定】由于本次未通读脚本尾部写库部分，若要改导入流程，建议再完整读一遍。

# 7. 数据与配置

- 配置文件
  `config.py` 会从根目录 `.env` 读取：
  `OPENAI_API_KEY`
  `OPENAI_MODEL`，默认是 `gpt-5.4-mini`
- 数据库文件
  `data/ai_word_system.db`
- 核心数据表
  `users`
  用户账号表。核心字段可按“登录 / 权限 / 状态”理解：`username`、`password_hash`、`display_name`、`role`、`is_active`、`created_at`、`updated_at`、`last_login_at`、`note`。
  `user_study_settings`
  每个用户一条学习设置。核心字段就是 `user_id`、`target_word_count`、`created_at`；其中 `target_word_count` 决定每天启动学习时要凑多少个词。
  `words`
  系统总词库主表。核心字段可按“原始内容 + 拆解结果 + 解析状态”理解：`word`、`content_raw`、`meaning_raw`、`examples_raw`、`word_root_raw`、`affix_raw`、`history_raw`、`forms_raw`、`memory_tip_raw`、`story_raw`、`parse_status`、`parse_note`、`source_name`、`sort_order`、`created_at`、`updated_at`。
  `word_examples`
  系统例句表。按当前表结构理解，核心字段是 `word_id`、`user_id`、`example_en`、`example_zh`、`source_type`。目前备忘里的旧设计是“`user_id` 可空，系统和用户内容同表共存”，后续若真实库已改为用户副本表模式，应以真实 schema 为准。
  `word_stories`
  系统故事表。按当前备忘设计理解，核心字段是 `word_id`、`user_id`、`story_en`、`story_zh`、`source_type`；逻辑与例句表一致，也是“系统内容 / 用户内容”来源区分位。
  `user_words`
  用户学习词主表，是当前最关键的用户侧业务表。可按 4 类字段理解：1. 归属与来源：`user_id`、`word_id`、`word`、`source_type`；2. 学习状态：`level`、`correct_count`、`wrong_count`、`next_review_at`、`last_review_at`；3. 用户自定义内容：`meaning_user`、`word_root_user`、`affix_user`、`history_user`、`forms_user`、`memory_tip_user`；4. 记录与辅助：`created_at`、`note`、`queue_date`。
  `user_word_examples`
  用户侧例句表。当前项目记忆里可先按“用户副本 / 用户编辑承接表”理解，核心字段至少应关注 `user_id`、`word_id`、`example_en`、`example_zh`、`source_type`、`sort_order`。
  `user_word_stories`
  用户侧故事表。当前项目记忆里可先按“用户副本 / 用户编辑承接表”理解，核心字段至少应关注 `user_id`、`word_id`、`story_en`、`story_zh`、`source_type`、`sort_order`。
- 关键字段关系
  `user_words.queue_date`
  用来判断“今天是否已经开始学习”，这是当前锁队列的关键字段。
  `user_words.level / correct_count / wrong_count / next_review_at / last_review_at`
  设计上用于复习调度，但目前只有队列构建部分真正使用了这些字段，答题后回写尚未完成。
  `user_words` 上有“同一用户同一单词不重复”的唯一性约束
  以后改入库逻辑时，要默认这个表不是历史流水表，而是用户当前学习词主表。
- 当前真实数据量
  `users=1`
  `user_study_settings=1`
  `words=8027`
  `user_words=5`
  `word_examples=25646`
  `word_stories=8581`
  `user_word_examples=12`
  `user_word_stories=5`

# 8. 开发记忆

- 首页 JS 有明确加载顺序依赖：
  `home.core.js` 必须先于其他 `home.*.js`。
  其他脚本默认直接读写 `window.homeDom` 和 `window.homeState`。
- `home.html` 里很多 UI 是写死内联样式和固定 `id` 的，改 DOM 时要同步检查所有 `document.getElementById(...)` 和 `dataset.*` 读取点。
- 首页词队列按钮并不直接从后端再拉详细数据，而是把 `meaning / word_root / affix / history / forms / memory_tip / examples / stories` 都塞到按钮 `dataset` 里缓存。
- `build_study_queue()` 既被首页渲染调用，也被多个 API 调用；改它容易同时影响：
  首页首次打开
  随机开始学习
  手工加词校验
  手工开始学习补位
- “今天已开始学习”并不是单独的学习会话表，而是通过 `user_words.queue_date = 今天` 且数量达到 `target_word_count` 来判断。
- `api_start_study()` 在 `queue_locked=True` 时仍会重新调用一次 `build_study_queue()` 返回锁定后的 items。
- `dialogue` 功能目前已完成“后端第一轮拆分”，但前端仍未真正接入：
  - `routes/ai_routes.py` 已提供 `/api/dialogue/start`、`/api/dialogue/reply`
  - `services/dialogue_service.py` 已负责三层对话规则与 prompt
  - 前端仍然只是占位状态，`home.dialogue.voice.js` 还没有接正式请求流程
- 当前结构拆分已完成第一轮：
  - `utils/db.py`：数据库连接
  - `repositories/word_repo.py`：单词查询
  - `repositories/user_repo.py`：用户查询
  - `services/dialogue_service.py`：AI 对话规则
  - `routes/ai_routes.py`：AI 路由
  后续继续改结构时，优先沿着这条分层继续拆，不要再把新逻辑重新堆回 `app.py`。
- “修改内容”按钮目前只是前端可编辑占位，点击“提交”时只弹窗提示，未保存到数据库。
- `api_check_dictation()` 里明确留了 TODO，说明学习统计/升级机制还没接完。
- `app.py` 中 `app.secret_key` 还是硬编码占位值，部署前必须处理。
- 根目录有 `app_backup_2026-03-30-1.py`，改主流程时不要误改到备份文件。

# 9. AI 编码注意事项

- 优先先看 `services/word_service.py` 再改学习逻辑；不要只改前端表现，否则很容易出现“前端显示对了，后端队列逻辑还是旧的”。
- 改首页任何功能前，先确认它属于哪层：
  纯状态/UI 切换，多半在 `home.card.js` / `home.queue.js`
  队列与数据来源，多半在 `word_service.py`
  API 进出参，多半在 `app.py`
- 如果要给首页新增模式或按钮，必须同时检查：
  `templates/home.html`
  `static/js/home.core.js`
  `static/js/home.card.js`
  `static/js/home.queue.js`
  否则很容易出现 DOM 缺失或状态字段未初始化。
- 如果要把“修改内容”做成可保存，后端至少要补：
  对 `user_words.meaning_user / word_root_user / affix_user / history_user / forms_user / memory_tip_user` 的更新接口；
  如需保存例句/故事，还要补 `user_word_examples`、`user_word_stories` 的写逻辑。
- 如果要完善记忆曲线，当前最自然的接入点是：
  `api_check_dictation()` 判定结果后回写 `user_words.correct_count / wrong_count / level / next_review_at / last_review_at`。
- 如果要接真正的 AI 对话练习，现有最接近入口是：
  前端 `dialogue` 模式
  后端 `/api/ai/ping`
  但目前缺少上下文管理、语音识别、对话历史和 UI。
- 改数据库相关逻辑前，先以真实 schema 为准，不要只凭 Python 查询语句猜字段。
- 当前有一些“第一版”“后面再接”“TODO”式实现，说明项目处于快速迭代阶段；改动时要优先保留已有行为，不要一次性重构太多链路。
- 关于密码首次设置逻辑：
  代码依赖 `password_hash` 为空字符串时视为未设置。
  但 schema 中 `password_hash TEXT NOT NULL`，因此这里应理解为“不能为空字段，但允许空字符串”，不要误以为支持 `NULL`。


# 10. 当前开发目标

## AI 对话功能（当前重点）

### 1. 按钮与交互设计

- 对话卡片中“修改内容”按钮在该模式下没有实际意义，需要：
  - 隐藏 或
  - 设为不可点击（禁用/变灰）

- 新增独立按钮：`开始对话`
  - 不复用“修改内容”按钮，避免语义混乱
  - 建议与“返回单词”“修改内容”同一位置区域

- 点击“开始对话”后进入对话模式，页面需要支持：
  - AI 对话显示区域
  - 用户输入框
  - 发送按钮
  - （可选）结束对话按钮

---

### 2. AI 对话规则（第一版）

当前设计为三层结构（固定流程）：

#### 第一层：词义 → 猜单词

- AI 使用简单英文（必要时可辅以中文）解释单词含义
- 引导用户说出目标单词
- 示例方向：
  - “It means using something up. What word is it?”
  - “这个词表示‘消耗’，是什么词？”

目标：
👉 让用户从“理解意思”转为“说出单词”

---

#### 第二层：用词造句

- AI 要求用户使用目标单词造一个简单句子
- 要求：
  - 必须包含该单词
  - 句子可以很简单
  - 不强制语法完全正确

目标：
👉 从“识别单词”进入“主动输出”

---

#### 第三层：理解验证（轻度追问）

- AI 提一个非常简单的问题，确认用户是否真正理解该词
- 示例方向：
  - “Is consumption about using more or using less?”
  - “Can we use this word for water?”

目标：
👉 验证用户是否真正理解，而不是机械复述

---

### 3. 通过与容错规则

通过标准：

- 用户成功说出目标单词
- 用户造句中包含目标单词
- 用户对第三层问题给出大致合理回答

容错策略：

- 允许语法不完美
- 允许句子较短
- 允许轻微拼写或表达错误

但不允许：

- 完全不包含目标单词
- 完全跑题
- 用极度敷衍回答（如只回复 yes/no 完成造句要求）

---

### 4. 对话风格约束（提示词方向）

AI 需要遵循：

- 角色：英语单词学习引导老师
- 提问必须简单
- 尽量使用高频基础词汇（接近小学/初中水平）
- 每次只问一个问题
- 不进行长篇解释

---

### 5. 当前实现策略（技术路线）

当前阶段优先采用：

👉 文本对话（非语音）

原因：

- 更容易调试
- 更容易控制对话结构
- 更容易验证规则是否正确

后续再考虑：

- 浏览器语音朗读（TTS）
- 语音输入
- 实时语音对话

---

### 6. 当前状态结论

- 后端 AI 基础通道已完成第一轮重构：
  - `ai_service.py`：OpenAI 调用
  - `dialogue_service.py`：对话规则
  - `ai_routes.py`：AI 路由入口
- 但“学习页对话模式”前端仍未真正接入 AI
- 当前任务是：

## 例句听力测试功能（新增补充）

### 1. 本轮新增目标

- 新增一个独立于 `dialogue` 的“例句听力测试”模式，核心不是猜词对话，而是：
  - 系统先朗读例句
  - 用户再用中文或英文回答这句话的大意
  - AI 判断语义是否大致正确，是否抓住测试单词的核心语义

- 当前设计目标已明确为：
  - **不是三句连读后统一作答**
  - 而是：**每次只朗读 1 句 → 用户回答 → 判题 → 再进入下一句**
  - 一轮最多测试 3 句；若当前单词现有例句不足 3 句，则按实际句数进行

- 当前阶段先不做：
  - 正确/错误累计
  - 学习进度条累加
  - 测试结果写回长期学习统计

---

### 2. 前端新增或改动的文件

#### `templates/home.html`

新增了例句测试相关 UI 骨架：

- 工具栏按钮：
  - `mode-example-test-btn`：开始例句测试
  - `mode-example-test-end-btn`：结束测试

- 测试面板：
  - `example-test-panel`
  - `example-test-history`
  - `example-test-stage-hint`
  - `example-test-input`
  - `example-test-mic-btn`
  - `example-test-submit-btn`
  - `example-test-end-btn`
  - `example-test-feedback`

- 另外补上了页面底部 script 引用：
  - `/static/js/home.example_test.js`

说明：之前“例句测试脚本没生效”的根因之一，就是 `home.example_test.js` 没有被 `home.html` 正式引入。

---

#### `static/js/home.card.js`

例句测试模式切换入口目前是在这里接上的。

本轮新增/补上的主要内容：

- 新增 `getExampleTestElements()`
  - 统一获取例句测试按钮、面板、输入框、反馈区等 DOM

- 新增 `setExampleTestButtonsVisible(showStart, showEnd)`
  - 控制：
    - 在 `examples` 模式时显示“例句测试”按钮
    - 在 `example_test` 模式时显示“结束测试”按钮

- 在 `switchCardMode(mode)` 中加入：
  - `isExampleTestMode = normalizedMode === 'example_test'`
  - `exampleTestPanel.style.display = ...`
  - 当进入 `example_test` 时隐藏普通编辑区、提示区、普通按钮区
  - 顶部标题/主卡逻辑后续若有文案不对，优先继续查这里

- 进入 `example_test` 模式时：
  - 停掉原有自动朗读
- 退出 `example_test` 回到普通模式时：
  - 恢复原有朗读

说明：例句测试按钮是否显示、测试模式面板是否出现、标题/主卡模式文案是否正确，都优先看 `home.card.js`。

---

#### `static/js/home.tts.js`

这里不是例句测试主逻辑文件，但已经补上“模式排除控制”。

本轮已让以下逻辑在 `example_test` 模式下不再继续触发：

- `speakCurrentWord(...)`
- `startAutoSpeak()`
- `resumeHomeTtsLoop()`

也就是说：

- 进入 `example_test` 后，原来的单词/例句循环朗读应该停止
- 测试模式自己的朗读逻辑，不再由 `home.tts.js` 主导，而交给 `home.example_test.js`

---

#### `static/js/home.example_test.js`

这是本轮“例句听力测试”真正的主文件。

当前职责已经包括：

- 读取当前单词和当前例句
- 进入测试时重置旧朗读/旧识别状态
- 系统朗读测试例句
- 启动麦克风识别
- 允许手动点击麦克风按钮开始/停止识别
- 把用户回答提交给后端听力判题接口
- 显示 AI 返回的测试反馈

本轮先后做过几轮调整，当前应以“单句推进式测试”为准：

##### 主要状态字段

- `state.exampleTestState`
  - `recognition`
  - `isListening`
  - `running`
  - `loading`
  - `history`
  - `testWord`
  - `testExamples`
  - `speechEnabled`
  - `isSpeaking`
  - `pendingMicStart`
  - `recognitionStartTimer`
  - `speechStartTimer`
  - `activeUtterance`
  - `selectedExamples`
  - `currentExampleIndex`
  - `currentExampleText`

##### 主要函数

- `getExampleTestElements()`
  - 统一取测试模式相关 DOM

- `cleanText(value)`
  - 清洗文本

- `escapeHtml(value)`
  - 渲染测试历史消息时转义

- `setExampleTestFeedback(text, isError)`
  - 底部反馈区显示

- `setExampleTestStageHint(text)`
  - 测试流程提示文案

- `renderExampleTestHistory()`
  - 渲染测试历史消息

- `setExampleTestLoading(loading)`
  - 提交测试按钮 loading 状态

- `postJson(url, payload)`
  - 前端请求封装，用于提交 `/api/example-test/check`

- `speakText(text, onEnd)`
  - 当前测试例句朗读核心函数
  - 这是本轮排查的重点问题区之一

- `getCurrentExamplesFromQueue()`
  - 从当前活动队列按钮的 `dataset.examples` 中取例句

- `pickTestExamples(examples, limit)`
  - 从当前例句中随机抽最多 3 句作为本轮测试池

- `pickRandomExample(examples)`
  - 目前保留为辅助函数；单句推进模式下不是主流程核心

- `initVoiceRecognition()`
  - 初始化浏览器语音识别

- `startVoiceInput(options)`
  - 开始语音识别
  - 手动点击麦克风时可用 `immediate` 方式直接启动，尽量保留用户手势上下文

- `stopVoiceInput()`
  - 停止语音识别

- `resetExampleTestState()`
  - 重置本轮测试状态

- `speakCurrentExample()`
  - **当前主流程关键函数**
  - 每次只朗读当前这一句
  - 读完后等待用户回答

- `moveToNextExample()`
  - **当前主流程关键函数**
  - 当前句通过后，进入下一句
  - 所有句子完成后，结束本轮测试

- `startExampleTest()`
  - 进入例句测试主入口
  - 当前流程应是：
    - 停掉旧朗读/旧识别
    - 重置状态
    - 随机抽最多 3 句
    - 先朗读第 1 句

- `submitExampleTest()`
  - 当前只针对“当前这一句”提交判题
  - 后端请求时：`examples` 只传当前句
  - 若 `passed=true`，才进入下一句
  - 若 `passed=false`，停留在当前句继续答

- `endExampleTest()`
  - 结束测试并重置状态

- `bindExampleTestEvents()`
  - 绑定开始测试、结束测试、麦克风、提交等事件

说明：

- 例句测试前端主流程已经不再是“3句连读再统一回答”
- 现在的正式目标是：
  - **逐句朗读**
  - **逐句作答**
  - **逐句判题**

---

### 3. 后端已接但未另开新文件的部分

本轮没有新开独立的 `example_test_service.py` 或新路由文件，当前仍复用现有后端结构。

#### `routes/ai_routes.py`

已新增接口：

- `/api/example-test/check`

作用：

- 接收：
  - `word`
  - `examples`
  - `user_answer`
- 调用 AI 判断：
  - 用户回答是否大致表达了例句意思
  - 是否抓住目标单词核心语义
  - 是否允许中文 / 英文 / 混合表达的模糊通过

返回结果中包含：

- `passed`
- `score`
- `feedback`
- `keyword_hit`
- `meaning_ok`
- `note`

说明：

- 当前并没有为“例句测试”单独再拆出新 route 文件
- 仍放在 `ai_routes.py` 中统一处理 AI 类接口

---

#### `services/ai_service.py`

本轮没有改接口封装方式，仍通过现有 `chat_text()` 调用 AI。

说明：

- 后端 AI 通道未另外切换新系统
- 例句测试仍复用现有 AI 调用封装

---

### 4. 当前判题规则（例句听力测试）

后端 prompt 当前目标是：

- 用户先听英文例句
- 用户可以用：
  - 中文回答
  - 英文回答
  - 中英混合回答
- AI 判断标准：
  - 不要求逐字翻译
  - 只要求大意接近
  - 必须体现目标单词核心语义
  - 允许口语化
  - 允许中文发音不准或识别有轻微误差造成的模糊表达

当前判题方向是“语义大致正确即可”，而不是翻译考试。

---

### 5. 当前已确认的问题与注意事项

- 例句测试脚本曾出现“文件已写但页面未加载”的问题，根因是：
  - `home.example_test.js` 没有被 `home.html` 引入

- 例句测试按钮曾出现“DOM 里有，但页面上不显示”的问题，根因在：
  - `home.card.js` 中显隐控制未接完整

- 例句测试的朗读与麦克风逻辑曾出现多次冲突，问题重点集中在：
  - `home.example_test.js`
  - 特别是：
    - `speakText()`
    - `startExampleTest()`
    - `startVoiceInput()`
    - `bindExampleTestEvents()`

- 当前正式开发结论：
  - **不要再走“3句连读后统一回答”路线**
  - **应固定为“逐句听力测试”路线**

---

### 6. 当前阶段性结论

本轮“例句听力测试”已经形成一条独立于 `dialogue` 的功能线，且核心结构已明确：

- 入口：`examples` 卡片中的 `例句测试`
- 模式：`example_test`
- 主前端文件：`home.example_test.js`
- 后端接口：`/api/example-test/check`
- AI 判断方式：语义模糊判断，不要求逐字翻译

当前未完成/仍待继续联调的重点主要有：

1. 浏览器 TTS 是否稳定发声
2. 麦克风权限与启动时机是否稳定
3. 单句通过后进入下一句是否顺滑
4. 例句不足 3 句时是否要由 AI 自动补句（当前暂未接）
5. 正确/错误累计与进度条后续再单独实现

## 例句听力测试补充（AI补句逻辑已接入）

### 一、本次新增核心改动

本轮在“例句听力测试”中新增了一个关键能力：

👉 **例句不足 3 句时，由 AI 自动补句（前端触发 + 后端辅助）**

设计原则：

- 不修改原有抽词 / 抽句主逻辑
- 不修改数据库结构
- 不改变前端抽句规则
- 只在“开始测试前”做一次补句准备

---

### 二、整体流程（最新）

当前例句测试完整流程为：

1. 用户点击「例句测试」
2. 前端进入 `startExampleTest()`
3. 执行准备逻辑：

   - 读取当前单词已有例句
   - 判断数量是否 < 3

4. 如果不足 3 句：

   - 调用接口：

     `/api/example-test/fill-examples`

   - 由 AI 补足到至少 3 句

5. 前端拿到“补齐后的例句数组”

6. 再执行原有逻辑：

   - `pickTestExamples()` 抽最多 3 句
   - 进入逐句测试流程：

     👉 听一句 → 答一句 → 判题 → 下一句

---

### 三、前端改动（home.example_test.js）

新增函数：

#### `prepareExamplesForTest(word, examples)`

作用：

- 检查例句数量
- 若 ≥3：直接返回
- 若 <3：
  - 调用 `/api/example-test/fill-examples`
  - 获取 AI 补句结果
- 若补句失败：
  - 自动 fallback 到原例句（不阻塞测试）

---

修改函数：

#### `startExampleTest()`

新增流程：

- 在抽句之前先执行：

```js
prepareExamplesForTest(...)
## 进度条与 level 规则（新增补充）

### 1. 当前最终规则（最新确认）

当前项目的进度条采用：

- **前端临时累计进度**
- **后端负责记录 correct / wrong / level / review 时间**

也就是说：

- 进度条不是长期持久化学习过程
- 用户如果中途退出页面，当天这轮前端进度可视为作废
- 只有在前端事件真实发生时，后端才即时写入：
  - `correct_count + 1`
  - `wrong_count + 1`
  - `level + 1`（满足条件时）

---

### 2. 进度条总规则

当前全局进度条总满值已经改为：

- `MAX_PROGRESS = 9`

即：

- 听力模块最高 +3
- 对话模块最高 +3
- 默写模块最高 +3
- 总进度条满值 9

说明：

- 之前旧逻辑是 `MAX_PROGRESS = 3`
- 现在已经统一改到 `9`
- 所有前端上报统一接口时，`max_progress` 也跟随 `state.MAX_PROGRESS`

---

### 3. 听 / 说 / 写 三模块进度规则

#### 默写（dictation）

- 每次默写判定正确：
  - 前端当前单词 `progress + 1`
  - 调用统一接口 `/api/progress/event`
  - 后端 `correct_count + 1`

- 每次默写判定错误：
  - 不增加前端进度
  - 调用统一接口 `/api/progress/event`
  - 后端 `wrong_count + 1`

说明：

- 旧的 `dictationDone` 锁死逻辑已经不再是当前目标
- 现在默写按“事件发生一次就结算一次”的思路推进

---

#### 听力（example_test）

- 采用“逐句测试”模式：
  - 每次只朗读 1 句
  - 用户回答当前句
  - AI 判定当前句是否通过

- 当前句 `passed = true` 时：
  - 前端当前单词 `progress + 1`
  - 同时记录 `exampleTestProgress + 1`
  - `exampleTestProgress` 模块内最高只到 3
  - 调用统一接口 `/api/progress/event`
  - 后端 `correct_count + 1`

- 当前句 `passed = false` 时：
  - 不增加前端进度
  - 调用统一接口 `/api/progress/event`
  - 后端 `wrong_count + 1`

说明：

- 听力模块当前已经明确：
  - **每答对一句，进度 +1**
  - **模块封顶 3**
  - **通过当前句后自动进入下一句**

---

#### 对话（dialogue）

- 每一轮对话回复，如果 AI 返回 `passed = true`：
  - 前端当前单词 `progress + 1`
  - 同时记录 `dialogueProgress + 1`
  - `dialogueProgress` 模块内最高只到 3
  - 调用统一接口 `/api/progress/event`
  - 后端 `correct_count + 1`

- 若 `passed = false`：
  - 不增加前端进度
  - 调用统一接口 `/api/progress/event`
  - 后端 `wrong_count + 1`

说明：

- 对话模块当前规则已经和听力模块对齐：
  - **每次当前环节通过就 +1**
  - **模块封顶 3**

---

### 4. 当前前端状态结构（home.core.js）

目前 `ensureWordProgressState(word)` 仍是当前单词前端进度状态入口。

当前实际使用思路：

- `progressState.progress`
  - 当前单词总进度

- `progressState.exampleTestProgress`
  - 听力模块已累计进度（最高 3）

- `progressState.dialogueProgress`
  - 对话模块已累计进度（最高 3）

说明：

- 当前不是把所有学习过程都长期写入数据库
- 而是前端维护当前单词临时进度，事件发生时再即时上报后端统计

---

### 5. 统一事件接口

当前统一接口：

- `/api/progress/event`

前端目前已接入：

- `home.dictation.js`
- `home.example_test.js`
- `home.dialogue.voice.js`

上报字段核心包括：

- `word`
- `source`
- `is_correct`
- `progress_delta`
- `progress_value`
- `max_progress`

当前 source 取值已至少包含：

- `dictation`
- `example_test`
- `dialogue`

---

### 6. 后端实际写入规则（ai_routes.py + user_repo.py）

后端统一事件接口已经接入真实数据库写入逻辑：

#### 正确时

- `user_words.correct_count + 1`

#### 错误时

- `user_words.wrong_count + 1`

#### 满进度时

- 当前规则：**只有 `progress_value >= max_progress` 才允许尝试升级**
- 也就是：**只有总进度满 9 才允许 level +1**

说明：

- 之前出现过“满 3 就升级”的风险，后来已明确修正为：
  - **必须满 9 才升级**

---

### 7. level 升级防重规则（已确定）

当前 level 升级规则不是“只要满值就一直加”，而是：

#### 升级条件

必须同时满足：

1. `progress_value >= max_progress`
2. 当前这个单词 `last_review_at` 不是今天

也就是说：

- **同一天内，同一个单词只允许 `level + 1` 一次**

说明：

- 这个防重逻辑已经放在 `/api/progress/event` 中
- 用 `last_review_at` 的日期部分判断是否今天已经升过级

---

### 8. level 升级后联动更新时间规则

一旦触发 `level + 1`，后端必须同时更新：

- `last_review_at`
- `next_review_at`

目前已经通过 `update_user_word_review_schedule(user_id, word, level)` 实现。

---

### 9. 当前记忆曲线间隔规则（SRS）

当前 `user_repo.py` 中的规则为：

- `level = 1` -> `+1 天`
- `level = 2` -> `+2 天`
- `level = 3` -> `+4 天`
- `level = 4` -> `+7 天`
- `level = 5` -> `+15 天`
- `level >= 6` -> `+30 天`

说明：

- 当前是简化版科学记忆间隔规则
- 后续如果要继续精调，可优先修改：
  - `get_srs_interval_days(level)`

---

### 10. 当前涉及的关键文件

#### 前端

- `static/js/home.core.js`
  - 全局状态入口
  - `MAX_PROGRESS` 已改为 `9`
  - `ensureWordProgressState(word)` 仍是当前单词前端进度状态入口

- `static/js/home.dictation.js`
  - 默写正确时前端进度 +1
  - 默写正确/错误都会上报 `/api/progress/event`

- `static/js/home.example_test.js`
  - 听力当前句通过时前端进度 +1
  - 模块内用 `exampleTestProgress` 封顶 3
  - 听力正确/错误都会上报 `/api/progress/event`

- `static/js/home.dialogue.voice.js`
  - 对话当前环节通过时前端进度 +1
  - 模块内用 `dialogueProgress` 封顶 3
  - 对话正确/错误都会上报 `/api/progress/event`

#### 后端

- `routes/ai_routes.py`
  - `/api/progress/event`
  - 当前统一负责：
    - 正确/错误计数写入
    - 满 9 时升级判断
    - 同天升级防重
    - 返回最新 `correct_count / wrong_count / level / review 时间`

- `repositories/user_repo.py`
  - `get_user_word_row(...)`
  - `increment_user_word_correct_count(...)`
  - `increment_user_word_wrong_count(...)`
  - `increment_user_word_level(...)`
  - `get_srs_interval_days(level)`
  - `update_user_word_review_schedule(...)`

---

### 10.1 选词逻辑（最新补充）

#### 一、当前目标规则

当前“当天学习队列”的规则，已经从早期依赖 `queue_date` 的思路，逐步改成：

- 优先保留“今天已经学过”的单词
- 若今天已学单词不足目标数量，则保留已有部分，再补足
- 复习词优先看 `next_review_at` 是否已到期
- 补不足的部分，直接从 `words` 总词库随机补新词
- 不再因为“今天词数量少一个”就整批作废
- 不再从 `user_words` 中随机补未到期旧词，避免旧词被错误拉回今日队列

---

#### 二、今天锁队列的判断规则

当前“是否锁定今天队列”的判断，核心已经不再依赖 `queue_date`，而是：

- 读取用户学习设置中的 `target_word_count`
- 读取 `last_review_at = 今天` 的单词
- 如果这批单词数量 **达到或超过** `target_word_count`
  - 则直接锁定今天这批单词继续学习
- 如果这批单词数量 **少于** `target_word_count`
  - 则 **不整批作废**
  - 而是先保留今天已有单词，再继续补足剩余数量

也就是说，当前修复后的核心行为是：

> 今天已有词优先保留，不足再补；不能因为差 1 个就整批丢弃。

---

#### 三、复习词与新词的配额规则

当前配额规则已经调整为：

- 新词固定按总数的 **2/5** 计算
- 复习词 = 剩余数量
- 当目标数 > 0 时，至少保留 1 个新词

例：

- 3 个词 -> 新词 1，复习 2
- 5 个词 -> 新词 2，复习 3
- 7 个词 -> 新词 3，复习 4

说明：

- 这里的“复习词”优先从 `next_review_at <= 当前时间` 的用户词中抽取
- 如果到期复习词数量不足，则差额由 `words` 总表随机补足

---

#### 四、当前 build_study_queue() 的实际思路

当前 `build_study_queue(user_id)` 的流程，应理解为：

1. 先调用 `get_started_study_queue(user_id)`
   - 查看今天是否已有 `last_review_at = 今天` 的单词
2. 如果今天已有词且数量已达到目标数
   - 直接返回这批单词，`queue_locked = True`
3. 如果今天已有词但数量不足
   - 先把这批词作为 `base_items` 保留下来
   - 再继续按配额补足
4. 补足时：
   - 优先取 `next_review_at <= 当前时间` 的到期复习词
   - 注意会排除已经在 `base_items` 中的词，避免重复
5. 如果仍不足
   - 再从 `words` 总词库随机补足

当前版本的明确取舍是：

- **保留今天已学词**
- **优先补到期复习词**
- **最后补总词库新词**
- **不再随机回补未到期旧词**

---

#### 五、关于 last_review_at / next_review_at / queue_date 的角色说明

##### `last_review_at`

当前主要承担两个作用：

1. 判断“这个词今天是否已经学过”
2. 作为今天锁队列的核心依据

也就是说：

- `last_review_at = 今天` 的词，会被视为“今天已经进入过学习流程的词”

##### `next_review_at`

当前主要承担：

1. 判断这个词是否已经进入“应复习”状态
2. 作为复习词补位时的主筛选条件

也就是说：

- 只有 `next_review_at <= 当前时间` 的词，才优先进入复习候选池

##### `queue_date`

当前结论是：

- `queue_date` 作为一次性写入字段，无法稳定承载动态选词逻辑
- 后续逻辑上应弱化甚至废弃它的业务作用
- 当前“今天锁队列”的核心判断，已经改为优先看 `last_review_at`

---

#### 六、当前已修复的一个关键 bug

之前存在的 bug：

- 当今天已有 7 个单词时，如果把目标学习数从 7 改成 8
- 系统会因为“今天词数量 < 新目标数”而把整批今天词全部作废
- 然后重新抽词，导致用户以为选词逻辑失效

当前已修正为：

- 今天已有 7 个词时，如果目标改为 8
- 系统应保留原 7 个
- 只再补 1 个
- 而不是把 7 个今天词全部丢弃

这条是当前选词逻辑中非常关键的修复点。

---

#### 七、当前仍需牢记的限制

当前版本的选词逻辑，仍然是“快速迭代中的可用版”，不是最终版，因此要注意：

- 今天锁队列目前依赖 `last_review_at = 今天`
- 这意味着“今天学过”与“今天应继续保留”目前仍然被近似视为一回事
- 以后如果要继续精细化，最干净的方案仍然是：
  - 单独建立“今日学习会话 / 今日队列表”
  - 而不是继续让 `user_words` 字段兼任全部语义

但在当前阶段，这套规则已经比原先依赖 `queue_date` 的版本更稳定、更接近实际学习需求。



---

### 11. 当前注意事项

- 现在“前端进度条”和“数据库等级升级”已经不是一回事：
  - 前端负责累计当前轮进度
  - 后端负责正确/错误统计与升级

- level 升级不能再只看局部模块是否满 3：
  - **必须看全局总进度是否满 9**

- 若后续发现 level 仍异常增长，优先检查：
  - `/api/progress/event`
  - 前端是否仍有地方错误上报了 `max_progress = 3`

- 当前“同一天只升级一次”的防重逻辑依赖：
  - `last_review_at`
  - 所以每次升级成功后必须同步更新时间，当前已接入

  ###12 选词规则
    【A. last_review_at / next_review_at 使用位置】                                                  
                                                                                                   
  1. repositories/user_repo.py — update_user_word_review_schedule（唯一写入点）
                                                                                                   
  - 读取 / 更新：写入                                                                              
  - 触发条件：被 ai_routes.py 的 api_progress_event 调用，条件如下（必须同时满足）：               
    a. progress_value >= max_progress（前端传入的当前进度已满）                                    
    b. max_progress > 0                                                                            
    c. next_review_at 不为空 且 next_review_at <= 今天（单词已到期）                               
    d. last_review_at 的日期 ≠ 今天（今天还没复习过）                                              
  - 关键代码（user_repo.py:157-180）：                                                             
  UPDATE user_words                                                                                
  SET last_review_at = ?,                                                                          
      next_review_at = ?                                                                           
  WHERE user_id = ? AND word = ?                                                                   
  - last_review_at = now，next_review_at = now + get_srs_interval_days(level) 天
                                                                                                   
  ---             
  2. routes/ai_routes.py — api_progress_event（读取 + 触发更新的入口）                             
                                                                                                   
  - 文件 / 函数：ai_routes.py:346，POST /api/progress/event
  - 读取：current_last_review_at（行 389）、current_next_review_at（行 390），用于判断             
  review_due（行 396）和 last_review_date != today_str（行 398）                                   
  - 触发更新：满足条件后调用 update_user_word_review_schedule（行 403）                            
  - 写入时机：答题进度达满（progress_value >= max_progress）且单词已到期且今天未被复习过           
                                                                                                   
  ---                                                                                              
  3. services/word_service.py — build_initial_user_word_payload（新词首次写入）                    
                                                                                                   
  - 文件 / 函数：word_service.py:698
  - 读取 / 更新：写入（INSERT 时初始化）                                                           
  - 触发条件：随机选词后调用 persist_word_to_user_words，将新词写入 user_words 时：                
    - last_review_at = None（新词，从未复习）                                                      
    - next_review_at = now + 1天（level=1 时默认间隔）                                             
  - 关键代码（word_service.py:714）：                                                              
  next_review_at = (now + timedelta(days=interval_days)).strftime(...)                             
  last_review_at = None                                                                            
                                                                                                   
  ---                                                                                              
  4. services/word_service.py — get_due_review_words（筛选时读取）                                 
                                                                                                   
  - 读取 / 更新：读取（SQL 筛选条件）
  - 作用：next_review_at IS NOT NULL AND next_review_at <= ?                                       
  用于判断哪些词已到复习期，last_review_at ASC 用于排序                                            
                                                                                                   
  ---                                                                                              
  5. services/word_service.py — get_new_words_from_user_words（筛选时读取）
                                                                                                   
  - 读取：last_review_at IS NULL 作为"新词"筛选条件（行 197）
                                                                                                   
  ---             
  6. services/word_service.py — get_today_started_queue_words（筛选时读取）                        
                                                                                                   
  - 读取：date(last_review_at) = ?（行 853），用于找出今天已开始学习的词
                                                                                                   
  ---             
  【B. 选词逻辑】                                                                                  
                                                                                                   
  总入口：word_service.py — build_study_queue（行 922）
                                                                                                   
  用途：构建当日学习队列，返回 items 列表                                                          
                                                                                                   
  完整流程：                                                                                       
                  
  Step 1 — get_started_study_queue → get_today_started_queue_words                                 
  - 先查 last_review_at 日期 = 今天的词，视为"今天已开始学习的词"
  - 若数量 >= target_word_count，直接返回并锁定（queue_locked=True），不再补充                     
  - 若不足，保留这些词，继续下一步补足                                        
                                                                                                   
  Step 2 — get_due_review_words（行 94）                                                           
  - 筛选条件：level < 6 AND next_review_at IS NOT NULL AND next_review_at <= now                   
  - 排序：wrong_count DESC, correct_count ASC, last_review_at ASC, id ASC                          
  - 按 review_quota（= target × 3/5）限额抽取，但实际调用时传的是 max(target_word_count,           
  review_need)                                                                                     
  - 依赖 next_review_at：是主要筛选条件                                                            
                                                                                                   
  Step 3 — fill_words_from_words_table（行 320）                                                   
  - 当 user_words 中的复习词不够时，从系统 words 表随机补足                                        
  - 筛选条件：排除已入队的词（按 word 文本去重）                                                   
  - 排序：ORDER BY RANDOM()                                                                        
  - 补来的词 不写入 user_words，id=None，为临时词条（source_type="words_random_temp"）             
                                                                                                   
  target_word_count 的参与方式：                                                                   
  - 从 user_study_settings 读取，默认 20                                                           
  - 经 calculate_queue_quota 拆分为 new_quota（= floor(total×2/5)，最少 1）和 review_quota（= total
   - new_quota）                                                                                   
  - 控制 need_count = target_word_count - len(items) 补充上限                                      
                                                             
  queue_locked / queue_date 的参与：                                                               
  - queue_locked：不是数据库字段，是 build_study_queue 返回的内存标志，由 len(today_items) >=      
  target_word_count 决定                                                                           
  - queue_date：user_words 有此字段，build_initial_user_word_payload 写入（行 710），但            
  build_study_queue 中并未用 queue_date 做筛选，当前选词逻辑完全依赖 last_review_at                
  的日期来判断"今天已开始的词"                                                                     
   
  ---                                                                                              
  【C. 最终结论】 
                 
  这两个字段到底在什么时候更新：
                                                                                                   
  ┌──────────────────────────┬─────────────────────────────────┬────────────────────────────────┐  
  │           字段           │             何时写              │             写入值             │  
  ├──────────────────────────┼─────────────────────────────────┼────────────────────────────────┤  
  │ last_review_at（INSERT） │ 新词首次写入 user_words 时      │ NULL                           │
  ├──────────────────────────┼─────────────────────────────────┼────────────────────────────────┤
  │ next_review_at（INSERT） │ 新词首次写入 user_words 时      │ now + 1天                      │  
  ├──────────────────────────┼─────────────────────────────────┼────────────────────────────────┤  
  │ last_review_at（UPDATE） │ POST /api/progress/event        │ now（当前时间）                │  
  │                          │ 满足四个条件时                  │                                │  
  ├──────────────────────────┼─────────────────────────────────┼────────────────────────────────┤
  │ next_review_at（UPDATE） │ 同上                            │ now + SRS间隔天数（随 level    │  
  │                          │                                 │ 升级而变长）                   │
  └──────────────────────────┴─────────────────────────────────┴────────────────────────────────┘  
                  
  四个条件缺一不可：进度达满 + 单词已到期（next_review_at <= 今天）+ 今天尚未复习（last_review_at  
  日期 ≠ 今天）+ max_progress > 0。如果今天已经复习过（last_review_at
  已是今天），即使进度再次达满，也不会再次更新。                                                   
                  
  当前选词逻辑到底依据什么：

  1. 锁定判断：用 last_review_at = 今天 判断今天已开始的词，若已满额则直接锁定，不重新选词         
  2. 复习词主选：next_review_at <= now（已到期）+ level < 6，优先按 wrong_count DESC 排序
  3. 填充词兜底：系统 words 表随机补足，不依赖 next_review_at /                                    
  last_review_at，这些补充词也不会写入 user_words，是纯临时词条                                    
  4. queue_date 字段当前不参与任何选词筛选，只在 INSERT 时写入，逻辑上已被 last_review_at 取代   