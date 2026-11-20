<div align="center">

# Xué 学

**A personal Mandarin notebook that grows with you — words, characters, classifiers, grammar notes, AI exercises and conversation, in one installable web app.**

**English** · [Français](README.fr.md) · [简体中文](README.zh-CN.md)

![License: MIT](https://img.shields.io/badge/license-MIT-b8322a)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ecf8e)
![OpenRouter](https://img.shields.io/badge/AI-OpenRouter-6366f1)

</div>

---

Xué (学, *to learn*) is a self-hosted dashboard for learning Mandarin Chinese (simplified characters) at your own pace. You add what you learn as you go — from class, a textbook or your own notebook — and the app turns it into spaced-repetition reviews, handwriting practice, grammar exercises and a conversation partner that sticks to the words and structures **you** already know.

It runs as a web app you can install on iPhone, Android (folded or unfolded foldables included) and use on a computer. Each person runs **their own copy**, with their own database and their own AI key: nothing is shared.

> **Language note** — the interface and the AI explanations are in **French**: Xué was built for French speakers learning Mandarin. The code is commented in English and the prompts live in `src/lib/ai/`, so adapting it to another language is mostly a matter of translating those.

## Contents

- [Features](#features)
- [Design principles](#design-principles)
- [Run your own copy](#run-your-own-copy) (about 20 minutes, free tiers + a few dollars of AI credit)
- [What it costs](#what-it-costs)
- [Privacy and security](#privacy-and-security)
- [How it works](#how-it-works)
- [Development](#development)
- [Updating an existing copy](#updating-an-existing-copy)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing) · [License](#license)

## Features

### Words and classifiers
- **Pinyin first**: pinyin is required and shown large; characters are optional and smaller, so you can save a word you only know orally.
- Pinyin filled in automatically from characters; tone numbers accepted (`xue2sheng1` → `xuéshēng`).
- **Categories** you create (icons, order, several per word), a grouped view, and **expressions / chengyu** with their literal meaning.
- Tone-insensitive search, plus an **AI theme search**: type "house" and get 家, 门, 床… among *your* words, even unlabelled — then save the result as a category in one tap.
- **Classifiers** (量词) with what they count and examples (pinyin computed, including the tone changes of 一).
- **Tests** with spaced repetition (FSRS, the algorithm behind modern Anki) or free quizzes: pinyin → meaning, meaning → pinyin, "which classifier for *animals*?", fill-in examples (*yì ＿＿ yáng* 一＿羊). Answers in pinyin (tone marks or numbers) or characters, optional "ignore tones".
- Audio with the device's own Chinese voice.

### Characters
- Grid, stroke animation, and the words that contain each character.
- **Add many at once from a photo** of your notebook (or a pasted list): the AI reads the characters and suggests pinyin and meaning; you review everything before saving. In tests it read all 59 characters of six handwritten pages without a mistake.
- An **asterisk** marks characters that are not used on their own as words (日 → 太阳, 口 → 嘴, 们…). A character used on its own is automatically added to your words.
- **Handwriting practice** with a finger or a mouse, guided (model shown faintly) or from memory. Drawings are checked **by shape only — stroke order and direction don't matter** — with missing strokes shown in red and extra strokes flagged; lenient or strict mode (strict tells 土/士, 天/夫, 大/太 apart).

### Grammar ("Structure")
- Your own grammar notes in unlimited sections and sub-sections, with a Notion-like block editor and autosave.
- **Add with AI**: "add the 又…又… rule to combine adjectives" → the AI drafts a short note (explanation, pattern, natural examples, a common pitfall), suggests where to file it, shows a preview, and saves it as a normal, **fully editable** section.
- **AI exercises**: train on one rule or tick several to mix them. Six new questions every time — multiple choice, fill-in-the-blanks, word order, and translation (graded by the AI when your wording differs from the reference) — with an explanation after each answer and a final score.

### Conversation ("Practice")
Chat in characters or pinyin. The AI restates what you meant, lists each real mistake (wrong part → correction: rule), replies using your known words, grammar and classifiers, and offers to add any new word or rule in one tap.

### Backups
Export everything to a JSON file (review progress included), restore it — even into a brand-new database — and keep automatic daily copies on each device.

## Design principles

| Principle | Where it shows |
|---|---|
| **Pinyin first**, characters second | words, classifiers, tests, examples, exercises |
| **Pinyin is computed, never invented by the AI** (reliable tones, 一/不 tone changes) | `src/lib/pinyin.ts` |
| **No stroke-order checking**: only the shape of the character counts | `src/lib/handwriting.ts` |
| **Characters → words, never words → characters** | SQL trigger `characters_to_words` |
| **Whatever the AI writes stays fully editable**, with a preview first | notebook photos, grammar notes |
| **Every AI answer is validated** (zod) and cleaned before use | `src/lib/ai/` |

## Run your own copy

You need four free accounts: **GitHub**, **Supabase** (database and sign-in), **Vercel** (hosting) and **OpenRouter** (AI, prepaid credit). No paid plan is required.

### 1. Get the code
Fork this repository on GitHub (or clone it and push it to a repository of your own, private if you prefer).

### 2. Create the database (Supabase)
1. On [supabase.com](https://supabase.com), create a new project.
2. Open **SQL Editor → New query**, paste the whole content of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It creates every table, the security rules (each user only ever sees their own rows) and the triggers. It can safely be run again.
   - Supabase may warn about "destructive operations" or "tables without RLS": these are the `drop … if exists` statements that make the script re-runnable, and RLS is enabled further down in the script. Confirm.
3. **Authentication → Sign In / Providers**: keep **Email** enabled; turn off **Confirm email** if you want to sign in right after creating your account.
4. Click **Connect** (top of the project) → **App Frameworks → Next.js**, and copy the project URL and the **publishable** key. Never use the `service_role` / secret key in this app.

### 3. Get an AI key (OpenRouter)
1. On [openrouter.ai](https://openrouter.ai), add a few dollars of credit (**Credits**). It is prepaid: when it runs out the AI simply stops answering — leave **Auto Top-Up** off.
2. **Keys → Create API Key**, optionally with a credit limit. Keep it secret: it is only ever used on the server.

### 4. Run it locally (optional)
```bash
npm install
cp .env.local.example .env.local   # then fill in your values
npm run dev                        # http://localhost:3000
```

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your Supabase publishable key (or `NEXT_PUBLIC_SUPABASE_ANON_KEY` on older projects) |
| `OPENROUTER_API_KEY` | your OpenRouter key — **secret**, server-side only |
| `OPENROUTER_MODEL` | text model (default `deepseek/deepseek-v4-flash`) |
| `OPENROUTER_VISION_MODEL` | optional, the model that reads photos (default `deepseek/deepseek-v4.1-flash`) |

### 5. Put it online (Vercel)
1. On [vercel.com](https://vercel.com): **Add New → Project**, import your repository (framework: Next.js, detected automatically).
2. Add the variables above under **Environment Variables** — tip: paste the whole content of your `.env.local` into the first field.
3. **Deploy**. Every `git push` to your main branch redeploys.
4. In Supabase → **Authentication → URL Configuration**, set **Site URL** to your Vercel address.

### 6. Create your account, then lock the door
Open your site, choose **"Première fois ? Créer un compte"**, and sign up. Then, in Supabase → **Authentication → Sign In / Providers**, turn off **Allow new users to sign up**: otherwise anyone who finds your address could create an account and spend your AI credit.

### 7. Install it on your phone
- **iPhone**: open your site in Safari → Share → **Add to Home Screen**.
- **Android**: open it in Chrome → ⋮ → **Install app**.

## What it costs

Supabase, Vercel and GitHub free tiers are enough for personal use. AI is pay-as-you-go on OpenRouter with the default open-weight DeepSeek models: roughly **$0.0002 per conversation message** and **$0.001 per notebook photo or exercise** — a $5 credit lasts a long time.

## Privacy and security

- **Your copy, your data**: each installation has its own database, its own users and its own AI key. Nothing is sent to the author of this project.
- **Row Level Security** on every table: a signed-in user can only read and change their own rows, even through the raw API.
- **The AI key never reaches the browser**: every AI call goes through a server route (`src/app/api/*`) that first checks the session.
- **The Supabase key shipped to the browser is the publishable one**, designed to be public; data is protected by RLS.
- **No secrets in the repository**: `.env.local` is git-ignored; only `.env.local.example` with placeholder values is committed.

## How it works

| Need | Choice |
|---|---|
| App | [Next.js](https://nextjs.org) 16 (App Router, TypeScript), Tailwind CSS 4 |
| Data and sign-in | [Supabase](https://supabase.com) — Postgres, email/password auth, Row Level Security |
| Hosting | [Vercel](https://vercel.com) |
| AI | [OpenRouter](https://openrouter.ai) (OpenAI-compatible) with open-weight DeepSeek models |
| Handwriting | `hanzi-writer` and `hanzi-writer-data` (stroke data), plus a shape-matching algorithm |
| Pinyin | `pinyin-pro` plus helpers in `src/lib/pinyin.ts` |
| Spaced repetition | `ts-fsrs` |
| Grammar editor | BlockNote |
| Validation | `zod` |
| Tests | Vitest, and PGlite (a real Postgres in memory) for the SQL |

```
src/
├── app/
│   ├── (app)/          signed-in pages: home, mots (words, classifiers), caracteres,
│   │                   structure (grammar, exercises), practice, reglages (settings)
│   ├── api/            server routes that call the AI (practice, search, characters,
│   │                   grammar, exercise) — the key never leaves the server
│   └── login/          sign-in and sign-up
├── components/         shared UI: forms, quizzes, drawing pad, editors…
├── lib/
│   ├── ai/             prompts sent to the AI and validation of its answers
│   ├── db.ts           data access from the browser (RLS-scoped)
│   ├── pinyin.ts       pinyin helpers and answer checking
│   ├── handwriting.ts  shape-based comparison of a drawing with a character
│   ├── srs.ts          spaced repetition (FSRS)
│   └── backup.ts       export / restore
└── proxy.ts            redirects to /login without a session (Next.js 16's "middleware")
supabase/
├── schema.sql          full schema for a fresh database
└── migrations/         upgrades for databases created with an earlier version
```

**AI routes** — each one checks the Supabase session, calls OpenRouter with "reasoning" off and the fastest provider, validates the JSON answer with zod, and fixes what can be fixed (pinyin recomputed, false mistakes filtered out, malformed exercise questions dropped):

| Route | Purpose |
|---|---|
| `POST /api/practice` | correct the learner's sentence and reply in the conversation |
| `POST /api/search` | find the learner's words related to a theme |
| `POST /api/characters` | read characters from a notebook photo, or describe a pasted list |
| `POST /api/grammar` | draft a grammar note |
| `POST /api/exercise`, `/api/exercise/check` | build an exercise from chosen notes; grade free translations |

## Development

| Command | Purpose |
|---|---|
| `npm run dev` | development server |
| `npm test` | the whole test suite (~70 tests, no network needed) |
| `npm run lint` | ESLint |
| `npm run build` | production build (also type-checks) |
| `npm run generate-icons` | regenerate the app icons |

The tests cover pinyin handling, thousands of simulated handwriting drawings, the validation of every kind of AI answer, every SQL migration applied to a real Postgres (PGlite) — run twice, with security between users checked — and backup/restore round trips.

> Next.js 16 differs from earlier versions (for example `proxy.ts` instead of `middleware.ts`); the docs for the installed version are in `node_modules/next/dist/docs/`.

## Updating an existing copy

Pull the new code. If the update adds files to `supabase/migrations/`, run the ones you haven't applied yet in the Supabase SQL Editor, **in order and before deploying** (each one can safely be run twice). A brand-new database only needs `schema.sql`.

| Migration | Adds |
|---|---|
| `002_categories_expressions_radicals` | word categories, expressions, the character asterisk |
| `003_words_pinyin_first` | pinyin-only words, required pinyin, character → word |
| `004_classifiers` | classifiers |
| `005_classifier_reviews` | spaced repetition for classifiers |

## Troubleshooting

| Problem | Fix |
|---|---|
| Nothing loads any more | free Supabase projects pause after a week without use: open your Supabase dashboard → **Restore** |
| The AI stopped answering | OpenRouter credit used up or key limit reached (openrouter.ai → Credits / Keys) |
| Vercel says the deployment was "blocked" | on a private repository, your commit e-mail must be linked to your GitHub account; use GitHub's *noreply* address (`git config user.email`) |
| No sound on 🔊 | install a "Chinese (China)" voice in your phone's text-to-speech settings; on iPhone, turn off silent mode |
| A new version doesn't show | fully close the installed app and open it again |

## Contributing

Issues and pull requests are welcome — bug reports, ideas, translations of the interface, better prompts. Please run `npm test`, `npm run lint` and `npm run build` before opening a pull request.

## License

[MIT](LICENSE) © 2026 Ilian Lahlali
