# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

サービスを終了したオンラインゲーム「**ストラガーデンNEO**」のwikiをクローズ前にマークダウン化して保存するプロジェクト。最終的にはその情報をもとに一部の機能を切り出してゲームとして実装することを目指している。AIを活用してwikiを完全移植する方針。

コンテンツはすべて日本語のMarkdownで記述する。参考wiki:

- 本家 (優先): https://wiki.strugarden.pluslake.net/%E8%81%B7%E6%A5%AD/
- ミラー (本家で閲覧不可のページを補完): http://wikimirr.web.fc2.com/sgwiki.s172.xrea.com/index.phpA4CFA4B8A4E1A4CB.htm

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
│   └── status_abnormality.md
├── familiar/             # Familiar (pet monster) system — capture, contract, raising
├── items/
│   ├── armors/           # Armor by slot (head, arm, upper_body, lower_body, leg, shield)
│   ├── decorations/      # Accessory slots (ear, face, finger, neck, upper/lower body decoration)
│   └── weapons/          # Weapons by type (bow, dagger, katana, etc.)
└── jobs/                 # Job (class) data — base jobs and advanced jobs
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
