'use strict';

// ===== SIMPLE HEURISTIC AI =====
// Implements AIPolicy interface: decides moves and actions for AI-controlled units

const AI = {
  // Decide where to move (toward enemy if in movement range)
  decideMove(state, unit) {
    if (unit.ko) return null;
    if (hasState(unit, 'sleep') || hasState(unit, 'freeze')) return unit.pos;

    const enemies = state.units.filter(u => u.teamId !== unit.teamId && !u.ko);
    if (enemies.length === 0) return unit.pos;

    const moveRange = computeMovementRange(unit, state.units, state.map.width, state.map.height, state.placedObjects || [], state.map);
    if (moveRange.length === 0) return unit.pos;

    const target = enemies[0];
    const [tx, ty] = target.pos;

    // Check if any skill in the deck can reach from a move candidate
    const deckSkills = unit.deck.map(id => SKILL_DEFS[id]).filter(Boolean);

    // Score each reachable cell: prefer cells that put skills in range
    let bestPos = unit.pos;
    let bestScore = -Infinity;

    for (const [mx, my] of [unit.pos, ...moveRange]) {
      const tempUnit = { ...unit, pos: [mx, my] };
      let score = 0;

      // Prefer to be close to enemy
      const dist = Math.abs(mx - tx) + Math.abs(my - ty);
      score -= dist * 2;

      // Bonus if any attack skill can reach enemy
      for (const skill of deckSkills) {
        if (skill.attack_type === 'self') continue;
        const allTargets = computeRangeCellsAllFacings(mx, my, skill.range, state.map.width, state.map.height);
        if (allTargets.some(([wx, wy]) => wx === tx && wy === ty)) {
          score += 20 + skill.base_power / 10;
        }
      }

      // Avoid getting too close if we have ranged skills
      const hasRangedSkill = deckSkills.some(s => s.attack_type === 'projectile' && s.base_power > 0);
      if (hasRangedSkill && dist === 1) score -= 5;

      if (score > bestScore) {
        bestScore = score;
        bestPos = [mx, my];
      }
    }

    return bestPos;
  },

  // Decide action (skill or wait)
  decideAction(state, unit) {
    if (unit.ko) return { kind: 'wait' };
    if (hasState(unit, 'sleep') || hasState(unit, 'freeze') || hasState(unit, 'paralysis')) return { kind: 'wait' };

    const enemies = state.units.filter(u => u.teamId !== unit.teamId && !u.ko);
    if (enemies.length === 0) return { kind: 'wait' };

    const target = enemies[0];
    const deckSkills = unit.deck.map(id => SKILL_DEFS[id]).filter(Boolean);

    // Score each usable skill
    let bestCmd = null;
    let bestScore = -1;

    // Consider using a buff if not yet buffed and HP is full-ish
    for (const skill of deckSkills) {
      if (unit.ap < skill.ap_cost) continue;

      // Self-buff skills
      if (skill.attack_type === 'self') {
        let score = 5;
        // Prefer guard/atk_up when not already active
        for (const eff of skill.effects) {
          if (eff.kind === 'state_apply' && !hasState(unit, eff.state_id)) {
            score += 15;
          } else if (eff.kind === 'heal' && unit.hp < unit.hp_max * 0.7) {
            score += 20;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestCmd = { kind: 'skill', skillId: skill.id, target: unit.pos };
        }
        continue;
      }

      // Attack skills: find best facing + target
      const allTargetCells = computeRangeCellsAllFacings(
        unit.pos[0], unit.pos[1], skill.range, state.map.width, state.map.height
      );
      if (!allTargetCells.some(([wx, wy]) => wx === target.pos[0] && wy === target.pos[1])) continue;

      let score = skill.base_power;
      // Bonus for status application
      for (const eff of skill.effects) {
        if (eff.kind === 'state_apply' && !hasState(target, eff.state_id)) {
          score += 30;
        }
      }
      // Prefer skills that hit when target is sleeping
      if (hasState(target, 'sleep') || hasState(target, 'freeze')) score += 20;

      if (score > bestScore) {
        bestScore = score;
        bestCmd = { kind: 'skill', skillId: skill.id, target: target.pos };
      }
    }

    return bestCmd || { kind: 'wait' };
  },
};
