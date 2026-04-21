# API / プロトコル仕様

本仕様書では **抽象的なAPI契約** を定める。具体的な HTTP メソッドやプロトコル (REST / gRPC / GraphQL) は実装時に選択可能。ここでは「どんな操作が必要か」「どんなメッセージをやり取りするか」にフォーカスする。

API は大きく以下に分かれる:

1. **Auth API** — 認証・認可
2. **Character API** — キャラクター・装備・デッキ
3. **Familiar API** — ファミリア関連
4. **Matchmaking API** — マッチング用
5. **Battle Protocol** — 戦闘中のリアルタイム通信
6. **Replay API** — リプレイ・マッチ履歴
7. **Ranking API** — ランキング情報
8. **Resource Base Battle API** — 争奪戦専用

## 1. Auth API

```
POST /auth/signup       { email, password, display_name } → { account_id, token }
POST /auth/login        { email, password }              → { token, refresh_token }
POST /auth/refresh      { refresh_token }                → { token }
POST /auth/logout       (auth)                           → 204
```

認証後のすべてのリクエストは `Bearer token` を添付。

## 2. Character API

```
POST   /characters                  { name, job_main, job_side? } → Character
GET    /characters                  (auth)                          → list<CharacterSummary>
GET    /characters/:id                                              → Character + Inventory + Decks
PATCH  /characters/:id              { name?, job_side? }            → Character
DELETE /characters/:id                                              → 204

POST   /characters/:id/equipment    { slot, equipment_id }          → Inventory
PATCH  /characters/:id/equipment    { slot → equipment_id, ... }    → Inventory

GET    /characters/:id/decks                                        → list<CharacterDeck>
POST   /characters/:id/decks        { deck_sheet_id, cmd_skills[], psv_skills[] } → CharacterDeck
PATCH  /characters/:id/decks/:deck_id { cmd_skills[], psv_skills[] }→ CharacterDeck
DELETE /characters/:id/decks/:deck_id                               → 204
PATCH  /characters/:id/decks/:deck_id/activate                      → 200
```

## 3. Familiar API

```
POST   /characters/:id/familiars                        { race_id, name } → Familiar
                                                           # 捕獲成功後の内部API。捕獲フロー自体はPvEで扱うため本仕様書スコープ外
GET    /characters/:id/familiars                                            → list<Familiar>
PATCH  /characters/:id/familiars/:fid                  { name?, auto_summon? } → Familiar
DELETE /characters/:id/familiars/:fid                                       → 204 (契約破棄)

POST   /characters/:id/familiars/:fid/train            { action: "play" | "errand" | "feed" } → Familiar
                                                                           # 育成: しぬほどあそぶ / おつかいさせる / 食べ物
```

## 4. Matchmaking API

```
GET    /modes                               → list<GameMode>
GET    /maps                                → list<MapSummary>

# デュエル: ルーム制
POST   /duel/rooms          { rules, max_players, visibility }      → DuelRoom
GET    /duel/rooms/:id                                              → DuelRoom
POST   /duel/rooms/:id/join { character_id, team_id, deck_id }      → RoomMember
POST   /duel/rooms/:id/leave                                        → 204
POST   /duel/rooms/:id/ready                                        → RoomMember
POST   /duel/rooms/:id/start  (host)                                → { session_id, realtime_endpoint }

# 闘技場: キュー制
POST   /arena/queue/duel       { character_id, deck_id }            → QueueTicket
POST   /arena/queue/guild      { guild_id, roster[] }               → QueueTicket
GET    /arena/queue/:ticket_id                                      → QueueTicketState
DELETE /arena/queue/:ticket_id                                      → 204

# 闘錬の間: 即開始
POST   /training_hall/start   { character_id, rank_id, deck_id }    → { session_id, realtime_endpoint }
```

### 主要レスポンス型

```
GameMode { id, display_name, description, default_rules, unlock_condition }

DuelRoom {
  id, host_id, rules, visibility, created_at, members: list<RoomMember>
}
RoomMember { account_id, character_id, team_id, deck_id, ready: bool }

QueueTicket {
  id, mode, created_at, estimated_wait_sec, state: enum { waiting, matched, expired }
}

BattleHandshake {
  session_id      string
  realtime_endpoint string  # ws(s)://.../battle?sid=... 等
  match_seed      int
  participants    list<ParticipantPublicInfo>
}
```

## 5. Battle Protocol (リアルタイム)

戦闘中はWebSocketまたはgRPC streamを想定。メッセージは方向と `type` で識別。

### 5.1 クライアント → サーバ

```
Join          { session_id, token }
SubmitMove    { turn, unit_id, path: list<(x,y)>, final_facing }
SubmitAction  { turn, unit_id, action: ActionCommand }
ConfirmPhase  { turn, phase }        # 入力確定を明示
Surrender     { }
RequestRematch { }                   # 試合後のみ有効 (デュエル等)
Ping          { ts }
```

### 5.2 サーバ → クライアント

```
SessionInit       { initial_state: BattleStateSnapshot, rules, map, your_units: list<unit_id> }
PhaseStart        { turn, phase, deadline_ts }
InputAck          { turn, phase, unit_id }           # SubmitMove/Action 受領確認
PhaseResolved     { turn, phase, events: list<GameEvent>, new_state_diff: StateDiff }
UnitKO            { unit_id, turn }                  # 通知イベント (補助的)
MatchEnded        { result: MatchResult }
OpponentLeft      { account_id }
Error             { code, message }
Pong              { ts, server_ts }
```

### 5.3 `GameEvent` の型例

```
events:
  - { kind: "move", unit_id, from:(x,y), to:(x,y), facing }
  - { kind: "skill_started", unit_id, skill_id, target, speed_rank }
  - { kind: "damage_dealt", source: unit_id, target: unit_id, amount, element, is_back, crit: bool }
  - { kind: "state_applied", target, state_id, remaining_turns }
  - { kind: "state_removed", target, state_id, reason }
  - { kind: "unit_ko", unit_id }
  - { kind: "projectile_fired", from, to, passthrough_units }
  - { kind: "barrier_consumed", target, barrier_id }
  - { kind: "counter_triggered", source, skill_id }
```

クライアントはこのイベント列を再生してアニメーションを作る。サーバはイベント列を `Replay` として永続化する。

### 5.4 タイミング

- `PhaseStart` でクライアントは入力UIを開く
- `deadline_ts` (サーバ時刻) までに `ConfirmPhase` を送らないと `wait` 扱い
- 両チームの `ConfirmPhase` 到達 or タイムアウトで `PhaseResolved` を発行

## 6. Replay API

```
GET  /matches              (auth) ?character_id=... → list<MatchSummary>
GET  /matches/:id                                    → MatchRecord + Replay URL
GET  /replays/:match_id                              → Replay (ストリーミング可能な形式)
POST /replays/:match_id/public { public: bool }      → 204  # 公開設定
```

クライアントは `Replay` を取得後、戦闘エンジンの **観戦モード** でレンダリングする (シード + イベント列から状態復元)。

## 7. Ranking API

```
GET /ranking/arena/duel      ?season=current        → list<RankingRow>
GET /ranking/arena/guild     ?season=current        → list<RankingRow>
GET /ranking/conquest/factions                      → list<FactionRanking>
GET /ranking/conquest/guilds                        → list<RankingRow>
GET /ranking/training_hall                          → list<RankingRow>   # 任意 (到達ランク順)
```

ページングは `?limit=100&offset=0` またはカーソル型 `?cursor=...` を推奨。

## 8. Resource Base Battle API (Phase 3)

```
GET  /conquest/bases                       → list<BaseStatus>
GET  /conquest/bases/:id                   → BaseStatus + 時系列グラフ
POST /conquest/queue   { party[], base_id } → QueueTicket    # 時間帯外は 409
GET  /conquest/stats/me                    → PlayerConquestStats
GET  /conquest/stats/guild/:id             → GuildConquestStats
```

## 9. エラーハンドリング

共通エラー形式:

```
{
  "error": {
    "code": "DECK_INVALID",            # マシンリーダブルなコード
    "message": "CMD slots exceeded",   # 人間可読
    "details": { ... }                  # 追加情報
  }
}
```

主要コード:

- `AUTH_REQUIRED`, `AUTH_INVALID`
- `NOT_FOUND`
- `VALIDATION_FAILED`
- `QUEUE_CONFLICT`
- `SESSION_INVALID`
- `PHASE_TIMEOUT`
- `RATE_LIMITED`
- `MATCH_ALREADY_ENDED`

## 10. API バージョニング

- リアルタイムプロトコルは `SessionInit` に `protocol_version` を含め、互換性チェック。
- REST エンドポイントは `/v1/...` プレフィックス、または `Accept: application/vnd.strugarden.v1+json` で切替。
