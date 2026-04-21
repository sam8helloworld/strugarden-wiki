# 戦闘エンジン (決定論シミュレータ) 仕様

戦闘のコアは「入力と内部状態から、次の状態と発生イベントを決定論的に計算する純粋関数」として実装する。サーバ権威 + リプレイ + AI再生 に共通して使用される。

## 1. 設計原則

1. **純関数**: `engine.step(state, input) → (state', events[])` の形を取る。副作用なし。
2. **決定論性**: 同じ `(state, input)` から必ず同じ `(state', events[])` が得られる。浮動小数点非使用、整数演算ベースで、乱数は単一の `PRNG` インスタンスからのみ取得する。
3. **単一責務**: エンジンはステートマシンと物理シミュレーションのみ。永続化・通信・UIは外部レイヤに任せる。
4. **マスターデータ分離**: スキル・ジョブ・マップは設定として読み込む。エンジン自体にハードコードしない。
5. **イベントベース**: すべての状態変化はイベント列として記録し、外部レイヤ (UI/永続化) に渡す。

## 2. 状態モデル

`BattleState` は [`data_model.md`](./data_model.md) の `BattleSession` から通信レイヤ関連を除いたもの:

```
BattleState {
  rules, map, prng, turn, phase,
  units: list<BattleUnit>,
  projectiles, environment, event_log
}
```

## 3. 実行ループ

```
initial_state = BattleEngine.init(match_config, seed)
loop:
  input = collect_input(current_phase)  # 外部レイヤから供給
  (state', events) = BattleEngine.step(state, input)
  external.emit(events)
  external.persist(events)  # リプレイ用
  if state'.phase == finished: break
```

## 4. フェイズ別の解決手順

### 4.1 TurnStart Phase

```
for unit in state.units where not unit.is_ko:
  unit.ap = min(unit.ap_max, unit.ap + 10)
  apply_per_turn_states(unit):
    - 毒 → HP damage (floor=1)
    - 凍結 → 冷ダメージ
    - 炎上 → 炎ダメージ
    - グラジュル → HP heal
  tick_down_timed_effects(unit)
  if unit.hp <= 0 and not unit.is_ko: mark_ko(unit)

events += [{ kind: "turn_start", turn }]
transition phase → movement
```

### 4.2 Movement Phase

入力 `PhaseInput.moves` を受けて以下:

```
for (unit_id, move_cmd) in inputs:
  unit = state.find_unit(unit_id)
  if unit.is_ko or unit.has_state(IMMOBILE_STATES): continue
  validated_path = validate_path(unit, move_cmd.path)
  if validated_path is invalid: log_violation; continue
  # 全員の検証が済んだら、同時に移動
  pending_moves.append((unit, validated_path))

# 全ユニットを同時に解決 (衝突処理)
resolve_simultaneous_movement(pending_moves)

events += [{kind:"move", unit_id, from, to, facing}, ...]
transition phase → action
```

衝突処理:

- 2ユニットが同じマスに入る場合、スピードの高い方が先着 (残り1体は直前マスに停止) — **元仕様の挙動を確認要**。
- 先着でも重なるマスは `passable` チェックで再評価する。

### 4.3 Action Phase

行動フェイズの実装が最も複雑。以下の順で処理する:

```
# Step 1: 入力収集
commands = inputs.actions.items()  # list of (unit, ActionCommand)

# Step 2: ソート (スピード降順、ID昇順タイブレーク)
commands.sort(key = λ (u, c) : (-effective_speed(u, c), u.id))

# Step 3: 逐次解決
for (unit, cmd) in commands:
  if unit.is_ko: continue
  if unit.has_state(CANT_ACT): continue  # 麻痺/睡眠/凍結/石化
  
  # 妨害チェック (自分の行動までに受けたダメージ量で判定)
  if check_interrupt(unit, cmd): continue
  
  resolve_command(state, unit, cmd, events)

# Step 4: フェイズ終了処理
clear_phase_states(state)  # (0T)のステートを解除
transition phase → turn_end
```

#### resolve_command のディスパッチ

```
switch cmd.kind:
  case skill:           resolve_skill(unit, skill_id, target)
  case weapon_change:   perform_weapon_change(unit)   # 自由行動、APコスト0
  case retreat:         attempt_retreat(unit)         # モード依存
  case wait:             pass
  case summon_familiar:  summon(unit, familiar_id)
```

#### resolve_skill の概略

```
skill = SkillDef[skill_id]
if unit.ap < skill.ap_cost: fail
unit.ap -= skill.ap_cost

# 射程内検証
affected_cells = compute_range(unit.position, unit.facing, skill.range_shape)
if target not in affected_cells: fail (target out of range)

# 詠唱開始 (速度Sでないものはここで詠唱/気合いため状態に入る)
# 詠唱中は 回避率 -50%、被ダメージ +10%

# 対象解決
targets = resolve_targets(skill, unit, target_spec, state)
  # 経由攻撃なら射線上の全ユニット、直射なら最初のユニット etc.

# 各ターゲット処理
for t in targets:
  # バリア判定 (魔法/物理/状態異常/投射)
  if t.barrier_would_cancel(skill): consume_barrier(t, skill); continue
  
  # 透明/石化判定
  if t.is_untargetable(): continue
  
  # 命中判定
  if not hit_check(unit, t, skill): events.emit("miss", ...); continue
  
  # ダメージ計算
  dmg = compute_damage(unit, t, skill)
  apply_damage(t, dmg)
  events.emit("damage_dealt", ...)
  
  # 効果適用 (ノックバック/状態異常)
  for eff in skill.effects: apply_effect(unit, t, eff)
  
  # 反撃系ステートのチェック
  if t.has_state(DIRECT_COUNTER) and skill is direct:
    trigger_counterattack(t, unit, skill)

# KO判定
for u in state.units:
  if u.hp <= 0 and not u.is_ko: mark_ko(u)
```

### 4.4 TurnEnd Phase

```
for unit in state.units:
  decay_states(unit)  # 残ターン数 -1 → 0以下なら解除
  if unit.is_ko:
    unit.ko_countdown -= 1
    if unit.ko_countdown <= 0:
      remove_unit(unit)  # 屍消滅

# 勝敗判定
if check_victory(state): state.phase = finished
else:
  state.turn += 1
  state.phase = turn_start
```

## 5. ステート計算モジュール

### 5.1 状態異常テーブル

```
StateInteractionTable:
  map<(existing_state, new_state), action>
  action = enum { BLOCK, TRANSFORM, APPLY, OVERWRITE }
```

`battle_rules.md §5.2` の相関を表として持つ。追加・変更はマスターデータで行う。

### 5.2 バリア優先順

バリア同士の上書き/拒否は `BarrierInteractionTable` で管理。

```
BarrierInteractionTable:
  existing → incoming: ≧ / ＞ / ＜ / ＝
```

### 5.3 能力値の算出

```
effective_attack(unit) =
  base_attack
  + equipment.attack_sum
  + state_modifiers.attack_sum
  + psv_skill_bonuses

effective_defense(unit, element) =
  base_defense[element]
  + equipment.defense[element]
  + state_modifiers.defense[element]
```

PSVとアセント系の優先ルールも実装:

- アセント系: 加算
- PSV 能力上昇: 上書きの優先権あり → 同種の効果の場合、**PSVの値が優先**

### 5.4 向き・背後判定

```
is_back_attack(attacker, target) = 
  attacker.position is on the opposite side of target.facing
# 例: target.facing=up, attacker.position.y > target.position.y → back
```

## 6. 乱数管理

`PRNG` は単一インスタンス。以下で使用:

- 命中/回避判定
- 状態異常付与の確率 (低確率/高確率)
- ランダムターン数のドリフト (放心の選択スキル数、等)
- NPC (AI) の意思決定

実装:

```
prng = SplitMix64(seed)  # または xoshiro256++ 等、言語間で互換ある決定論PRNG
roll(prng) → int64
roll_range(prng, n) → 0..n-1
```

**絶対に `Math.random()` / グローバルPRNG を使わない。**

## 7. イベントスキーマ

外部に放出するイベントの種別 (必須):

```
turn_start            { turn }
phase_start           { phase }
move                  { unit_id, from, to, facing }
skill_started         { unit_id, skill_id, target, speed_rank }
skill_failed          { unit_id, reason: "ap" | "range" | "target_gone" | "interrupted" }
damage_dealt          { source, target, amount, element, is_back, was_crit, from_reflection }
state_applied         { target, state_id, duration, source }
state_removed         { target, state_id, reason }
state_transform       { target, from_state, to_state }
barrier_consumed      { target, barrier_id }
knockback             { target, vector, landed_at }
projectile_launched   { source, trajectory, passthrough, reflected_by? }
unit_ko               { unit_id, by }
unit_despawn          { unit_id }
counter_triggered     { source, skill_id }
turn_end              { turn }
phase_end             { phase }
match_ended           { result }
```

イベントは `seq` を持ち、時系列が確定的である。

## 8. 検証 (Conformance)

エンジンに対して以下のテストを用意:

1. **Golden Replayテスト**: 代表的な試合 (デッキA vs デッキB) のシードと入力を固定し、結果イベント列を比較。
2. **シンプルスキル単体テスト**: 1スキルずつ、標準ダミー相手への効果が想定通りか確認。
3. **状態相関テスト**: 状態異常テーブルの全セルについて、事前状態 × 適用スキル → 期待ステートの一致を確認。
4. **バリア相関テスト**: 同様にバリア同士の優先関係を網羅。
5. **決定論テスト**: 同一 `(seed, input)` を複数プロセスで実行し、結果が一致することを確認。
6. **クライアント/サーバ整合テスト**: 別実装 (例: TS版とGo版) がある場合、同一入力で同一イベント列になるか CI で検証。

## 9. AI (闘錬の間用)

- AIは「プレイヤー入力を生成する代理」として設計。エンジン本体に AI ロジックは入らない。
- AIモジュールは `BattleState` を読み取り、`PhaseInput` を返す純関数。
- 難易度別にポリシー (行動優先度テーブル、予測深度) を差し替え可能。

```
interface AIPolicy {
  decide_moves(state, my_units) → map<unit_id, MoveCommand>
  decide_actions(state, my_units) → map<unit_id, ActionCommand>
}
```

- MVPでは **スクリプト型 (ヒューリスティック)** で十分。後日モンテカルロ/探索系に差し替え可能な抽象を用意。

## 10. パフォーマンス指標

- 1ターンのサーバ側解決時間: < 100ms (5v5 フル編成想定)
- メモリ使用: 1セッションあたり < 10MB
- イベント列のサイズ: 1ターンあたり 数KB 程度を目安

## 11. 拡張ポイント

- **新スキル追加**: `SkillDef` と必要なら `SkillEffect` のハンドラを追加するだけでエンジン本体は変更不要。
- **新ステート追加**: `StateDef` と相関テーブルを追加する。
- **新マップ追加**: `MapDef` を追加、特殊地形が必要なら `CellEffect` の種類を追加する。
- **新モード追加**: エンジン共通、勝利条件判定と入場条件をモードモジュールに分離する。
