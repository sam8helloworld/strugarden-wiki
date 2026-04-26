'use strict';

// ===== SIMPLE DETERMINISTIC PRNG (xorshift32) =====
class PRNG {
  constructor(seed) { this.s = seed >>> 0 || 1; }
  next() {
    this.s ^= this.s << 13;
    this.s ^= this.s >>> 17;
    this.s ^= this.s << 5;
    return (this.s >>> 0);
  }
  // 0..n-1
  rollRange(n) { return (this.next() % n + n) % n; }
  // 0..99 (percent)
  rollPercent() { return this.rollRange(100); }
}

// ===== GEOMETRY HELPERS =====

// Rotate local offset (dx,dy) for a given facing direction
// Local coord: facing UP means (0,-1) is "forward"
function rotateOffset(dx, dy, facing) {
  switch (facing) {
    case 'up':    return [dx, dy];
    case 'down':  return [-dx, -dy];
    case 'left':  return [-dy, dx];
    case 'right': return [dy, -dx];
    default:      return [dx, dy];
  }
}

// Compute all world cells reachable by skill range from (cx, cy) facing 'facing'
// Returns array of [wx, wy] within [0,W-1] x [0,H-1]
function computeRangeCells(cx, cy, rangePattern, facing, mapW, mapH) {
  const cells = [];
  for (const [dx, dy] of rangePattern) {
    const [rdx, rdy] = rotateOffset(dx, dy, facing);
    const wx = cx + rdx;
    const wy = cy + rdy;
    if (wx >= 0 && wx < mapW && wy >= 0 && wy < mapH) {
      cells.push([wx, wy]);
    }
  }
  return cells;
}

// All cells reachable given ANY facing (used to highlight all possible attack targets)
function computeRangeCellsAllFacings(cx, cy, rangePattern, mapW, mapH) {
  const set = new Set();
  const cells = [];
  for (const f of ['up','down','left','right']) {
    for (const [wx, wy] of computeRangeCells(cx, cy, rangePattern, f, mapW, mapH)) {
      const key = `${wx},${wy}`;
      if (!set.has(key)) { set.add(key); cells.push([wx, wy]); }
    }
  }
  return cells;
}

// Height-aware 4-directional BFS with path reconstruction
// Returns { reachable: [[x,y],...], getPath(tx,ty): [[x,y],...], dist: Map }
function bfsMovement(fromPos, unit, allUnits, budget, placedObjects = [], mapDef = MAP_DEF) {
  const [sx, sy] = fromPos;
  const mapHeights = mapDef.heights;
  const occ = new Set(
    allUnits.filter(u => u.id !== unit.id && !u.ko).map(u => `${u.pos[0]},${u.pos[1]}`)
  );
  // Obstacles: static map obstacles + placed objects that block movement
  const obsSet = new Set((mapDef.obstacles || []).map(([ox, oy]) => `${ox},${oy}`));
  for (const obj of placedObjects) {
    if (obj.blocksMovement !== false) obsSet.add(`${obj.pos[0]},${obj.pos[1]}`);
  }

  const dist = new Map();
  const prev = new Map(); // key → [px, py]
  dist.set(`${sx},${sy}`, 0);
  const queue = [[sx, sy, 0]];
  const reachable = [];

  while (queue.length) {
    const [x, y, d] = queue.shift();
    if (d > 0) reachable.push([x, y]);
    if (d >= budget) continue;
    const fromH = mapHeights[y][x];
    for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + ddx, ny = y + ddy;
      if (nx < 0 || nx >= mapDef.width || ny < 0 || ny >= mapDef.height) continue;
      if (occ.has(`${nx},${ny}`)) continue;
      if (obsSet.has(`${nx},${ny}`)) continue;
      const toH = mapHeights[ny][nx];
      if (toH - fromH > unit.cup) continue;
      if (fromH - toH > unit.cdn) continue;
      const key = `${nx},${ny}`;
      const nd = d + 1;
      if (!dist.has(key) || dist.get(key) > nd) {
        dist.set(key, nd);
        prev.set(key, [x, y]);
        queue.push([nx, ny, nd]);
      }
    }
  }

  function getPath(tx, ty) {
    const tKey = `${tx},${ty}`;
    if (!prev.has(tKey)) return [];
    const path = [];
    let cur = tKey;
    while (cur) {
      const [cx, cy] = cur.split(',').map(Number);
      path.unshift([cx, cy]);
      const p = prev.get(cur);
      cur = p ? `${p[0]},${p[1]}` : null;
    }
    // Remove start position; return only the steps from start to target
    return path.slice(1);
  }

  return { reachable, getPath, dist };
}

// Backward-compat wrapper used by AI
function computeMovementRange(unit, units, mapW, mapH, placedObjects = [], mapDef = MAP_DEF) {
  return bfsMovement(unit.pos, unit, units, unit.movement, placedObjects, mapDef).reachable;
}

// Determine which facing makes 'target' reachable for a skill range
function facingForTarget(cx, cy, tx, ty, rangePattern) {
  for (const f of ['up','down','left','right']) {
    for (const [wx, wy] of computeRangeCells(cx, cy, rangePattern, f, 100, 100)) {
      if (wx === tx && wy === ty) return f;
    }
  }
  return null; // unreachable from any facing
}

// Direction between two positions
function directionBetween(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

// Back-attack check: attacker comes from behind target
function isBackAttack(attacker, target) {
  const [ax, ay] = attacker.pos;
  const [tx, ty] = target.pos;
  switch (target.facing) {
    case 'up':    return ay > ty;
    case 'down':  return ay < ty;
    case 'left':  return ax > tx;
    case 'right': return ax < tx;
  }
  return false;
}

// ===== DAMAGE CALCULATION (spec §4.5) =====
function computeDamage(attacker, target, skill, prng) {
  if (skill.base_power === 0) return 0;

  // Effective ATK
  let atk = attacker.attack;
  for (const st of attacker.states) {
    const def = STATUS_DEFS[st.id];
    if (def && def.atkMult) atk = Math.floor(atk * def.atkMult / 1000);
  }

  // Effective DEF
  let def = target.defense;
  for (const st of target.states) {
    const sdef = STATUS_DEFS[st.id];
    if (sdef && sdef.defMult) def = Math.floor(def * sdef.defMult / 1000);
  }

  // RAW (×1000 scale)
  const raw = Math.floor((skill.base_power * atk * 1000) / (atk + def * 2 + 100));

  // Situational multipliers (all in ×1/1000 scale)
  let mult = 1000;

  // Back attack
  if (isBackAttack(attacker, target)) mult = Math.floor(mult * 1300 / 1000);

  // Target has guard state
  for (const st of target.states) {
    const sdef = STATUS_DEFS[st.id];
    if (sdef && sdef.damageMult) mult = Math.floor(mult * sdef.damageMult / 1000);
  }

  // Critical hit
  const critChance = Math.max(0, Math.min(25, 5 + Math.floor((attacker.hit_rate - target.evade_rate) / 10)));
  const isCrit = prng.rollPercent() < critChance;
  if (isCrit) mult = Math.floor(mult * 1400 / 1000);

  // ±5% variance
  const variance = 950 + prng.rollRange(101);
  mult = Math.floor(mult * variance / 1000);

  // Final
  let damage = Math.floor((raw * mult) / (1000 * 1000));
  damage = Math.max(1, Math.min(damage, Math.floor(target.hp_max * 60 / 100)));

  return { damage, isCrit };
}

// ===== STATE APPLICATION =====
function applyState(unit, stateId, duration, sourceId) {
  const def = STATUS_DEFS[stateId];
  if (!def) return null;

  // Check for existing state (overwrite with new duration)
  const existing = unit.states.find(s => s.id === stateId);
  if (existing) {
    existing.remaining = duration;
    existing.source = sourceId;
    return { overwritten: true, stateId, duration };
  }

  unit.states.push({ id: stateId, remaining: duration, source: sourceId });
  return { applied: true, stateId, duration };
}

function removeState(unit, stateId) {
  const idx = unit.states.findIndex(s => s.id === stateId);
  if (idx >= 0) { unit.states.splice(idx, 1); return true; }
  return false;
}

function hasState(unit, stateId) {
  return unit.states.some(s => s.id === stateId);
}

// ===== UNIT FACTORY =====
function createUnit(id, teamId, jobId, deckSkillIds, spawnPos) {
  const job = JOB_DEFS[jobId];
  const stats = { ...job.stats };
  return {
    id,
    teamId,
    jobId,
    name: `${job.name}`,
    pos: [...spawnPos],
    facing: teamId === 0 ? 'up' : 'down',
    hp: stats.hp_max,
    hp_max: stats.hp_max,
    ap: stats.ap_max,
    ap_max: stats.ap_max,
    attack: stats.attack,
    defense: stats.defense,
    hit_rate: stats.hit_rate,
    evade_rate: stats.evade_rate,
    speed: stats.speed,
    movement: stats.movement,
    cup: stats.cup !== undefined ? stats.cup : 1,
    cdn: stats.cdn !== undefined ? stats.cdn : 2,
    deck: [...deckSkillIds],
    states: [],
    ko: false,
    ko_countdown: 0,
    damageTakenThisTurn: 0,
  };
}

// ===== BATTLE STATE =====
function initBattle(config) {
  // config: { mode, p1: {jobId, deckIds}, p2: {jobId, deckIds}, seed }
  const prng = new PRNG(config.seed || Date.now());
  const map = MAP_DEF;
  const spawn0 = map.spawns[0];
  const spawn1 = map.spawns[1];

  const units = [
    createUnit('p1', 0, config.p1.jobId, config.p1.deckIds, spawn0[0]),
    createUnit('p2', 1, config.p2.jobId, config.p2.deckIds, spawn1[0]),
  ];

  return {
    map,
    prng,
    turn: 1,
    phase: 'turn_start',
    units,
    events: [],
    winner: null,
    placedObjects: [],   // { id, teamId, pos, obj_type, hp, duration, ... }
    pendingMoves: {},    // unitId → [tx, ty]
    pendingActions: {},  // unitId → ActionCommand
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

// ===== PHASE PROCESSORS =====

function processTurnStart(state) {
  const events = [];
  events.push({ type: 'phase', label: `── ターン ${state.turn} 開始 ──` });

  for (const unit of state.units) {
    if (unit.ko) continue;

    // AP recovery
    const apGain = Math.min(10, unit.ap_max - unit.ap);
    unit.ap += apGain;
    if (apGain > 0) events.push({ type: 'ap_gain', unitId: unit.id, amount: apGain });

    // Per-turn state effects
    for (const st of [...unit.states]) {
      const def = STATUS_DEFS[st.id];
      if (!def || !def.onTurnStart) continue;
      const result = def.onTurnStart(unit);
      if (result.type === 'damage') {
        unit.hp = Math.max(0, unit.hp - result.amount);
        events.push({ type: 'dot_damage', unitId: unit.id, amount: result.amount, element: result.element, statusName: def.name });
      } else if (result.type === 'heal') {
        const actualHeal = Math.min(result.amount, unit.hp_max - unit.hp);
        unit.hp = Math.min(unit.hp_max, unit.hp + result.amount);
        events.push({ type: 'heal', unitId: unit.id, amount: actualHeal, source: 'regen' });
      }
    }

    // Reset damageTakenThisTurn
    unit.damageTakenThisTurn = 0;

    // KO check
    if (unit.hp <= 0 && !unit.ko) {
      unit.ko = true;
      unit.ko_countdown = 3;
      events.push({ type: 'ko', unitId: unit.id });
    }
  }

  state.phase = 'movement';
  return events;
}

// paths: { unitId: [[x,y], ...] } — sequence of cells to move through (excludes start)
// facings: { unitId: 'up'|'down'|'left'|'right' } — player-chosen facing at destination
function processMovement(state, paths, facings = {}) {
  const events = [];
  events.push({ type: 'phase', label: '── 移動フェイズ ──' });

  for (const unit of state.units) {
    if (unit.ko) continue;
    if (hasState(unit, 'sleep') || hasState(unit, 'freeze')) continue;

    const path = paths && paths[unit.id];
    const [ox, oy] = unit.pos;

    if (path && path.length > 0) {
      const [tx, ty] = path[path.length - 1];
      if (tx !== ox || ty !== oy) {
        unit.pos = [tx, ty];
        events.push({ type: 'move', unitId: unit.id, from: [ox, oy], to: [tx, ty] });
      }
    }

    // Apply player-chosen facing (overrides movement direction)
    if (facings[unit.id]) {
      unit.facing = facings[unit.id];
    } else if (path && path.length >= 2) {
      // Fall back to movement direction for AI / no-facing-choice
      const dest = path[path.length - 1];
      const prev = path[path.length - 2] || [ox, oy];
      unit.facing = directionBetween(prev[0], prev[1], dest[0], dest[1]);
    }
  }

  state.pendingMoves = {};
  state.phase = 'action';
  return events;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Animate simultaneous movement step-by-step.
// paths: { unitId: [[x,y],...] } — steps from start (excluding start position)
// renderFn: function(state) — called after each animation frame
async function animateMoves(state, paths, renderFn) {
  const flatPaths = Object.entries(paths).map(([id, path]) => {
    const unit = state.units.find(u => u.id === id);
    if (!unit) return null;
    // Prepend current position so animation starts from where the unit stands
    return { unit, path: [unit.pos, ...path], origPos: [...unit.pos] };
  }).filter(Boolean);

  const maxLen = Math.max(...flatPaths.map(fp => fp.path.length), 1);
  if (maxLen <= 1) return;

  for (let i = 0; i < maxLen; i++) {
    const frame = flatPaths.map(fp => ({
      unit: fp.unit,
      pos: [...fp.path[Math.min(i, fp.path.length - 1)]],
    }));

    // Collision: if two units land on the same cell, the faster one wins
    for (let a = 0; a < frame.length; a++) {
      for (let b = a + 1; b < frame.length; b++) {
        if (frame[a].pos[0] === frame[b].pos[0] && frame[a].pos[1] === frame[b].pos[1]) {
          const spdA = frame[a].unit.speed, spdB = frame[b].unit.speed;
          const loser = spdA >= spdB ? frame[b] : frame[a];
          const loserFp = flatPaths.find(fp => fp.unit.id === loser.unit.id);
          loser.pos = [...loserFp.path[Math.max(0, i - 1)]];
          loser.unit._collided = true;
        }
      }
    }

    for (const { unit, pos } of frame) unit.pos = pos;
    renderFn(state);
    await sleep(200);
    for (const { unit } of frame) delete unit._collided;
  }

  // Restore original positions; processMovement will set the final state
  for (const fp of flatPaths) fp.unit.pos = fp.origPos;
}

function processAction(state) {
  const events = [];
  events.push({ type: 'phase', label: '── 行動フェイズ ──' });

  // Sort by effective speed (descending), unit ID as tiebreak
  const commands = Object.entries(state.pendingActions)
    .map(([uid, cmd]) => ({ unit: state.units.find(u => u.id === uid), cmd }))
    .filter(({ unit }) => unit && !unit.ko);

  commands.sort((a, b) => {
    const sa = effectiveSpeed(a.unit, a.cmd);
    const sb = effectiveSpeed(b.unit, b.cmd);
    if (sb !== sa) return sb - sa;
    return a.unit.id < b.unit.id ? -1 : 1;
  });

  for (const { unit, cmd } of commands) {
    if (unit.ko) continue;
    if (cmd.kind === 'wait') {
      events.push({ type: 'wait', unitId: unit.id });
      continue;
    }
    if (cmd.kind === 'skill') {
      const skillEvents = resolveSkill(state, unit, cmd);
      events.push(...skillEvents);
    }
  }

  state.pendingActions = {};
  state.phase = 'turn_end';
  return events;
}

function effectiveSpeed(unit, cmd) {
  let spd = unit.speed;
  for (const st of unit.states) {
    const def = STATUS_DEFS[st.id];
    if (def && def.speedBonus) spd += def.speedBonus;
  }
  if (cmd.kind === 'skill') {
    const skill = SKILL_DEFS[cmd.skillId];
    if (skill) spd = SPEED_VALUES[skill.speed_rank] + spd * 0.1; // base speed rank + small unit speed bonus
  }
  return spd;
}

function resolveSkill(state, unit, cmd) {
  const events = [];
  const skill = SKILL_DEFS[cmd.skillId];
  if (!skill) return events;

  // AP check
  if (unit.ap < skill.ap_cost) {
    events.push({ type: 'skill_fail', unitId: unit.id, skillId: cmd.skillId, reason: 'AP不足' });
    return events;
  }

  // Can't act check (sleep, freeze, paralysis)
  if (hasState(unit, 'sleep') || hasState(unit, 'freeze') || hasState(unit, 'paralysis')) {
    events.push({ type: 'skill_fail', unitId: unit.id, skillId: cmd.skillId, reason: '行動不能' });
    return events;
  }

  unit.ap -= skill.ap_cost;
  events.push({ type: 'skill_start', unitId: unit.id, skillId: cmd.skillId, skillName: skill.name });

  // Self-targeting skills
  if (skill.attack_type === 'self') {
    events.push(...applySkillEffects(state, unit, unit, skill, null));
    return events;
  }

  // Target validation
  const [tx, ty] = cmd.target;
  const neededFacing = facingForTarget(unit.pos[0], unit.pos[1], tx, ty, skill.range);
  if (!neededFacing) {
    events.push({ type: 'skill_fail', unitId: unit.id, skillId: cmd.skillId, reason: '射程外' });
    return events;
  }
  unit.facing = neededFacing;

  // Place-object skills: place at target cell, no unit-hit loop needed
  const hasPlaceEffect = skill.effects.some(e => e.kind === 'place_object');
  if (hasPlaceEffect) {
    for (const eff of skill.effects) {
      if (eff.kind === 'place_object') {
        if (!state.placedObjects) state.placedObjects = [];
        const obj = {
          id: `obj_${state.turn}_${unit.id}_${state.placedObjects.length}`,
          teamId: unit.teamId,
          pos: [tx, ty],
          obj_type: eff.obj_type,
          hp: eff.hp || 30,
          duration: eff.duration || 5,
          damage_on_contact: eff.damage_on_contact || 0,
          heal_on_step: eff.heal_on_step || 0,
          blocksMovement: true,
        };
        state.placedObjects.push(obj);
        events.push({ type: 'place_object', unitId: unit.id, obj });
      }
    }
    return events;
  }

  // Compute effect area
  const effectCells = [];
  for (const [edx, edy] of skill.effect_shape) {
    const ex = tx + edx, ey = ty + edy;
    if (ex >= 0 && ex < state.map.width && ey >= 0 && ey < state.map.height) {
      effectCells.push([ex, ey]);
    }
  }

  // Find targets in effect area
  const targets = state.units.filter(u => !u.ko && effectCells.some(([ex, ey]) => u.pos[0] === ex && u.pos[1] === ey));
  if (targets.length === 0) {
    events.push({ type: 'skill_miss_all', unitId: unit.id });
    return events;
  }

  for (const target of targets) {
    // Hit check
    const baseHit = 80;
    const hitChance = Math.max(5, Math.min(99, baseHit + unit.hit_rate - target.evade_rate));
    if (state.prng.rollPercent() >= hitChance) {
      events.push({ type: 'miss', unitId: unit.id, targetId: target.id });
      continue;
    }

    // Remove sleep if hit
    if (hasState(target, 'sleep')) {
      removeState(target, 'sleep');
      events.push({ type: 'state_removed', unitId: target.id, stateId: 'sleep', reason: '攻撃で覚醒' });
    }

    const hitCount = skill.hit_count || 1;
    for (let h = 0; h < hitCount; h++) {
      events.push(...applySkillEffects(state, unit, target, skill, [tx, ty]));
    }
  }

  return events;
}

function applySkillEffects(state, source, target, skill, targetPos) {
  const events = [];

  for (const eff of skill.effects) {
    if (eff.kind === 'damage') {
      const { damage, isCrit } = computeDamage(source, target, skill, state.prng);
      target.hp = Math.max(0, target.hp - damage);
      target.damageTakenThisTurn += damage;
      events.push({ type: 'damage', sourceId: source.id, targetId: target.id, amount: damage, isCrit, element: skill.element });
      if (target.hp <= 0 && !target.ko) {
        target.ko = true;
        target.ko_countdown = 3;
        events.push({ type: 'ko', unitId: target.id, by: source.id });
      }
    } else if (eff.kind === 'heal') {
      const healAmt = Math.floor(target.hp_max * eff.ratio / 100);
      const actual = Math.min(healAmt, target.hp_max - target.hp);
      target.hp = Math.min(target.hp_max, target.hp + healAmt);
      events.push({ type: 'heal', unitId: target.id, amount: actual });
    } else if (eff.kind === 'state_apply') {
      const chance = eff.chance || 100;
      if (state.prng.rollPercent() < chance) {
        applyState(target, eff.state_id, eff.duration, source.id);
        events.push({ type: 'state_applied', unitId: target.id, stateId: eff.state_id, duration: eff.duration });
      }
    } else if (eff.kind === 'push') {
      const pushResult = applyKnockback(state, source, target, eff.amount);
      if (pushResult) events.push(pushResult);
    } else if (eff.kind === 'drain') {
      // Drain heals the attacker
      const dmgEvt = events.find(e => e.type === 'damage' && e.targetId === target.id);
      if (dmgEvt) {
        const healAmt = Math.floor(dmgEvt.amount * eff.ratio / 100);
        const actual = Math.min(healAmt, source.hp_max - source.hp);
        source.hp = Math.min(source.hp_max, source.hp + healAmt);
        events.push({ type: 'heal', unitId: source.id, amount: actual, source: 'drain' });
      }
    }
  }
  return events;
}

function applyKnockback(state, source, target, amount) {
  const dir = directionBetween(source.pos[0], source.pos[1], target.pos[0], target.pos[1]);
  const [dx, dy] = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] }[dir];
  let [cx, cy] = target.pos;
  let moved = 0;
  for (let i = 0; i < amount; i++) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || nx >= state.map.width || ny < 0 || ny >= state.map.height) break;
    if (state.units.some(u => !u.ko && u.id !== target.id && u.pos[0] === nx && u.pos[1] === ny)) break;
    cx = nx; cy = ny; moved++;
  }
  if (moved > 0) {
    target.pos = [cx, cy];
    return { type: 'knockback', unitId: target.id, to: [cx, cy], amount: moved };
  }
  return null;
}

function processTurnEnd(state) {
  const events = [];
  events.push({ type: 'phase', label: '── ターン終了 ──' });

  for (const unit of state.units) {
    // Decay status durations
    for (const st of [...unit.states]) {
      if (st.remaining > 0) {
        st.remaining--;
        if (st.remaining <= 0) {
          removeState(unit, st.id);
          events.push({ type: 'state_expired', unitId: unit.id, stateId: st.id });
        }
      }
    }
    // KO countdown
    if (unit.ko) {
      unit.ko_countdown--;
      if (unit.ko_countdown <= 0) {
        events.push({ type: 'unit_despawn', unitId: unit.id });
      }
    }
  }

  // Decay placed objects
  if (state.placedObjects) {
    state.placedObjects = state.placedObjects.filter(obj => {
      if (obj.duration !== undefined) {
        obj.duration--;
        if (obj.duration <= 0) {
          events.push({ type: 'object_expired', objId: obj.id });
          return false;
        }
      }
      return true;
    });
  }

  // Victory check
  const team0alive = state.units.filter(u => u.teamId === 0 && !u.ko).length;
  const team1alive = state.units.filter(u => u.teamId === 1 && !u.ko).length;
  if (team0alive === 0 && team1alive === 0) {
    state.winner = 'draw';
    state.phase = 'finished';
    events.push({ type: 'match_end', winner: 'draw', reason: '相打ち' });
  } else if (team0alive === 0) {
    state.winner = 1;
    state.phase = 'finished';
    events.push({ type: 'match_end', winner: 1, reason: '全滅' });
  } else if (team1alive === 0) {
    state.winner = 0;
    state.phase = 'finished';
    events.push({ type: 'match_end', winner: 0, reason: '全滅' });
  } else if (state.turn >= 30) {
    state.winner = 'draw';
    state.phase = 'finished';
    events.push({ type: 'match_end', winner: 'draw', reason: 'ターン制限' });
  } else {
    state.turn++;
    state.phase = 'turn_start';
  }

  return events;
}
