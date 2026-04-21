# データモデル

対人戦を構成するエンティティを、永続化対象 (DBに保存) と戦闘中ステート (メモリ/セッションストア) に分けて定義する。具体的なORM/DBは選ばず、**論理スキーマ**として記述する。型は `string | int | enum | list<T> | map<K,V>` 等の抽象表記。

## 1. 永続化エンティティ

### 1.1 アカウント・キャラクター

```
Account {
  id               string
  display_name     string
  email            string
  password_hash    string
  created_at       datetime
  last_login_at    datetime
}

Character {
  id               string
  account_id       string
  name             string
  job_main         JobId          # 基本6 + 上位6 の列挙
  job_side         JobId?         # サブジョブ (経験値1.5倍、上限はメインの半分)
  level_main       int
  level_side       int
  exp_main         int
  exp_side         int
  base_stats       CharacterStats # HP/AP max, 攻撃, 防御x10属性, 命中, 回避, 移動, スピード
  created_at       datetime
  country_id       CountryId      # 資源拠点争奪戦用 (Phase 3)
  guild_id         string?
}
```

### 1.2 ジョブ・スキル定義 (マスターデータ、読み取り専用)

```
JobDef {
  id                 JobId
  category           enum { basic, advanced }
  parent_job_id      JobId?           # 上位職の場合の下位職
  side_job_options   list<JobId>      # 選択可能サイドジョブ
  skill_tree         list<SkillNode>  # スキルツリー構造 (DAG)
  starting_equipment list<EquipmentId>
}

SkillNode {
  skill_id           SkillId
  prerequisites      list<SkillId>     # 前提スキル
  required_job_level int
  sidejob_level_req  int?              # サイドジョブで解放される場合
}

SkillDef {
  id                    SkillId
  name                  string
  category              enum { CMD, PSV, Contract }
  ap_cost               int
  speed                 enum { S, A, B, C, D }
  interrupt_durability  int
  element               SkillElement    # { physical, magical } × { 斬撃, 衝撃, ..., 暗黒 }
  type                  list<SkillType> # { 直接, 召喚, 投射, 直射, 曲射, 経由, 詠唱, 妨害性能 }
  required_weapon       list<WeaponType>?
  range_shape           list<(int,int)>  # (dx, dy) のオフセット集合 (詠唱者向き前提)
  effect_shape          list<(int,int)> | enum { SelectedOnly, RangeAll, PathThrough, NTargets(int) }
  base_power            int              # 攻撃倍率の基礎値
  effects               list<SkillEffect>   # ダメージ・ノックバック・状態付与
  special_flags         list<SkillFlag>
  description           string
  acquisition           list<AcquisitionSource>  # 入手手段 (☆等)
}

SkillEffect {
  kind    enum { damage, push, state_apply, heal, spawn_entity, summon_familiar }
  params  map<string, any>
}
```

### 1.3 装備・アイテム

```
Equipment {
  id                EquipmentId
  slot              enum { weapon, armor_upper, armor_lower, helmet, gauntlet, boots, shield, decoration_* }
  sub_type          enum             # 片手剣, 両手剣, 盾, ...
  weight            int
  level_required    int
  base_stats        StatsModifier    # 攻撃/防御/命中/回避/移動/段差許容 など
  special_flags     list<string>     # "F装備", "G装備", 特殊効果
  description       string
}

Item {
  id       ItemId
  category enum { consumable, deck_sheet, familiar_contract, map, amulet, other }
  # 消費可否・使用条件は category ごとに別拡張
}

Inventory {
  character_id   string
  equipped       map<slot, EquipmentId>
  bag            list<{ item_id, quantity }>
}
```

### 1.4 デッキ (戦闘用スキル枠)

```
DeckSheet {
  id              DeckSheetId
  name            string     # "初心者デッキ", "達人冒険者デッキ" ...
  cmd_slots       int        # CMDスキル枠数
  psv_slots       int        # PSVスキル枠数
  acquisition     string     # 入手方法 (元仕様 items/other/deck.md より)
}

CharacterDeck {
  character_id    string
  deck_sheet_id   DeckSheetId
  cmd_skills      list<SkillId>  # cmd_slots 以内
  psv_skills      list<SkillId>  # psv_slots 以内
  is_active       bool
}
```

### 1.5 ファミリア

```
FamiliarRace {
  id              FamiliarRaceId
  family          enum { flying, animal, demi_human, amphibian, fairy, demon }
  base_hp         int
  base_stats      map<stat, int>
  skill_pool      list<FamiliarSkillDef>
}

FamiliarSkillDef {
  skill_id        SkillId
  level_range     (int, int)
  kindness_range  (int, int)   # やさしさ/クール 習得条件
  wild_range      (int, int)   # ワイルド/かしこさ 習得条件
  category        enum { CMD, PSV, Contract }
}

Familiar {
  id              FamiliarId
  character_id    string
  race_id         FamiliarRaceId
  name            string
  level           int           # 0-10
  exp             int
  kindness        int
  coolness        int
  wildness        int
  cleverness      int
  learned_skills  list<SkillId>
  auto_summon     bool
  created_at      datetime
}

FamiliarContract {  # アイテム: 契約可能数を +1 増加 (最大5)
  character_id    string
  count           int
}
```

### 1.6 マッチ・リプレイ

```
MatchRecord {
  id              string
  mode            enum { duel, arena_duel, arena_guild, training_hall, conquest }
  started_at      datetime
  ended_at        datetime
  seed            int           # PRNGシード (リプレイ用)
  map_id          MapId
  rules           RulesSnapshot
  participants    list<MatchParticipant>
  result          MatchResult
  replay_ref      string?       # 別ストレージへの参照
}

MatchParticipant {
  slot_id         int
  team_id         int
  character_snapshot  CharacterSnapshot   # 開始時のキャラ状態固定スナップ
  deck_snapshot       DeckSnapshot
  familiars_snapshot  list<FamiliarSnapshot>
  is_leader       bool
}

MatchResult {
  winner_team_id  int?           # null ならドロー
  reason          enum { annihilation, flag, leader_killed, surrender, timeout }
  turn_count      int
  mvp_slot_id     int?
}

Replay {
  match_id        string
  events          list<GameEvent>   # 時系列イベント列 (後述)
  initial_state   BattleStateSnapshot
}
```

### 1.7 ランキング・ポイント系

```
ArenaSeason {
  id           string
  starts_at    datetime
  ends_at      datetime
}

PlayerArenaStats {
  character_id   string
  season_id      string
  mmr            int
  wins           int
  losses         int
  rank           int?          # 集計バッチで埋める
}

TrainingHallProgress {
  character_id   string
  current_rank   enum { ...戦豹, 猛虎, 荒獅子, 牙龍, 時空 }
  completed_ranks list<enum>
  achievement_certs list<ItemId>
}

PlayerConquestStats {
  character_id   string
  current_rank   int           # 1-10, 日次リセット
  lifetime_points int
  last_reset_at  datetime
}

GuildConquestStats {
  guild_id       string
  season_points  int
  lifetime_points int
}
```

## 2. 戦闘中 (In-Memory) ステート

戦闘サーバが保持する揮発性の状態。DB永続化は最小限 (リザルトとリプレイのみ)。

```
BattleSession {
  id                 string
  match_record_id    string
  mode               enum
  rules              RulesSnapshot
  map                MapGrid
  prng_state         int64       # 決定論のためシードから導出
  turn               int
  phase              enum { turn_start, movement, action, turn_end, finished }
  units              list<BattleUnit>
  projectiles        list<ProjectileEntity>
  environment        list<EnvEntity>     # 時限爆発マイン, 黒印 etc
  pending_inputs     map<player_id, PhaseInput>
  timer_deadline     datetime            # フェイズタイマー期限
  event_log          list<GameEvent>
}

BattleUnit {
  id              string            # ユニット一意ID (キャラorファミリア)
  owner_player_id string
  team_id         int
  slot_id         int
  kind            enum { character, familiar, summoned_entity }
  position        (int, int)        # グリッド座標
  facing          enum { up, down, left, right }
  hp              int
  ap              int
  deck_snapshot   DeckSnapshot
  equipped        map<slot, EquipmentSnapshot>
  states          list<StateInstance>     # 状態異常/バフ/デバフ
  is_leader       bool
  is_ko           bool
  ko_countdown    int?               # 戦闘不能からの消滅カウントダウン
}

StateInstance {
  id              StateId
  remaining_turns int            # (0T)=0, 永続は -1
  source_unit_id  string?
  metadata        map<string, any>
}

PhaseInput {
  turn            int
  phase           enum
  moves           map<unit_id, MoveCommand>
  actions         map<unit_id, ActionCommand>
}

MoveCommand {
  path       list<(int,int)>       # クライアントが計算した経路 (サーバで再検証)
  final_facing enum
}

ActionCommand {
  kind          enum { skill, weapon_change, retreat, wait, summon_familiar }
  skill_id      SkillId?
  target        TargetSpec?           # マスまたはユニット
  facing        enum?                 # 行動の向き (スキル発動方向)
}

GameEvent {
  seq         int
  turn        int
  phase       enum
  kind        enum { move, skill_used, damage_dealt, state_applied, unit_ko, phase_ended, match_ended, ... }
  payload     map<string, any>
}
```

## 3. マップモデル

```
MapDef {
  id          MapId
  name        string
  width       int
  height      int
  cells       matrix<Cell>
  spawn_zones map<team_id, list<(int,int)>>
  flag_cells  list<(int,int)>
  metadata    { biome, theme, recommended_players }
}

Cell {
  height       int
  passable     bool
  terrain      enum
  keep_out     bool
}

MapGrid {      # ランタイム用 (mapを載せるグリッド)
  map_def_id  MapId
  cells       matrix<CellRuntime>
}

CellRuntime extends Cell {
  current_entities  list<unit_id>    # このマスに乗っているユニット
  effects           list<CellEffect> # スティッキー, マドハンド, 黒印 etc
}
```

## 4. マスターデータ格納

- **ジョブ/スキル/装備/ファミリア/マップ/ステート相関表** はマスターデータ。運用中にバランス調整する。
- 形式は **YAML / JSON** を推奨 (バージョン管理しやすく、エンジンから読み込みやすい)。
- サーバ起動時にインメモリキャッシュに展開 → 戦闘エンジンからは参照のみ。
- クライアントにも同一マスターを配布 (UI 表示・事前検証用)。

## 5. スナップショット方針

戦闘開始時に **「キャラ/デッキ/装備/ファミリア」のスナップショット** を取り、`MatchParticipant` に記録する。以後の戦闘中に装備を変えてもマッチには影響しない。これにより:

- マッチ結果の再現性を保証できる
- プレイヤーが試合後に装備を入れ替えてもリプレイが成立する
