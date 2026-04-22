'use strict';

// ===== SPEED VALUES =====
const SPEED_VALUES = { S: 80, A: 60, B: 40, C: 20, D: 10 };

// ===== SKILL RANGE PATTERNS (local coords, facing UP = forward is -y) =====
const RANGE = {
  SELF:            [[0, 0]],
  MELEE_FRONT:     [[0, -1]],
  MELEE_SIDES:     [[-1, 0], [1, 0]],
  MELEE_FB:        [[0, -1], [0, 1]],
  MELEE_CROSS:     [[-1, 0], [1, 0], [0, -1], [0, 1]],
  MELEE_8:         [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]],
  FORWARD_1_2:     [[0,-1],[0,-2]],
  FORWARD_1_3:     [[0,-1],[0,-2],[0,-3]],
  FORWARD_1_4:     [[0,-1],[0,-2],[0,-3],[0,-4]],
  FORWARD_CONE:    [[-1,-1],[0,-1],[1,-1],[0,-2]],
};

// ===== EFFECT SHAPES (relative to target cell) =====
const EFFECT_SHAPE = {
  SINGLE:   [[0, 0]],
  CROSS_1:  [[0,0],[-1,0],[1,0],[0,-1],[0,1]],
  SQUARE_3: [[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]],
};

// ===== STATUS EFFECT DEFINITIONS =====
const STATUS_DEFS = {
  poison: {
    id: 'poison', name: '毒', emoji: '☠',
    onTurnStart(unit) { return { type: 'damage', amount: Math.max(1, Math.floor(unit.hp_max * 5 / 100)), element: 'poison' }; },
    category: 'debuff', color: '#5a2060',
  },
  sleep: {
    id: 'sleep', name: '睡眠', emoji: '💤',
    preventMove: true, preventAction: true, removeOnHit: true,
    category: 'debuff', color: '#204060',
  },
  freeze: {
    id: 'freeze', name: '凍結', emoji: '❄',
    preventMove: true, preventAction: true,
    onTurnStart(unit) { return { type: 'damage', amount: Math.max(1, Math.floor(unit.hp_max * 8 / 100)), element: 'cold' }; },
    category: 'debuff', color: '#1a4060',
  },
  paralysis: {
    id: 'paralysis', name: '麻痺', emoji: '⚡',
    preventAction: true,
    category: 'debuff', color: '#604020',
  },
  guard: {
    id: 'guard', name: '防御', emoji: '🛡',
    damageMult: 667,
    category: 'buff', color: '#204040',
  },
  atk_up: {
    id: 'atk_up', name: '攻撃↑', emoji: '⬆',
    atkMult: 1300,
    category: 'buff', color: '#602020',
  },
  def_down: {
    id: 'def_down', name: '防御↓', emoji: '⬇',
    defMult: 700,
    category: 'debuff', color: '#403010',
  },
  speed_up: {
    id: 'speed_up', name: 'SPD↑', emoji: '💨',
    speedBonus: 20,
    category: 'buff', color: '#204060',
  },
  regen: {
    id: 'regen', name: '回復', emoji: '✨',
    onTurnStart(unit) { return { type: 'heal', amount: Math.max(1, Math.floor(unit.hp_max * 8 / 100)) }; },
    category: 'buff', color: '#204020',
  },
};

// ===== SKILL DEFINITIONS =====
const SKILL_DEFS = {

  // ---- 戦士 ----
  side_web: {
    id: 'side_web', name: 'サイドウェブ', job: 'warrior', category: 'CMD',
    ap_cost: 15, speed_rank: 'B',
    attack_type: 'direct', element: 'physical_slash',
    range: RANGE.MELEE_SIDES, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 100, hit_count: 1,
    effects: [{ kind: 'damage' }],
    desc: '左右の敵に斬撃。斬撃/衝撃防御に有効',
  },
  vertical_web: {
    id: 'vertical_web', name: 'バーチカルウェブ', job: 'warrior', category: 'CMD',
    ap_cost: 15, speed_rank: 'B',
    attack_type: 'direct', element: 'physical_slash',
    range: RANGE.MELEE_FB, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 100, hit_count: 1,
    effects: [{ kind: 'damage' }],
    desc: '前後の敵に斬撃',
  },
  strash: {
    id: 'strash', name: 'ストラッシュ', job: 'warrior', category: 'CMD',
    ap_cost: 20, speed_rank: 'B',
    attack_type: 'direct', element: 'physical_slash',
    range: RANGE.FORWARD_1_2, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 150, hit_count: 1,
    effects: [{ kind: 'damage' }],
    desc: '前方1〜2マスに強力な斬撃',
  },
  guard: {
    id: 'guard', name: 'ガード', job: 'warrior', category: 'CMD',
    ap_cost: 10, speed_rank: 'S',
    attack_type: 'self', element: null,
    range: RANGE.SELF, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 0, hit_count: 1,
    effects: [{ kind: 'state_apply', state_id: 'guard', duration: 2 }],
    desc: '自身に防御(2T): ダメージ2/3',
  },
  crescent: {
    id: 'crescent', name: 'クレセント', job: 'warrior', category: 'CMD',
    ap_cost: 30, speed_rank: 'C',
    attack_type: 'direct', element: 'physical_slash',
    range: RANGE.FORWARD_CONE, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 200, hit_count: 1,
    effects: [{ kind: 'damage' }],
    desc: '前方扇状に強力な斬撃',
  },
  stinger: {
    id: 'stinger', name: 'スティンガー', job: 'warrior', category: 'CMD',
    ap_cost: 20, speed_rank: 'B',
    attack_type: 'direct', element: 'physical_pierce',
    range: RANGE.FORWARD_1_3, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 120, hit_count: 1,
    effects: [{ kind: 'damage' }],
    desc: '前方3マスに貫通攻撃',
  },

  // ---- 格闘士 ----
  rush: {
    id: 'rush', name: 'ラッシュ', job: 'fighter', category: 'CMD',
    ap_cost: 10, speed_rank: 'B',
    attack_type: 'direct', element: 'physical_impact',
    range: RANGE.MELEE_CROSS, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 80, hit_count: 1,
    effects: [{ kind: 'damage' }],
    desc: '隣接する敵に打撃',
  },
  kick: {
    id: 'kick', name: 'キック', job: 'fighter', category: 'CMD',
    ap_cost: 15, speed_rank: 'B',
    attack_type: 'direct', element: 'physical_impact',
    range: RANGE.MELEE_FRONT, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 100, hit_count: 1,
    effects: [{ kind: 'damage' }, { kind: 'push', amount: 2 }],
    desc: '前方の敵を2マス吹き飛ばす',
  },
  fight_style: {
    id: 'fight_style', name: 'ファイトスタイル', job: 'fighter', category: 'CMD',
    ap_cost: 5, speed_rank: 'S',
    attack_type: 'self', element: null,
    range: RANGE.SELF, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 0, hit_count: 1,
    effects: [{ kind: 'state_apply', state_id: 'atk_up', duration: 2 }],
    desc: '攻撃力上昇(2T)',
  },
  double_crash: {
    id: 'double_crash', name: 'ダブルクラッシュ', job: 'fighter', category: 'CMD',
    ap_cost: 25, speed_rank: 'B',
    attack_type: 'direct', element: 'physical_impact',
    range: RANGE.MELEE_CROSS, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 85, hit_count: 2,
    effects: [{ kind: 'damage' }],
    desc: '2連続打撃',
  },
  spin_attack: {
    id: 'spin_attack', name: 'スピンアタック', job: 'fighter', category: 'CMD',
    ap_cost: 30, speed_rank: 'B',
    attack_type: 'direct', element: 'physical_impact',
    range: RANGE.MELEE_8, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 110, hit_count: 1,
    effects: [{ kind: 'damage' }],
    desc: '周囲8マスに回転攻撃',
  },

  // ---- 盗賊 ----
  body_beat: {
    id: 'body_beat', name: 'ボディービート', job: 'thief', category: 'CMD',
    ap_cost: 10, speed_rank: 'B',
    attack_type: 'direct', element: 'physical_impact',
    range: RANGE.MELEE_CROSS, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 80, hit_count: 1,
    effects: [{ kind: 'damage' }],
    desc: '隣接する敵に打撃',
  },
  arrow_shoot: {
    id: 'arrow_shoot', name: 'アローシュート', job: 'thief', category: 'CMD',
    ap_cost: 15, speed_rank: 'B',
    attack_type: 'projectile', element: 'physical_pierce',
    range: RANGE.FORWARD_1_4, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 90, hit_count: 1,
    effects: [{ kind: 'damage' }],
    desc: '前方4マスに矢を放つ',
  },
  sleep_arrow: {
    id: 'sleep_arrow', name: 'スリープアロー', job: 'thief', category: 'CMD',
    ap_cost: 20, speed_rank: 'B',
    attack_type: 'projectile', element: 'physical_pierce',
    range: RANGE.FORWARD_1_4, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 60, hit_count: 1,
    effects: [{ kind: 'damage' }, { kind: 'state_apply', state_id: 'sleep', duration: 2, chance: 70 }],
    desc: '前方4マスに睡眠の矢(70%)',
  },
  poison_arrow: {
    id: 'poison_arrow', name: 'ポイズンアロー', job: 'thief', category: 'CMD',
    ap_cost: 20, speed_rank: 'C',
    attack_type: 'projectile', element: 'physical_pierce',
    range: RANGE.FORWARD_1_4, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 60, hit_count: 1,
    effects: [{ kind: 'damage' }, { kind: 'state_apply', state_id: 'poison', duration: 3, chance: 80 }],
    desc: '前方4マスに毒の矢(80%)',
  },
  gallop: {
    id: 'gallop', name: 'ギャロップ', job: 'thief', category: 'CMD',
    ap_cost: 10, speed_rank: 'S',
    attack_type: 'self', element: null,
    range: RANGE.SELF, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 0, hit_count: 1,
    effects: [{ kind: 'state_apply', state_id: 'speed_up', duration: 2 }],
    desc: 'スピード+20(2T)',
  },

  // ---- 守護魔導師 ----
  heal_self: {
    id: 'heal_self', name: 'ヒール', job: 'guardian', category: 'CMD',
    ap_cost: 20, speed_rank: 'B',
    attack_type: 'self', element: 'magical_holy',
    range: RANGE.SELF, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 0, hit_count: 1,
    effects: [{ kind: 'heal', ratio: 25 }],
    desc: '自身のHPを最大値の25%回復',
  },
  magic_shield: {
    id: 'magic_shield', name: 'マジックシールド', job: 'guardian', category: 'CMD',
    ap_cost: 15, speed_rank: 'S',
    attack_type: 'self', element: null,
    range: RANGE.SELF, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 0, hit_count: 1,
    effects: [{ kind: 'state_apply', state_id: 'guard', duration: 3 }],
    desc: 'ダメージ軽減バリア(3T)',
  },
  flame: {
    id: 'flame', name: 'フレイム', job: 'guardian', category: 'CMD',
    ap_cost: 20, speed_rank: 'C',
    attack_type: 'magic', element: 'magical_fire',
    range: RANGE.FORWARD_1_3, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 120, hit_count: 1,
    effects: [{ kind: 'damage' }],
    desc: '前方3マスに炎魔法',
  },
  graju: {
    id: 'graju', name: 'グラジュル', job: 'guardian', category: 'CMD',
    ap_cost: 25, speed_rank: 'C',
    attack_type: 'self', element: null,
    range: RANGE.SELF, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 0, hit_count: 1,
    effects: [{ kind: 'state_apply', state_id: 'regen', duration: 3 }],
    desc: '継続HP回復(3T)',
  },
  weakness: {
    id: 'weakness', name: 'ウィークネス', job: 'guardian', category: 'CMD',
    ap_cost: 15, speed_rank: 'B',
    attack_type: 'magic', element: 'magical_mental',
    range: RANGE.FORWARD_1_2, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 50, hit_count: 1,
    effects: [{ kind: 'damage' }, { kind: 'state_apply', state_id: 'def_down', duration: 2, chance: 70 }],
    desc: '防御力低下(70%)',
  },

  // ---- 精霊魔導師 ----
  fireball: {
    id: 'fireball', name: 'ファイアボール', job: 'spirit', category: 'CMD',
    ap_cost: 20, speed_rank: 'C',
    attack_type: 'magic', element: 'magical_fire',
    range: RANGE.FORWARD_1_3, effect_shape: EFFECT_SHAPE.CROSS_1,
    base_power: 130, hit_count: 1,
    effects: [{ kind: 'damage' }],
    desc: '前方3マスに炎球。着弾点十字爆発',
  },
  blizzard: {
    id: 'blizzard', name: 'ブリザード', job: 'spirit', category: 'CMD',
    ap_cost: 25, speed_rank: 'C',
    attack_type: 'magic', element: 'magical_cold',
    range: RANGE.FORWARD_1_4, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 100, hit_count: 1,
    effects: [{ kind: 'damage' }, { kind: 'state_apply', state_id: 'freeze', duration: 2, chance: 60 }],
    desc: '前方4マスに吹雪。凍結(60%)',
  },
  thunder: {
    id: 'thunder', name: 'サンダーボルト', job: 'spirit', category: 'CMD',
    ap_cost: 20, speed_rank: 'C',
    attack_type: 'magic', element: 'magical_electric',
    range: RANGE.FORWARD_1_4, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 110, hit_count: 1,
    effects: [{ kind: 'damage' }],
    desc: '前方4マスに電撃',
  },
  wind: {
    id: 'wind', name: 'ウィンド', job: 'spirit', category: 'CMD',
    ap_cost: 15, speed_rank: 'B',
    attack_type: 'magic', element: 'magical_cold',
    range: RANGE.MELEE_CROSS, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 70, hit_count: 1,
    effects: [{ kind: 'damage' }, { kind: 'push', amount: 2 }],
    desc: '隣接敵を風で2マス吹き飛ばす',
  },
  explosion: {
    id: 'explosion', name: 'エクスプロージョン', job: 'spirit', category: 'CMD',
    ap_cost: 35, speed_rank: 'D',
    attack_type: 'magic', element: 'magical_fire',
    range: RANGE.FORWARD_1_3, effect_shape: EFFECT_SHAPE.SQUARE_3,
    base_power: 220, hit_count: 1,
    effects: [{ kind: 'damage' }],
    desc: '前方3マスに巨大爆発。着弾点3×3',
  },

  // ---- 黒印魔導師 ----
  poison_cloud: {
    id: 'poison_cloud', name: 'ポイズンクラウド', job: 'black', category: 'CMD',
    ap_cost: 20, speed_rank: 'C',
    attack_type: 'magic', element: 'magical_poison',
    range: RANGE.FORWARD_1_3, effect_shape: EFFECT_SHAPE.CROSS_1,
    base_power: 60, hit_count: 1,
    effects: [{ kind: 'damage' }, { kind: 'state_apply', state_id: 'poison', duration: 3, chance: 80 }],
    desc: '前方3マスに毒霧。十字範囲で毒(80%)',
  },
  dark_bolt: {
    id: 'dark_bolt', name: 'ダークボルト', job: 'black', category: 'CMD',
    ap_cost: 25, speed_rank: 'C',
    attack_type: 'magic', element: 'magical_dark',
    range: RANGE.FORWARD_1_4, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 140, hit_count: 1,
    effects: [{ kind: 'damage' }],
    desc: '前方4マスに暗黒の光線',
  },
  sleep_spell: {
    id: 'sleep_spell', name: 'スリープ', job: 'black', category: 'CMD',
    ap_cost: 20, speed_rank: 'C',
    attack_type: 'magic', element: 'magical_mental',
    range: RANGE.FORWARD_1_2, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 0, hit_count: 1,
    effects: [{ kind: 'state_apply', state_id: 'sleep', duration: 3, chance: 75 }],
    desc: '前方の敵を睡眠状態に(75%)',
  },
  weakness_black: {
    id: 'weakness_black', name: 'ウィークネス', job: 'black', category: 'CMD',
    ap_cost: 15, speed_rank: 'B',
    attack_type: 'magic', element: 'magical_mental',
    range: RANGE.FORWARD_1_3, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 40, hit_count: 1,
    effects: [{ kind: 'damage' }, { kind: 'state_apply', state_id: 'def_down', duration: 2, chance: 80 }],
    desc: '防御力低下+ダメージ(80%)',
  },
  drain: {
    id: 'drain', name: 'ドレイン', job: 'black', category: 'CMD',
    ap_cost: 25, speed_rank: 'C',
    attack_type: 'magic', element: 'magical_dark',
    range: RANGE.MELEE_CROSS, effect_shape: EFFECT_SHAPE.SINGLE,
    base_power: 120, hit_count: 1,
    effects: [{ kind: 'damage' }, { kind: 'drain', ratio: 50 }],
    desc: '隣接敵のHPをダメージの50%吸収',
  },
};

// ===== JOB DEFINITIONS =====
const JOB_DEFS = {
  warrior: {
    id: 'warrior', name: '戦士', emoji: '⚔️', color: '#e05050',
    desc: '重装備の近距離戦士。高い防御力と多様な武器',
    stats: { hp_max: 120, ap_max: 100, attack: 80, defense: 40, hit_rate: 80, evade_rate: 30, speed: 40, movement: 3, cup: 1, cdn: 2 },
    skill_ids: ['side_web', 'vertical_web', 'strash', 'guard', 'crescent', 'stinger'],
  },
  fighter: {
    id: 'fighter', name: '格闘士', emoji: '👊', color: '#e07030',
    desc: '素手の格闘家。高い攻撃力と機動性',
    stats: { hp_max: 100, ap_max: 100, attack: 90, defense: 25, hit_rate: 85, evade_rate: 40, speed: 60, movement: 4, cup: 2, cdn: 3 },
    skill_ids: ['rush', 'kick', 'fight_style', 'double_crash', 'spin_attack'],
  },
  thief: {
    id: 'thief', name: '盗賊', emoji: '🏹', color: '#40c060',
    desc: '高い移動力と遠距離攻撃を持つスナイパー',
    stats: { hp_max: 80, ap_max: 100, attack: 70, defense: 20, hit_rate: 90, evade_rate: 50, speed: 60, movement: 5, cup: 1, cdn: 3 },
    skill_ids: ['body_beat', 'arrow_shoot', 'sleep_arrow', 'poison_arrow', 'gallop'],
  },
  guardian: {
    id: 'guardian', name: '守護魔導師', emoji: '🛡️', color: '#4090d0',
    desc: '防御と回復を得意とする魔導師',
    stats: { hp_max: 90, ap_max: 100, attack: 60, defense: 35, hit_rate: 75, evade_rate: 35, speed: 40, movement: 4, cup: 1, cdn: 1 },
    skill_ids: ['heal_self', 'magic_shield', 'flame', 'graju', 'weakness'],
  },
  spirit: {
    id: 'spirit', name: '精霊魔導師', emoji: '✨', color: '#a060d0',
    desc: '炎・冷気・電撃の属性魔法を操る攻撃魔導師',
    stats: { hp_max: 75, ap_max: 100, attack: 100, defense: 15, hit_rate: 80, evade_rate: 40, speed: 20, movement: 4, cup: 1, cdn: 1 },
    skill_ids: ['fireball', 'blizzard', 'thunder', 'wind', 'explosion'],
  },
  black: {
    id: 'black', name: '黒印魔導師', emoji: '💀', color: '#8060a0',
    desc: '状態異常と暗黒魔法を操る術者',
    stats: { hp_max: 80, ap_max: 100, attack: 85, defense: 20, hit_rate: 80, evade_rate: 35, speed: 20, movement: 4, cup: 1, cdn: 2 },
    skill_ids: ['poison_cloud', 'dark_bolt', 'sleep_spell', 'weakness_black', 'drain'],
  },
};

// ===== MAP HEIGHT GRID (8 rows × 10 cols, values 0-2) =====
const MAP_HEIGHTS = [
  [0,0,0,0,0,0,0,0,0,0],
  [0,0,1,1,0,0,1,1,0,0],
  [0,1,2,1,0,0,1,2,1,0],
  [0,0,1,2,1,1,2,1,0,0],
  [0,0,1,2,1,1,2,1,0,0],
  [0,1,2,1,0,0,1,2,1,0],
  [0,0,1,1,0,0,1,1,0,0],
  [0,0,0,0,0,0,0,0,0,0],
];

// ===== MAP DEFINITIONS =====
const MAP_DEF = {
  id: 'duel_basic',
  name: '基本デュエルマップ',
  width: 10,
  height: 8,
  // Spawn positions [col, row] for each team
  spawns: {
    0: [[3,6],[4,6],[5,6],[4,7],[5,7]],
    1: [[3,1],[4,1],[5,1],[4,0],[5,0]],
  },
  // Terrain (optional, most cells are default)
  terrain: {},
};
