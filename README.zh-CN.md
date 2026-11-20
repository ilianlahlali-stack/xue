<div align="center">

# Xué 学

**一本陪你一起成长的私人中文学习笔记：词语、汉字、量词、语法笔记、AI 练习和 AI 对话，全部集中在一个可安装的网页应用里。**

[English](README.md) · [Français](README.fr.md) · **简体中文**

![许可证：MIT](https://img.shields.io/badge/license-MIT-b8322a)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ecf8e)
![OpenRouter](https://img.shields.io/badge/AI-OpenRouter-6366f1)

</div>

---

Xué（学）是一个自行部署的中文（普通话、简体字）学习面板，让你按照自己的节奏学习。你可以随时把学到的内容（课堂、教材或自己的笔记本）加进来，应用会把它们变成间隔重复复习、手写练习、语法练习，以及一个只使用**你**已经掌握的词语和句型来聊天的对话伙伴。

它是一个网页应用：可以安装在 iPhone、Android（包括折叠屏手机的折叠和展开状态）上，也可以在电脑上使用。每个人部署**自己的一份**，使用自己的数据库和自己的 AI 密钥，彼此之间不共享任何数据。

> **语言说明**：界面和 AI 的讲解都是**法语**的，Xué 最初是为学习中文的法语使用者设计的。代码注释是英文，所有提示词都在 `src/lib/ai/` 中，若想改成其他语言，主要是翻译这些内容。

## 目录

- [功能](#功能)
- [设计原则](#设计原则)
- [部署你自己的一份](#部署你自己的一份)（约 20 分钟，免费套餐加上几美元的 AI 额度）
- [费用](#费用)
- [隐私与安全](#隐私与安全)
- [工作原理](#工作原理)
- [开发](#开发)
- [更新已有的部署](#更新已有的部署)
- [常见问题](#常见问题)
- [参与贡献](#参与贡献) · [许可证](#许可证)

## 功能

### 词语和量词
- **拼音优先**：拼音必填并以大字显示，汉字可选并以小字显示，所以只会说、还不会写的词也能保存。
- 根据汉字自动填写拼音，支持数字标调（`xue2sheng1` → `xuéshēng`）。
- 自定义**分类**（图标、排序、一个词可属于多个分类）、分组显示，以及带字面意思的**惯用语 / 成语**。
- 不区分声调的搜索，以及 **AI 主题搜索**：输入“房子”，就能从*你自己的*词语中找出 家、门、床……即使它们没有被分类，并且一键把结果保存为一个分类。
- **量词**：记录它们修饰的名词和例句（拼音自动生成，包括“一”的变调）。
- **测试**：间隔重复（FSRS，现代 Anki 使用的算法）或自由测验。拼音 → 意思、意思 → 拼音、“动物用哪个量词？”、填空例句（*yì ＿＿ yáng* 一＿羊）。可以用拼音（声调符号或数字）或汉字作答，也可以选择“忽略声调”。
- 使用设备自带的中文语音朗读。

### 汉字
- 汉字列表、笔画动画，以及包含该字的词语。
- **拍照批量添加**笔记本上的汉字（或粘贴一串汉字）：AI 识别汉字并给出拼音和意思，保存前你可以逐一检查。在测试中，它准确识别了六页手写笔记中的全部 59 个汉字。
- **星号**标记不能单独成词的字（日 → 太阳、口 → 嘴、们……）。能单独使用的字会自动加入你的词语。
- **手写练习**：用手指或鼠标书写，可选描红模式或默写模式。系统**只比较字形，不检查笔顺和笔画方向**。缺少的笔画显示为红色，多余的笔画也会提示。有宽松和严格两种模式（严格模式能区分 土/士、天/夫、大/太）。

### 语法（“Structure”）
- 用类似 Notion 的块编辑器整理你自己的语法笔记，层级不限，自动保存。
- **用 AI 添加**：输入“添加用 又…又… 连接形容词的规则”，AI 会起草一份简短的笔记（讲解、句型、自然的例句、常见错误），建议放在哪个分类下，先给你预览，再保存为普通的、**完全可编辑**的笔记。
- **AI 练习**：针对一条规则练习，或勾选多条规则混合练习。每次都会生成六道新题：选择题、填空题、连词成句和翻译题（如果你的说法和参考答案不同，由 AI 判断对错）。每题之后都有讲解，最后给出得分。

### 对话（“Practice”）
用汉字或拼音聊天。AI 会先复述你想表达的意思，逐条列出真正的错误（错误部分 → 改正：规则），用你学过的词语、语法和量词回复，并让你一键添加新词或新规则。

### 备份
把所有数据（包括复习进度）导出为 JSON 文件，可以恢复（即使是全新的数据库），每台设备上还会自动保存每日副本。

## 设计原则

| 原则 | 体现在 |
|---|---|
| **拼音优先**，汉字其次 | 词语、量词、测试、例句、练习 |
| **拼音由程序计算，绝不由 AI 编造**（声调可靠，包括“一”“不”的变调） | `src/lib/pinyin.ts` |
| **不检查笔顺**，只看字形 | `src/lib/handwriting.ts` |
| **汉字 → 词语，绝不反过来** | SQL 触发器 `characters_to_words` |
| **AI 写的内容完全可编辑**，并且先预览 | 笔记本照片、语法笔记 |
| **AI 的每个回答都经过校验**（zod）和清理后才使用 | `src/lib/ai/` |

## 部署你自己的一份

你需要四个免费账号：**GitHub**、**Supabase**（数据库和登录）、**Vercel**（托管）和 **OpenRouter**（AI，预付额度）。不需要任何付费套餐。

### 1. 获取代码
在 GitHub 上 fork 这个仓库（或者克隆后推送到你自己的仓库，可以设为私有）。

### 2. 创建数据库（Supabase）
1. 在 [supabase.com](https://supabase.com) 创建一个新项目。
2. 打开 **SQL Editor → New query**，粘贴 [`supabase/schema.sql`](supabase/schema.sql) 的全部内容，然后点击 **Run**。脚本会创建所有数据表、安全规则（每个用户只能看到自己的数据）和触发器，可以安全地重复运行。
   - 如果 Supabase 提示 “destructive operations” 或 “tables without RLS”，这是正常的：这些是让脚本可以重复运行的 `drop … if exists` 语句，而 RLS 在脚本后面会被启用。确认即可。
3. **Authentication → Sign In / Providers**：保持 **Email** 开启；如果想在注册后立即登录，请关闭 **Confirm email**。
4. 点击项目顶部的 **Connect** → **App Frameworks → Next.js**，复制项目地址和 **publishable** 密钥。不要在本应用中使用 `service_role` / secret 密钥。

### 3. 获取 AI 密钥（OpenRouter）
1. 在 [openrouter.ai](https://openrouter.ai) 充值几美元（**Credits**）。这是预付费：额度用完后 AI 只会停止回答，不会自动扣费。请保持 **Auto Top-Up** 关闭。
2. **Keys → Create API Key**，可以设置额度上限。请妥善保管，它只在服务器端使用。

### 4. 本地运行（可选）
```bash
npm install
cp .env.local.example .env.local   # 然后填写你自己的值
npm run dev                        # http://localhost:3000
```

| 变量 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 你的 Supabase 项目地址 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 你的 Supabase publishable 密钥（旧项目可用 `NEXT_PUBLIC_SUPABASE_ANON_KEY`） |
| `OPENROUTER_API_KEY` | 你的 OpenRouter 密钥，**保密**，仅在服务器端使用 |
| `OPENROUTER_MODEL` | 文本模型（默认 `deepseek/deepseek-v4-flash`） |
| `OPENROUTER_VISION_MODEL` | 可选，识别照片的模型（默认 `deepseek/deepseek-v4.1-flash`） |

### 5. 上线（Vercel）
1. 在 [vercel.com](https://vercel.com)：**Add New → Project**，导入你的仓库（框架 Next.js 会被自动识别）。
2. 在 **Environment Variables** 中添加上面的变量。小技巧：把 `.env.local` 的全部内容粘贴到第一个输入框即可。
3. 点击 **Deploy**。之后每次 `git push` 到主分支都会自动重新部署。
4. 在 Supabase → **Authentication → URL Configuration** 中，把 **Site URL** 设为你的 Vercel 地址。

### 6. 创建账号，然后关闭注册
打开你的网站，点击 **“Première fois ? Créer un compte”**（第一次使用？创建账号）完成注册。然后在 Supabase → **Authentication → Sign In / Providers** 中关闭 **Allow new users to sign up**，否则任何找到你网址的人都可以注册账号并消耗你的 AI 额度。

### 7. 安装到手机上
- **iPhone**：用 Safari 打开你的网站 → 分享 → **添加到主屏幕**。
- **Android**：用 Chrome 打开 → ⋮ → **安装应用**。

## 费用

Supabase、Vercel 和 GitHub 的免费套餐足够个人使用。AI 在 OpenRouter 上按量付费，默认使用开源的 DeepSeek 模型：每条对话消息约 **0.0002 美元**，每张笔记本照片或每次练习约 **0.001 美元**。5 美元的额度可以用很久。

## 隐私与安全

- **你的部署，你的数据**：每次部署都有自己的数据库、自己的用户和自己的 AI 密钥，任何数据都不会发送给本项目的作者。
- **所有数据表都启用了 Row Level Security**：登录用户只能读取和修改自己的数据，即使直接调用 API 也是如此。
- **AI 密钥永远不会到达浏览器**：每次调用 AI 都经过服务器路由（`src/app/api/*`），并先验证登录状态。
- **发送到浏览器的 Supabase 密钥是 publishable 密钥**，本来就是公开的；数据由 RLS 保护。
- **仓库中没有任何机密信息**：`.env.local` 已被 git 忽略，只提交了带占位值的 `.env.local.example`。

## 工作原理

| 需求 | 选择 |
|---|---|
| 应用 | [Next.js](https://nextjs.org) 16（App Router、TypeScript）、Tailwind CSS 4 |
| 数据和登录 | [Supabase](https://supabase.com)：Postgres、邮箱密码登录、Row Level Security |
| 托管 | [Vercel](https://vercel.com) |
| AI | [OpenRouter](https://openrouter.ai)（兼容 OpenAI 接口），使用开源的 DeepSeek 模型 |
| 手写 | `hanzi-writer` 和 `hanzi-writer-data`（笔画数据），以及基于字形的比对算法 |
| 拼音 | `pinyin-pro` 以及 `src/lib/pinyin.ts` 中的工具函数 |
| 间隔重复 | `ts-fsrs` |
| 语法编辑器 | BlockNote |
| 校验 | `zod` |
| 测试 | Vitest，SQL 部分使用 PGlite（内存中的真实 Postgres） |

```
src/
├── app/
│   ├── (app)/          登录后的页面：首页、mots（词语和量词）、caracteres（汉字）、
│   │                   structure（语法和练习）、practice（对话）、reglages（设置）
│   ├── api/            调用 AI 的服务器路由（practice、search、characters、
│   │                   grammar、exercise），密钥从不离开服务器
│   └── login/          登录和注册
├── components/         共用界面：表单、测验、书写板、编辑器……
├── lib/
│   ├── ai/             发送给 AI 的提示词及其回答的校验
│   ├── db.ts           浏览器端的数据访问（受 RLS 限制）
│   ├── pinyin.ts       拼音工具和答案判断
│   ├── handwriting.ts  按字形比较手写和汉字
│   ├── srs.ts          间隔重复（FSRS）
│   └── backup.ts       导出和恢复
└── proxy.ts            未登录时跳转到 /login（Next.js 16 中的“middleware”）
supabase/
├── schema.sql          新数据库使用的完整结构
└── migrations/         用旧版本创建的数据库的升级脚本
```

**AI 路由**：每个路由都会验证 Supabase 登录状态，以关闭“推理”、选择最快服务商的方式调用 OpenRouter，用 zod 校验 JSON 回答，并修正可以修正的内容（重新计算拼音、过滤误判的错误、丢弃格式不对的练习题）。

| 路由 | 用途 |
|---|---|
| `POST /api/practice` | 纠正学习者的句子并在对话中回复 |
| `POST /api/search` | 查找与某个主题相关的词语 |
| `POST /api/characters` | 识别笔记本照片中的汉字，或解释粘贴的一串汉字 |
| `POST /api/grammar` | 起草语法笔记 |
| `POST /api/exercise`、`/api/exercise/check` | 根据所选笔记生成练习；批改自由翻译 |

## 开发

| 命令 | 用途 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm test` | 运行全部测试（约 70 个，无需联网） |
| `npm run lint` | ESLint |
| `npm run build` | 生产构建（同时检查类型） |
| `npm run generate-icons` | 重新生成应用图标 |

测试覆盖拼音处理、数千个模拟手写样本、AI 各类回答的校验、在真实 Postgres（PGlite）上运行的每个 SQL 迁移（各运行两次，并检查用户之间的数据隔离），以及备份与恢复的完整流程。

> Next.js 16 与之前的版本有所不同（例如用 `proxy.ts` 代替 `middleware.ts`）；当前版本的文档位于 `node_modules/next/dist/docs/`。

## 更新已有的部署

拉取新代码。如果更新在 `supabase/migrations/` 中新增了文件，请在 Supabase 的 SQL Editor 中**按顺序、并在部署之前**运行你尚未执行过的迁移（每个都可以安全地重复运行）。全新的数据库只需要 `schema.sql`。

| 迁移 | 新增内容 |
|---|---|
| `002_categories_expressions_radicals` | 词语分类、惯用语、汉字星号 |
| `003_words_pinyin_first` | 只有拼音的词语、拼音必填、汉字 → 词语 |
| `004_classifiers` | 量词 |
| `005_classifier_reviews` | 量词的间隔重复 |

## 常见问题

| 问题 | 解决方法 |
|---|---|
| 什么都加载不出来 | Supabase 免费项目闲置一周后会暂停：打开 Supabase 控制台 → **Restore** |
| AI 不再回答 | OpenRouter 额度用完或达到密钥的额度上限（openrouter.ai → Credits / Keys） |
| Vercel 显示部署被 “blocked” | 私有仓库要求提交邮箱与 GitHub 账号关联：请使用 GitHub 的 *noreply* 邮箱（`git config user.email`） |
| 点击 🔊 没有声音 | 在手机的文字转语音设置中安装“中文（中国）”语音；iPhone 请关闭静音模式 |
| 看不到新版本 | 完全关闭已安装的应用后重新打开 |

## 参与贡献

欢迎提交 issue 和 pull request：问题反馈、新想法、界面翻译、更好的提示词。提交 pull request 之前，请先运行 `npm test`、`npm run lint` 和 `npm run build`。

## 许可证

[MIT](LICENSE) © 2026 Ilian Lahlali
