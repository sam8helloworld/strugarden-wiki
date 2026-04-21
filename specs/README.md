# ストラガーデンNEO 対人戦 再実装仕様

サービス終了したオンラインゲーム「ストラガーデンNEO」の **対人戦 (PvP) 部分** を切り出して単体ゲームとして実装するための仕様書群。

元ゲームの仕様は [`../docs`](../docs) にあるwiki移植Markdownと、本家wiki (<https://wiki.strugarden.pluslake.net/>) を一次ソースとする。本仕様書は実装を特定のライブラリや言語に縛らず、**どういうアーキテクチャ・データモデル・APIが必要か**という汎用的な観点でまとめる。

## 文書構成

| ファイル | 役割 |
|---------|------|
| [`overview.md`](./overview.md) | 対人戦のスコープ、プレイ体験、MVP/フル実装の段階 |
| [`battle_rules.md`](./battle_rules.md) | 戦闘ルール共通仕様 (ターン/フェイズ/グリッド/AP/スピード/方向判定等) |
| [`modes/duel.md`](./modes/duel.md) | デュエル (野良デュエル) |
| [`modes/arena.md`](./modes/arena.md) | 闘技場 (ギルド闘技場 / デュエル闘技場) |
| [`modes/training_hall.md`](./modes/training_hall.md) | 闘錬の間 (対NPCだが対人準拠の挙動) |
| [`modes/resource_base_battle.md`](./modes/resource_base_battle.md) | 資源拠点争奪戦 |
| [`data_model.md`](./data_model.md) | 永続化するエンティティとバトル中ステートのデータモデル |
| [`architecture.md`](./architecture.md) | システム全体のアーキテクチャ、役割分担、リアルタイム性の扱い |
| [`api.md`](./api.md) | クライアント/サーバ間の抽象API、バトルプロトコル |
| [`battle_engine.md`](./battle_engine.md) | 戦闘エンジン (決定論的シミュレータ) の内部仕様 |
| [`roadmap.md`](./roadmap.md) | 段階的実装プラン |

## 想定する読み方

1. `overview.md` で何を作るかを把握する
2. `battle_rules.md` で共通の戦闘ルールを理解する
3. `modes/*.md` で提供する対人戦モードごとの差分ルールを把握する
4. `data_model.md` → `architecture.md` → `api.md` → `battle_engine.md` の順で実装観点を読む
5. `roadmap.md` で実装順と依存関係を確認する

## スコープ外

本仕様書は「対人戦に直接関わる部分」に絞る。以下は原則スコープ外:

- メインクエスト・ミニクエスト・酒場クエストなどの単体PvEコンテンツ
- 生産スキル (調理・鍛冶・木工など) 全般
- ストラモール (課金ショップ) / ギルド運営 / コミュニケーション周辺機能
- ワールドマップ探索・町間移動

ただし以下は対人戦の前提として **簡易版を実装する必要がある**:

- キャラクター作成・ジョブ選択・ステータス/装備の管理
- デッキ (戦闘に持ち込むスキル枠) の編成
- ファミリア契約・簡易育成 (戦闘に召喚する範囲)
- マッチメイキングとマッチ結果の保存
