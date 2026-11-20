<div align="center">

# Xué 学

**Un carnet de mandarin personnel qui grandit avec toi : mots, caractères, classificateurs, fiches de grammaire, exercices et conversation avec l'IA, dans une seule web app installable.**

[English](README.md) · **Français** · [简体中文](README.zh-CN.md)

![Licence : MIT](https://img.shields.io/badge/licence-MIT-b8322a)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ecf8e)
![OpenRouter](https://img.shields.io/badge/IA-OpenRouter-6366f1)

</div>

---

Xué (学, *apprendre*) est un tableau de bord à héberger soi-même pour apprendre le chinois mandarin (caractères simplifiés) à son rythme. Tu y ajoutes ce que tu apprends au fur et à mesure (cours, manuel, cahier), et l'app en fait des révisions en répétition espacée, de l'entraînement à l'écriture, des exercices de grammaire et un partenaire de conversation qui s'en tient aux mots et aux structures que **tu** connais déjà.

C'est une web app qu'on installe sur iPhone, sur Android (y compris les pliants, pliés ou dépliés) et qu'on utilise aussi sur ordinateur. Chacun installe **sa propre copie**, avec sa base de données et sa clé d'IA : rien n'est partagé.

> **Langue** : l'interface et les explications de l'IA sont **en français** ; Xué a été pensé pour les francophones qui apprennent le mandarin.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Principes](#principes)
- [Installer ta propre copie](#installer-ta-propre-copie) (environ 20 minutes, offres gratuites et quelques dollars de crédit IA)
- [Combien ça coûte](#combien-ça-coûte)
- [Confidentialité et sécurité](#confidentialité-et-sécurité)
- [Comment ça marche](#comment-ça-marche)
- [Développement](#développement)
- [Mettre à jour une copie existante](#mettre-à-jour-une-copie-existante)
- [Dépannage](#dépannage)
- [Contribuer](#contribuer) · [Licence](#licence)

## Fonctionnalités

### Mots et classificateurs
- **Pinyin d'abord** : le pinyin est obligatoire et affiché en gros, les caractères sont facultatifs et plus petits ; on peut donc enregistrer un mot connu seulement à l'oral.
- Pinyin rempli automatiquement à partir des caractères, tons en chiffres acceptés (`xue2sheng1` → `xuéshēng`).
- **Catégories** créées librement (icônes, ordre, plusieurs par mot), affichage regroupé, et **expressions / chengyu** avec leur sens littéral.
- Recherche sans tons, et **recherche par thème avec l'IA** : « maison » retrouve 家, 门, 床… parmi *tes* mots, même non classés, et le résultat devient une catégorie en un geste.
- **Classificateurs** (量词) avec ce qu'ils comptent et des exemples (pinyin calculé, changements de ton de 一 compris).
- **Tests** en répétition espacée (FSRS, l'algorithme d'Anki moderne) ou en quiz libre : pinyin → sens, sens → pinyin, « quel classificateur pour *les animaux* ? », exemples à trous (*yì ＿＿ yáng* 一＿羊). Réponse en pinyin (accents ou chiffres) ou en caractères, option « ignorer les tons ».
- Audio avec la voix chinoise de l'appareil.

### Caractères
- Grille, animation du tracé et mots qui contiennent chaque caractère.
- **Ajout en lot depuis une photo** du cahier (ou une liste collée) : l'IA lit les caractères et propose pinyin et sens ; tu vérifies tout avant d'enregistrer. En test, elle a lu les 59 caractères de six pages manuscrites sans une erreur.
- Un **astérisque** marque les caractères qui ne s'emploient pas seuls comme mots (日 → 太阳, 口 → 嘴, 们…). Un caractère qui s'emploie seul est ajouté automatiquement à tes mots.
- **Entraînement à l'écriture** au doigt ou à la souris, guidé (modèle en clair) ou de mémoire. Le dessin est vérifié **uniquement par sa forme : l'ordre et le sens des traits ne comptent pas**. Traits manquants en rouge, traits en trop signalés, exigence souple ou stricte (la stricte distingue 土/士, 天/夫, 大/太).

### Grammaire (« Structure »)
- Tes propres fiches en sections et sous-sections illimitées, avec un éditeur en blocs type Notion et sauvegarde automatique.
- **Ajouter avec l'IA** : « ajoute la règle de 又…又… pour combiner des adjectifs » → l'IA rédige une fiche courte (explication, structure, exemples naturels, piège courant), propose où la ranger, montre un aperçu et l'enregistre comme une section normale, **entièrement modifiable**.
- **Exercices générés par l'IA** sur une règle, ou sur plusieurs règles cochées. Six nouvelles questions à chaque fois : QCM, phrase à trous, remettre dans l'ordre, traduction (corrigée par l'IA si ta formulation diffère de la référence). Une explication après chaque réponse et un score final.

### Conversation (« Practice »)
Tu écris en caractères ou en pinyin. L'IA reformule ce que tu voulais dire, liste chaque vraie erreur (passage fautif → correction : règle), répond avec tes mots, ta grammaire et tes classificateurs, et te propose d'ajouter en un tap les nouveaux mots ou règles.

### Sauvegardes
Export de tout dans un fichier JSON (progression des révisions comprise), restauration, même dans une base neuve, et copies automatiques quotidiennes sur chaque appareil.

## Principes

| Principe | Où ça se voit |
|---|---|
| **Pinyin d'abord**, caractères ensuite | mots, classificateurs, tests, exemples, exercices |
| **Le pinyin est calculé, jamais inventé par l'IA** (tons fiables, changements de ton de 一 et 不) | `src/lib/pinyin.ts` |
| **Pas de contrôle de l'ordre des traits** : seule la forme compte | `src/lib/handwriting.ts` |
| **Caractère → mot, jamais mot → caractère** | trigger SQL `characters_to_words` |
| **Ce que l'IA écrit reste entièrement modifiable**, avec un aperçu d'abord | photos du cahier, fiches de grammaire |
| **Chaque réponse de l'IA est validée** (zod) et nettoyée avant usage | `src/lib/ai/` |

## Installer ta propre copie

Il te faut quatre comptes gratuits : **GitHub**, **Supabase** (base de données et connexion), **Vercel** (hébergement) et **OpenRouter** (IA, crédit prépayé). Aucune offre payante n'est nécessaire.

### 1. Récupérer le code
Fais un *fork* de ce dépôt sur GitHub, ou clone-le et pousse-le sur un dépôt à toi (privé si tu préfères).

### 2. Créer la base de données (Supabase)
1. Sur [supabase.com](https://supabase.com), crée un nouveau projet.
2. Ouvre **SQL Editor → New query**, colle tout le contenu de [`supabase/schema.sql`](supabase/schema.sql) et clique sur **Run**. Le script crée toutes les tables, les règles de sécurité (chaque utilisateur ne voit que ses propres lignes) et les triggers. Il peut être relancé sans risque.
   - Si Supabase signale des « destructive operations » ou des « tables without RLS », c'est normal : ce sont les `drop … if exists` qui rendent le script relançable, et la sécurité (RLS) est activée plus bas dans le script. Confirme.
3. **Authentication → Sign In / Providers** : laisse **Email** activé et désactive **Confirm email** pour pouvoir te connecter tout de suite après avoir créé ton compte.
4. Clique sur **Connect** (en haut du projet), puis **App Frameworks → Next.js**, et copie l'adresse du projet et la clé **publishable**. N'utilise jamais la clé `service_role` / secrète dans cette app.

### 3. Obtenir une clé d'IA (OpenRouter)
1. Sur [openrouter.ai](https://openrouter.ai), ajoute quelques dollars de crédit (**Credits**). C'est prépayé : quand le crédit est épuisé, l'IA arrête simplement de répondre. Laisse **Auto Top-Up** désactivé.
2. **Keys → Create API Key**, avec une limite de crédit si tu veux. Garde-la secrète : elle n'est utilisée que côté serveur.

### 4. Lancer en local (facultatif)
```bash
npm install
cp .env.local.example .env.local   # puis remplis tes valeurs
npm run dev                        # http://localhost:3000
```

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | adresse de ton projet Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ta clé publishable Supabase (ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` sur les anciens projets) |
| `OPENROUTER_API_KEY` | ta clé OpenRouter, **secrète**, utilisée seulement côté serveur |
| `OPENROUTER_MODEL` | modèle texte (par défaut `deepseek/deepseek-v4-flash`) |
| `OPENROUTER_VISION_MODEL` | facultatif, modèle qui lit les photos (par défaut `deepseek/deepseek-v4.1-flash`) |

### 5. Mettre en ligne (Vercel)
1. Sur [vercel.com](https://vercel.com) : **Add New → Project**, importe ton dépôt (framework Next.js, détecté automatiquement).
2. Ajoute les variables ci-dessus dans **Environment Variables**. Astuce : colle tout le contenu de ton `.env.local` dans le premier champ.
3. **Deploy**. Chaque `git push` sur ta branche principale redéploie.
4. Dans Supabase → **Authentication → URL Configuration**, mets ton adresse Vercel dans **Site URL**.

### 6. Créer ton compte, puis fermer la porte
Ouvre ton site, clique sur **« Première fois ? Créer un compte »** et inscris-toi. Ensuite, dans Supabase → **Authentication → Sign In / Providers**, désactive **Allow new users to sign up**. Sinon, n'importe qui trouvant ton adresse pourrait créer un compte et dépenser ton crédit d'IA.

### 7. L'installer sur ton téléphone
- **iPhone** : ouvre ton site dans Safari → Partager → **Sur l'écran d'accueil**.
- **Android** : ouvre-le dans Chrome → ⋮ → **Installer l'application**.

## Combien ça coûte

Les offres gratuites de Supabase, Vercel et GitHub suffisent pour un usage personnel. L'IA se paie à l'usage sur OpenRouter, avec les modèles open source DeepSeek par défaut : environ **0,0002 $ par message de conversation** et **0,001 $ par photo de cahier ou par exercice**. Un crédit de 5 $ dure longtemps.

## Confidentialité et sécurité

- **Ta copie, tes données** : chaque installation a sa propre base, ses propres utilisateurs et sa propre clé d'IA. Rien n'est envoyé à l'auteur du projet.
- **Row Level Security** sur toutes les tables : un utilisateur connecté ne peut lire et modifier que ses propres lignes, même en appelant l'API directement.
- **La clé d'IA n'arrive jamais dans le navigateur** : chaque appel à l'IA passe par une route serveur (`src/app/api/*`) qui vérifie d'abord la session.
- **La clé Supabase envoyée au navigateur est la clé publishable**, prévue pour être publique ; les données sont protégées par la RLS.
- **Aucun secret dans le dépôt** : `.env.local` est ignoré par git ; seul `.env.local.example`, avec des valeurs factices, est commité.

## Comment ça marche

| Besoin | Choix |
|---|---|
| Application | [Next.js](https://nextjs.org) 16 (App Router, TypeScript), Tailwind CSS 4 |
| Données et connexion | [Supabase](https://supabase.com) : Postgres, comptes email/mot de passe, Row Level Security |
| Hébergement | [Vercel](https://vercel.com) |
| IA | [OpenRouter](https://openrouter.ai) (compatible OpenAI) avec les modèles open source DeepSeek |
| Écriture | `hanzi-writer` et `hanzi-writer-data` (données des traits) et un algorithme de comparaison par la forme |
| Pinyin | `pinyin-pro` et les fonctions de `src/lib/pinyin.ts` |
| Répétition espacée | `ts-fsrs` |
| Éditeur de grammaire | BlockNote |
| Validation | `zod` |
| Tests | Vitest, et PGlite (un vrai Postgres en mémoire) pour le SQL |

```
src/
├── app/
│   ├── (app)/          pages après connexion : accueil, mots (et classificateurs),
│   │                   caracteres, structure (grammaire, exercices), practice, reglages
│   ├── api/            routes serveur qui appellent l'IA (practice, search, characters,
│   │                   grammar, exercise) : la clé ne quitte jamais le serveur
│   └── login/          connexion et création de compte
├── components/         interface partagée : formulaires, quiz, zone de dessin, éditeurs…
├── lib/
│   ├── ai/             consignes envoyées à l'IA et validation de ses réponses
│   ├── db.ts           accès aux données depuis le navigateur (limité par la RLS)
│   ├── pinyin.ts       pinyin et vérification des réponses
│   ├── handwriting.ts  comparaison d'un dessin avec un caractère, par la forme
│   ├── srs.ts          répétition espacée (FSRS)
│   └── backup.ts       export et restauration
└── proxy.ts            renvoie vers /login sans session (le « middleware » de Next.js 16)
supabase/
├── schema.sql          schéma complet pour une base neuve
└── migrations/         mises à jour des bases créées avec une version précédente
```

**Routes IA** : chacune vérifie la session Supabase, appelle OpenRouter sans « raisonnement » et avec le fournisseur le plus rapide, valide la réponse JSON avec zod et corrige ce qui peut l'être (pinyin recalculé, fausses erreurs filtrées, questions d'exercice mal formées écartées).

| Route | Rôle |
|---|---|
| `POST /api/practice` | corriger la phrase de l'apprenant et répondre dans la conversation |
| `POST /api/search` | trouver ses mots liés à un thème |
| `POST /api/characters` | lire les caractères d'une photo de cahier, ou décrire une liste collée |
| `POST /api/grammar` | rédiger un brouillon de fiche de grammaire |
| `POST /api/exercise`, `/api/exercise/check` | créer un exercice à partir des fiches choisies ; corriger les traductions libres |

## Développement

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm test` | toute la suite de tests (environ 70 tests, sans réseau) |
| `npm run lint` | ESLint |
| `npm run build` | build de production (vérifie aussi les types) |
| `npm run generate-icons` | régénère les icônes de l'app |

Les tests couvrent le pinyin, des milliers de dessins simulés pour l'écriture, la validation de chaque type de réponse de l'IA, chaque migration SQL appliquée sur un vrai Postgres (PGlite), relancée deux fois et avec la sécurité entre utilisateurs vérifiée, ainsi que des allers-retours sauvegarde / restauration.

> Next.js 16 diffère des versions précédentes (par exemple `proxy.ts` au lieu de `middleware.ts`) ; la documentation de la version installée est dans `node_modules/next/dist/docs/`.

## Mettre à jour une copie existante

Récupère le nouveau code. Si la mise à jour ajoute des fichiers dans `supabase/migrations/`, lance ceux que tu n'as pas encore appliqués dans le SQL Editor de Supabase, **dans l'ordre et avant de déployer** (chacun peut être relancé sans risque). Une base neuve n'a besoin que de `schema.sql`.

| Migration | Ajoute |
|---|---|
| `002_categories_expressions_radicals` | catégories de mots, expressions, astérisque des caractères |
| `003_words_pinyin_first` | mots en pinyin seul, pinyin obligatoire, caractère → mot |
| `004_classifiers` | classificateurs |
| `005_classifier_reviews` | répétition espacée des classificateurs |

## Dépannage

| Problème | Solution |
|---|---|
| Plus rien ne se charge | les projets Supabase gratuits se mettent en pause après une semaine sans utilisation : tableau de bord Supabase → **Restore** |
| L'IA ne répond plus | crédit OpenRouter épuisé ou limite de la clé atteinte (openrouter.ai → Credits / Keys) |
| Vercel indique un déploiement « blocked » | sur un dépôt privé, l'e-mail de tes commits doit être relié à ton compte GitHub : utilise l'adresse *noreply* de GitHub (`git config user.email`) |
| Pas de son sur 🔊 | installe une voix « Chinois (Chine) » dans les réglages de synthèse vocale du téléphone ; sur iPhone, coupe le mode silencieux |
| Une nouvelle version n'apparaît pas | ferme complètement l'app installée et rouvre-la |

## Contribuer

Les issues et les pull requests sont les bienvenues : bugs, idées, traductions de l'interface, meilleures consignes pour l'IA. Lance `npm test`, `npm run lint` et `npm run build` avant d'ouvrir une pull request.

## Licence

[MIT](LICENSE) © 2026 Ilian Lahlali
