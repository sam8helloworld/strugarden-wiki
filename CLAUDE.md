# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

サービスを終了したオンラインゲーム「**ストラガーデンNEO**」のwikiをクローズ前にマークダウン化して保存するプロジェクト。最終的にはその情報をもとに一部の機能を切り出してゲームとして実装することを目指している。AIを活用してwikiを完全移植する方針。

コンテンツはすべて日本語のMarkdownで記述する。参考wiki:

- 本家 (優先): https://wiki.strugarden.pluslake.net/
- ミラー (本家で閲覧不可のページを補完): http://wikimirr.web.fc2.com/sgwiki.s172.xrea.com/index.phpA4CFA4B8A4E1A4CB.htm

## Task Management

マークダウン化の進捗は **`TODO.md`** (リポジトリルート) で管理する。作業を始める前に必ずTODO.mdを確認し、⬜ になっているページを対象に作業する。完了したら ⬜ を ✅ に更新する。

## Wiki URL Structure

wikiのURLは `https://wiki.strugarden.pluslake.net/{パス}` の形式。パスは日本語をURLエンコードしたもの。

- ページ例: `/職業/戦士` → `https://wiki.strugarden.pluslake.net/%E8%81%B7%E6%A5%AD/%E6%88%A6%E5%A3%AB`
- カテゴリのインデックスページ (例: `/生産/`, `/国/`) は403で取得不可だが、個別ページは取得可能
- サイドバー `<div id="leftbox2">` が全ページのナビゲーションインデックスになっている
- ミラーサイトはHTTPS→HTTPリダイレクトが発生するため `http://` で直接アクセスすること

## Link Conversion

wikiのリンクはフルURLだが、マークダウン化する際は**同リポジトリ内の他Markdownファイルへの相対リンク**に変換する。

- 例: `https://wiki.strugarden.pluslake.net/職業/戦士` → `./warrior.md` (同ディレクトリ) または `../jobs/warrior.md` (別ディレクトリから)
- 対応するMarkdownファイルがまだ存在しない場合も、将来作成される想定で相対リンクを記述しておく。

## Repository Structure

```
docs/
├── battle/
│   ├── monster_skills/   # Enemy skill specs by monster race (plant, animal, undead, etc.)
│   ├── monsters/         # Monster data organized by level range and area
│   ├── status_abnormality.md
│   ├── exp_required.md   # 必要経験値 (/必要経験値)
│   ├── resource_base_battle.md  # 資源拠点争奪戦 (/対人/資源拠点争奪戦)
│   ├── arena.md          # 闘技場 (/対人/闘技場)
│   ├── training_hall.md  # 闘錬の間 (/対人/闘技場/闘錬の間)
│   └── duel.md           # デュエル (/対人/デュエル)
├── events/
│   └── events.md         # イベント (/イベント)
├── familiar/
│   ├── README.md         # ファミリア概要
│   ├── capture.md        # 捕獲方法
│   ├── raising.md        # 育成方法
│   ├── contract.md       # ファミリアコントラクト
│   ├── flying/           # 飛行系 (鳥系, ハーピー系)
│   ├── animal/           # 動物系 (うさぎ系, くま系, たぬき系)
│   ├── demi-human/       # 亜人系 (ゴブリン系, アルマジロ系)
│   ├── amphibian/        # 両生系 (蛇系, 蛙系, 亀系)
│   ├── fairy/            # 妖精系 (プチドラゴン系)
│   └── demon/            # 魔生系 (ゴーレム系)
├── guild/
│   └── guild.md          # ギルド (/ギルド)
├── items/
│   ├── armors/           # Armor by slot (head, arm, upper_body, lower_body, leg, shield)
│   ├── decorations/      # Accessory slots (ear, face, finger, neck, upper/lower body decoration)
│   ├── weapons/          # Weapons by type (bow, dagger, katana, etc.)
│   ├── food.md
│   ├── medicine.md
│   ├── remuneration_entitlement.md
│   ├── other.md          # その他アイテム (/アイテム/その他)
│   └── deck.md           # デッキ (/アイテム/その他/デッキ)
├── jobs/                 # Job (class) data — base jobs and advanced jobs
│   └── skill_adjustments/ # スキル調整履歴
├── mall/                 # ストラモール (/ストラモール/*)
├── production/           # 生産スキル (/生産/*)
├── quests/               # クエスト・国別情報
│   ├── main_quest.md     # メインクエスト概要 (/クエスト/メインクエスト)
│   ├── demon_king.md     # 魔王編 (/クエスト/魔王編)
│   ├── mini_quest.md     # ミニクエスト概要 (/クエスト/ミニクエスト)
│   ├── tavern_quest.md   # 酒場クエスト概要 (/クエスト/酒場クエスト)
│   ├── park.md           # パーク (/パーク)
│   ├── recipe_drop.md    # レシピドロップ (/レシピドロップ)
│   ├── wiz_niam/         # ウィズニアム連邦
│   ├── roran/            # ロラン共和国
│   ├── gordu/            # ゴードゥ皇国
│   ├── mikrensia/        # ミクレンシア帝国
│   ├── arkamaya/         # アルカマイヤ公国 (酒場クエストなし)
│   ├── radenius/         # ラデニウス示教国 (酒場クエストなし)
│   └── dragonia/         # ドラゴニア
└── tips/                 # Tips・基本情報
    ├── intro.md          # はじめに (/はじめに)
    ├── tips.md           # Tips (/Tips)
    ├── world_map.md      # 世界地図 (/Tips/WORLD)
    ├── beginner_guide.md # 初心者のすすめかた (/初心者のすすめかた)
    ├── history.md        # ストラガーデン史 (/ストラガーデン史)
    └── glossary.md       # 用語辞典 (/Tips/用語辞典)
```

## Content Conventions

### Skill documentation format (used in `battle/monster_skills/`)

Each skill entry follows this structure:
- 消費AP, スピード, 属性 (物理/魔法), タイプ (直接/召喚), 習得Lv
- 説明 (description), special effects (吹き飛ばし, 移動不可, 状態異常, etc.)
- 射程範囲 as ASCII grid using `■`/`□`/`↑` (↑ = caster position)
- 効果範囲 (effect area) — either "指定対象のみ" or a grid pattern

Grid notation:
- `■` = targetable/affected cell
- `□` = non-targetable cell
- `↑` = caster position
- `◆` = center of effect area

Range notation: `上N・下N` = N cells above / N cells below.

### Status notation
- `？` marks unverified values — preserve when data is unknown
- State duration: `(0T)` = clears that turn, `(2T)` = lasts 2 turns after trigger

### Game terminology
- **ジョブ / サイドジョブ / 上位職** — main job, side job, advanced job
- **AP** — action points consumed per skill
- **ファミリア** — pet monsters; can be captured, raised, and contracted
- **性向値** — personality values (クール/やさしさ, ワイルド/かしこさ) that affect familiar skill learning
- Monster races: 飛行系, 動物系, 亜人系, 両生系, 妖精系, 魔生系, 植物系, etc.

### Job progression ring
```
盗賊 ─ 戦士 ─ 格闘士
 │              │
黒印  ─ 精霊 ─ 守護
```
Advanced jobs (requires Lv45 + Dragonia main quest ch.1):
戦士→騎士, 格闘士→幻闘士, 守護魔導師→次元天導師, 精霊魔導師→召喚天導師, 黒印魔導師→錬金天導師, 盗賊→忍者
