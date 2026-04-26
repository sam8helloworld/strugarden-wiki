'use strict';

// ===== GAME CONTROLLER =====
const G = {
  mode: 'ai',   // 'ai' or 'pvp'
  state: null,
  selectedSkill: null,

  // ── Setup UI ──
  initSetupUI() {
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.addEventListener('click', () => {
        this.mode = b.dataset.m;
        document.querySelectorAll('.mode-btn').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        const p2 = document.getElementById('p2-panel');
        p2.style.opacity = this.mode === 'ai' ? '.55' : '1';
        p2.style.pointerEvents = this.mode === 'ai' ? 'none' : 'auto';
        document.querySelector('#p2-panel h2').textContent =
          this.mode === 'ai' ? '🤖 プレイヤー2 (AI)' : '🎮 プレイヤー2';
        this.updateStart();
      });
    });

    for (const pl of ['p1', 'p2']) {
      const container = document.getElementById(`${pl}-jobs`);
      for (const [jid, job] of Object.entries(JOB_DEFS)) {
        const c = document.createElement('div');
        c.className = 'job-card';
        c.dataset.job = jid;
        c.style.setProperty('--jc', job.color);
        c.innerHTML = `<div class="je">${job.emoji}</div><div class="jn" style="color:${job.color}">${job.name}</div><div class="jd">${job.desc}</div>`;
        c.addEventListener('click', () => {
          container.querySelectorAll('.job-card').forEach(x => x.classList.remove('sel'));
          c.classList.add('sel');
          this._setup(pl).job = jid;
          this._setup(pl).deck = [];
          this.renderSkills(pl, jid);
          this.updateStart();
        });
        container.appendChild(c);
      }
    }

    document.getElementById('btn-start').addEventListener('click', () => this.startBattle());
    document.getElementById('btn-rematch').addEventListener('click', () => {
      showScreen('setup');
      document.getElementById('grid-cells').innerHTML = '';
      document.getElementById('b-log').innerHTML = '';
    });
  },

  _setup(pl) {
    if (!this._sd) this._sd = { p1: { job: null, deck: [] }, p2: { job: null, deck: [] } };
    return this._sd[pl];
  },

  renderSkills(pl, jobId) {
    const job = JOB_DEFS[jobId];
    const list = document.getElementById(`${pl}-skills`);
    list.innerHTML = '';
    this._setup(pl).deck = [];
    document.getElementById(`${pl}-cnt`).textContent = 0;
    for (const sid of job.skill_ids) {
      const sk = SKILL_DEFS[sid];
      if (!sk) continue;
      const d = document.createElement('div');
      d.className = 'sk-item';
      d.innerHTML = `<span class="sk-ap">AP:${sk.ap_cost}</span><span class="sk-spd sp${sk.speed_rank}">${sk.speed_rank}</span><span class="sk-name">${sk.name}</span><span class="sk-desc">${sk.desc}</span>`;
      d.title = sk.desc;
      d.addEventListener('click', () => {
        const deck = this._setup(pl).deck;
        if (d.classList.contains('sel')) {
          deck.splice(deck.indexOf(sid), 1);
          d.classList.remove('sel');
        } else if (deck.length < 3) {
          deck.push(sid);
          d.classList.add('sel');
        }
        document.getElementById(`${pl}-cnt`).textContent = deck.length;
        this.updateStart();
      });
      list.appendChild(d);
    }
  },

  updateStart() {
    const ok1 = this._setup('p1').job && this._setup('p1').deck.length === 3;
    const ok2 = this.mode === 'ai' || (this._setup('p2').job && this._setup('p2').deck.length === 3);
    document.getElementById('btn-start').disabled = !(ok1 && ok2);
  },

  // ── Battle ──
  startBattle() {
    const p1 = this._setup('p1');
    let p2 = this._setup('p2');
    if (this.mode === 'ai') {
      const jobs = Object.keys(JOB_DEFS);
      const aj = jobs[Math.floor(Math.random() * jobs.length)];
      const aSkills = [...JOB_DEFS[aj].skill_ids].sort(() => Math.random() - .5).slice(0, 3);
      p2 = { job: aj, deck: aSkills };
    }
    this.state = initBattle({
      mode: this.mode,
      p1: { jobId: p1.job, deckIds: p1.deck },
      p2: { jobId: p2.job, deckIds: p2.deck },
      seed: Date.now(),
    });
    for (const u of this.state.units) {
      const job = JOB_DEFS[u.jobId];
      document.getElementById(`em-${u.id}`).textContent = job.emoji;
      document.getElementById(`nm-${u.id}`).textContent = u.id === 'p1' ? `P1 ${job.name}` : `P2 ${job.name}`;
      document.getElementById(`dk-${u.id}`).textContent = u.deck.map(id => SKILL_DEFS[id]?.name).join(' / ');
    }
    showScreen('battle');
    renderGrid(this.state);
    updateHUD(this.state);
    this.turnLoop();
  },

  async turnLoop() {
    while (this.state.phase !== 'finished') {
      // Turn start
      const startEvs = processTurnStart(this.state);
      logEvents(startEvs);
      updateHUD(this.state);
      renderGrid(this.state);
      if (this.state.phase === 'finished') break;

      setPhase(`ターン ${this.state.turn}`, '移動フェイズ');

      // Collect movement paths + chosen facings
      const { paths, facings } = await this.collectAllPaths();

      // Apply facings before animation so units face the right way during render
      for (const [uid, f] of Object.entries(facings)) {
        const u = this.state.units.find(u => u.id === uid);
        if (u) u.facing = f;
      }

      // Animate simultaneous movement
      await animateMoves(this.state, paths, st => renderGrid(st));

      // Resolve (facings already applied to units above; pass empty to not override)
      const moveEvs = processMovement(this.state, paths, facings);
      logEvents(moveEvs);
      updateHUD(this.state);
      renderGrid(this.state);

      setPhase(`ターン ${this.state.turn}`, '行動フェイズ');

      // Collect actions
      await this.collectAllActions();

      const actEvs = processAction(this.state);
      logEvents(actEvs);
      updateHUD(this.state);
      renderGrid(this.state);
      if (this.state.phase === 'finished') break;

      // Turn end
      const endEvs = processTurnEnd(this.state);
      logEvents(endEvs);
      updateHUD(this.state);
      renderGrid(this.state);
      await sleep(200);
    }
    setTimeout(() => this.endMatch(), 600);
  },

  // ── Movement collection ──
  async collectAllPaths() {
    const paths = {};
    const facings = {};
    if (this.mode === 'ai') {
      const aiUnit = this.state.units.find(u => u.teamId === 1);
      if (aiUnit && !aiUnit.ko) {
        const dest = AI.decideMove(this.state, aiUnit);
        if (dest) {
          const { getPath } = bfsMovement(aiUnit.pos, aiUnit, this.state.units, aiUnit.movement, this.state.placedObjects, this.state.map);
          const path = getPath(dest[0], dest[1]);
          paths[aiUnit.id] = path;
          // AI faces toward the enemy after moving
          if (path.length >= 2) {
            const last = path[path.length - 1];
            const prev = path[path.length - 2];
            facings[aiUnit.id] = directionBetween(prev[0], prev[1], last[0], last[1]);
          }
        } else {
          paths[aiUnit.id] = [];
        }
      }
      const r1 = await this.playerPathInput('p1');
      paths['p1'] = r1.path;
      facings['p1'] = r1.facing;
    } else {
      const r1 = await this.playerPathInput('p1');
      paths['p1'] = r1.path;
      facings['p1'] = r1.facing;
      await this.passScreen('プレイヤー2の移動フェイズ', 'P2の移動先を選択してください');
      const r2 = await this.playerPathInput('p2');
      paths['p2'] = r2.path;
      facings['p2'] = r2.facing;
    }
    return { paths, facings };
  },

  // Show a 4-direction facing picker at the given unit's destination and resolve with chosen facing
  showFacingPicker(unit, destPos) {
    return new Promise(resolve => {
      const [dx, dy] = destPos;
      setTitle(`<strong>向きを選択</strong>`);
      setHint('移動後の向きを選んでください');
      clearBtns();

      const currentFacing = unit.facing;
      const fg = document.createElement('div');
      fg.className = 'facing-grp';
      for (const [f, a] of [['up','↑'],['down','↓'],['left','←'],['right','→']]) {
        const b = document.createElement('button');
        b.className = `abtn fbtn${f === currentFacing ? ' on' : ''}`;
        b.textContent = a;
        b.addEventListener('click', () => {
          onCellClick = () => {};
          clearBtns();
          resolve(f);
        });
        fg.appendChild(b);
      }
      document.getElementById('act-btns').appendChild(fg);

      // Highlight the destination cell
      renderGrid(this.state, { selUnit: { ...unit, pos: destPos } });
    });
  },

  playerPathInput(pid) {
    return new Promise(resolve => {
      const unit = this.state.units.find(u => u.id === pid);
      if (!unit || unit.ko || hasState(unit, 'sleep') || hasState(unit, 'freeze')) {
        resolve({ path: [], facing: unit ? unit.facing : 'up' });
        return;
      }

      const job = JOB_DEFS[unit.jobId];
      markActiveHUD(pid);
      setTitle(`<strong>${job.emoji} ${job.name}の移動</strong>`);
      setHint('移動先をクリック — 続けてクリックで経由地追加');

      let session = { currentPos: [...unit.pos], remaining: unit.movement, fullPath: [] };
      let bfsCache = bfsMovement(session.currentPos, unit, this.state.units, session.remaining, this.state.placedObjects, this.state.map);

      const refresh = () => {
        setBudget(`移動力残: ${session.remaining}/${unit.movement}`);
        renderGrid(this.state, {
          moveRange: bfsCache.reachable,
          planPath: session.fullPath,
          selUnit: unit,
        });
      };

      const commitWithFacing = async () => {
        onCellClick = () => {};
        onCellHover = () => {};
        clearBtns();
        setBudget('');
        // Show facing picker at destination
        const destPos = session.fullPath.length > 0 ? session.fullPath[session.fullPath.length - 1] : [...unit.pos];
        const facing = await this.showFacingPicker(unit, destPos);
        markActiveHUD('');
        resolve({ path: session.fullPath, facing });
      };

      clearBtns();
      addBtn('その場待機', () => commitWithFacing());
      addBtn('移動完了', () => commitWithFacing(), 'primary');

      onCellHover = (x, y) => {
        const inRange = bfsCache.reachable.some(([rx, ry]) => rx === x && ry === y);
        if (!inRange) { refresh(); return; }
        const preview = bfsCache.getPath(x, y);
        renderGrid(this.state, {
          moveRange: bfsCache.reachable,
          planPath: session.fullPath,
          prevPath: preview,
          selUnit: unit,
        });
      };

      onCellClick = (x, y) => {
        if (x === session.currentPos[0] && y === session.currentPos[1]) { commitWithFacing(); return; }
        const inRange = bfsCache.reachable.some(([rx, ry]) => rx === x && ry === y);
        if (!inRange) return;
        const seg = bfsCache.getPath(x, y);
        session.fullPath = [...session.fullPath, ...seg];
        session.currentPos = [x, y];
        session.remaining = unit.movement - session.fullPath.length;
        if (session.remaining <= 0) { commitWithFacing(); return; }
        bfsCache = bfsMovement(session.currentPos, unit, this.state.units, session.remaining, this.state.placedObjects, this.state.map);
        clearBtns();
        addBtn('その場待機', () => commitWithFacing());
        addBtn('移動完了', () => commitWithFacing(), 'primary');
        refresh();
      };

      refresh();
    });
  },

  // ── Action collection ──
  async collectAllActions() {
    this.state.pendingActions = {};
    if (this.mode === 'ai') {
      const aiUnit = this.state.units.find(u => u.teamId === 1);
      if (aiUnit && !aiUnit.ko) {
        this.state.pendingActions[aiUnit.id] = AI.decideAction(this.state, aiUnit);
      }
      await this.playerActionInput('p1');
    } else {
      await this.playerActionInput('p1');
      await this.passScreen('プレイヤー2の行動フェイズ', 'P2の行動を選択してください');
      await this.playerActionInput('p2');
    }
  },

  playerActionInput(pid) {
    return new Promise(resolve => {
      const unit = this.state.units.find(u => u.id === pid);
      if (!unit || unit.ko) {
        this.state.pendingActions[pid] = { kind: 'wait' };
        resolve();
        return;
      }

      const job = JOB_DEFS[unit.jobId];
      this.selectedSkill = null;
      markActiveHUD(pid);
      setTitle(`<strong>${job.emoji} ${job.name}の行動</strong>`);
      setHint('スキルを選ぶか待機');
      setBudget('');
      clearBtns();

      // Skill buttons
      for (const sid of unit.deck) {
        const sk = SKILL_DEFS[sid];
        if (!sk) continue;
        const canAP = unit.ap >= sk.ap_cost;
        const b = document.createElement('button');
        b.className = 'abtn';
        b.disabled = !canAP;
        b.innerHTML = `<b>${sk.name}</b><br><small style="color:#88f">AP:${sk.ap_cost} ${sk.speed_rank}速</small>`;
        b.title = sk.desc;
        b.dataset.sid = sid;
        b.addEventListener('click', () => {
          if (this.selectedSkill === sid) {
            this.selectedSkill = null;
            document.querySelectorAll('[data-sid]').forEach(x => x.classList.remove('on'));
            renderGrid(this.state, { selUnit: unit });
            setHint('スキルを選ぶか待機');
            return;
          }
          this.selectedSkill = sid;
          document.querySelectorAll('[data-sid]').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          if (sk.attack_type === 'self') {
            setHint(`${sk.name}: 自分に発動`);
            renderGrid(this.state, { atkRange: [unit.pos], selUnit: unit });
          } else {
            this.refreshAtkRange(unit);
            setHint(`${sk.name}: ターゲットをクリック`);
          }
        });
        document.getElementById('act-btns').appendChild(b);
      }

      // Wait button
      addBtn('待機', () => {
        this.state.pendingActions[pid] = { kind: 'wait' };
        onCellClick = () => {};
        onCellHover = () => {};
        clearBtns();
        renderGrid(this.state);
        markActiveHUD('');
        resolve();
      });

      onCellHover = (x, y) => {
        if (!this.selectedSkill) return;
        const sk = SKILL_DEFS[this.selectedSkill];
        const atkCells = computeRangeCells(unit.pos[0], unit.pos[1], sk.range, unit.facing, this.state.map.width, this.state.map.height);
        const inRange = atkCells.some(([cx, cy]) => cx === x && cy === y);
        if (inRange) {
          const aoe = sk.effect_shape.map(([dx, dy]) => [x + dx, y + dy])
            .filter(([ex, ey]) => ex >= 0 && ex < this.state.map.width && ey >= 0 && ey < this.state.map.height);
          renderGrid(this.state, { atkRange: atkCells, aoeRange: aoe, selUnit: unit });
        } else {
          renderGrid(this.state, { atkRange: atkCells, selUnit: unit });
        }
      };

      onCellClick = (x, y) => {
        if (!this.selectedSkill) return;
        const sk = SKILL_DEFS[this.selectedSkill];
        const atkCells = computeRangeCells(unit.pos[0], unit.pos[1], sk.range, unit.facing, this.state.map.width, this.state.map.height);
        const validTarget = sk.attack_type === 'self' || atkCells.some(([cx, cy]) => cx === x && cy === y);
        if (validTarget) {
          const target = sk.attack_type === 'self' ? unit.pos : [x, y];
          this.state.pendingActions[pid] = { kind: 'skill', skillId: this.selectedSkill, target };
          this.selectedSkill = null;
          onCellClick = () => {};
          onCellHover = () => {};
          clearBtns();
          renderGrid(this.state);
          markActiveHUD('');
          resolve();
        }
      };

      renderGrid(this.state, { selUnit: unit });
    });
  },

  refreshAtkRange(unit) {
    if (!this.selectedSkill) return;
    const sk = SKILL_DEFS[this.selectedSkill];
    const cells = computeRangeCells(unit.pos[0], unit.pos[1], sk.range, unit.facing, this.state.map.width, this.state.map.height);
    renderGrid(this.state, { atkRange: cells, selUnit: unit });
  },

  // ── Pass screen ──
  passScreen(title, msg) {
    return new Promise(resolve => {
      document.getElementById('pass-who').textContent = title;
      document.getElementById('pass-msg').textContent = msg;
      document.getElementById('btn-pass').onclick = () => { showScreen('battle'); resolve(); };
      showScreen('pass');
    });
  },

  // ── End match ──
  endMatch() {
    clearBtns();
    onCellClick = () => {};
    onCellHover = () => {};
    const st = this.state;
    let title = '', sub = '';
    if (st.winner === 'draw') {
      title = '引き分け';
    } else {
      const wu = st.units.find(u => u.teamId === st.winner);
      const job = JOB_DEFS[wu.jobId];
      title = `🏆 ${st.winner === 0 ? 'P1' : 'P2'} ${job.name} の勝利！`;
      if (this.mode === 'ai' && st.winner === 1) sub = 'AIに敗北しました...';
    }
    document.getElementById('res-title').textContent = title;
    document.getElementById('res-sub').textContent = sub;
    showScreen('result');
  },
};

// ===== GLOBAL UI HELPERS =====
let onCellClick = () => {};
let onCellHover = () => {};

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`s-${name}`).classList.add('active');
}

function setPhase(turn, phase) {
  document.getElementById('b-turn').textContent = turn;
  document.getElementById('b-phase').innerHTML = `<span>${phase}</span>`;
}

function setTitle(html) { document.getElementById('act-title').innerHTML = html; }
function setHint(s) { document.getElementById('act-hint').textContent = s; }
function setBudget(s) { document.getElementById('mv-budget').textContent = s; }

function clearBtns() {
  document.getElementById('act-btns').innerHTML = '';
  onCellHover = () => {};
}

function addBtn(label, onClick, cls = '') {
  const b = document.createElement('button');
  b.className = `abtn${cls ? ' ' + cls : ''}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  document.getElementById('act-btns').appendChild(b);
  return b;
}

function markActiveHUD(uid) {
  document.querySelectorAll('.u-hud').forEach(el => el.classList.toggle('active', el.dataset.uid === uid));
}

// Placed-object type display info
const OBJ_DISPLAY = {
  wood_box_fragile: { emoji: '📦', color: '#a06020', label: '木箱(脆)' },
  wood_box:         { emoji: '📦', color: '#c07020', label: '木箱' },
  wood_carton:      { emoji: '📦', color: '#c08030', label: '木カートン' },
  iron_box:         { emoji: '🗳️', color: '#808090', label: '鉄箱' },
  iron_box_med:     { emoji: '🗳️', color: '#9090a0', label: '鉄箱(中)' },
  pole:             { emoji: '🪨', color: '#707070', label: '柱' },
  danger_item:      { emoji: '⚠️', color: '#ff4020', label: '危険物' },
  stella:           { emoji: '⭐', color: '#ffd700', label: 'ステラ' },
  monolith:         { emoji: '🗿', color: '#505060', label: 'モノリス' },
  mine:             { emoji: '💣', color: '#d03020', label: '地雷' },
  wood_man:         { emoji: '🪆', color: '#b06020', label: '木人形' },
  iron_ball:        { emoji: '⚫', color: '#606070', label: '鉄球' },
};

// ===== GRID RENDERER =====
function renderGrid(st, opts = {}) {
  const { moveRange = [], planPath = [], prevPath = [], atkRange = [], aoeRange = [], selUnit = null } = opts;

  const mapDef = (st && st.map) || MAP_DEF;
  const mapHeights = mapDef.heights;
  const obsSet = new Set((mapDef.obstacles || []).map(([ox, oy]) => `${ox},${oy}`));
  const placedObjects = (st && st.placedObjects) || [];

  const grid = document.getElementById('grid-cells');
  grid.style.gridTemplateColumns = `repeat(${mapDef.width}, 56px)`;

  const moveSet  = new Set(moveRange.map(([x,y]) => `${x},${y}`));
  const planSet  = new Set(planPath.map(([x,y]) => `${x},${y}`));
  const prevSet  = new Set(prevPath.map(([x,y]) => `${x},${y}`));
  const atkSet   = new Set(atkRange.map(([x,y]) => `${x},${y}`));
  const aoeSet   = new Set(aoeRange.map(([x,y]) => `${x},${y}`));

  if (grid.children.length !== mapDef.width * mapDef.height) {
    grid.innerHTML = '';
    for (let row = 0; row < mapDef.height; row++) {
      for (let col = 0; col < mapDef.width; col++) {
        const c = document.createElement('div');
        c.className = 'cell';
        c.dataset.x = col;
        c.dataset.y = row;
        c.addEventListener('click',      () => onCellClick(col, row));
        c.addEventListener('mouseenter', () => onCellHover(col, row));
        grid.appendChild(c);
      }
    }
  }

  for (const cell of grid.children) {
    const x = +cell.dataset.x, y = +cell.dataset.y;
    const key = `${x},${y}`;
    const h = mapHeights[y][x];
    const isObstacle = obsSet.has(key);

    if (isObstacle) {
      cell.className = 'cell obstacle';
    } else {
      cell.className = `cell h${h}`;
      if      (aoeSet.has(key))  cell.classList.add('aoe');
      else if (atkSet.has(key))  cell.classList.add('atk');
      else if (planSet.has(key)) cell.classList.add('path-plan');
      else if (prevSet.has(key)) cell.classList.add('path-prev');
      else if (moveSet.has(key)) cell.classList.add('mv');
    }
    if (selUnit && selUnit.pos[0] === x && selUnit.pos[1] === y) cell.classList.add('sel');

    cell.innerHTML = '';

    if (isObstacle) {
      // Render wall/obstacle
      const w = document.createElement('div');
      w.className = 'obs-icon';
      w.textContent = '🧱';
      cell.appendChild(w);
      continue;
    }

    // Height label
    if (h > 0) {
      const hl = document.createElement('div');
      hl.className = 'hlabel';
      hl.textContent = `H${h}`;
      cell.appendChild(hl);
    }

    // Plan path step numbers
    const planIdx = planPath.findIndex(([px, py]) => px === x && py === y);
    if (planIdx >= 0) {
      const n = document.createElement('div');
      n.className = 'cell-step';
      n.textContent = planIdx + 1;
      cell.appendChild(n);
    }

    // Preview path arrows
    const prevIdx = prevPath.findIndex(([px, py]) => px === x && py === y);
    if (prevIdx >= 0 && prevIdx + 1 < prevPath.length) {
      const [nx, ny] = prevPath[prevIdx + 1];
      const dir = directionBetween(x, y, nx, ny);
      const arr = document.createElement('div');
      arr.className = 'cell-arrow';
      arr.textContent = { up:'↑', down:'↓', left:'←', right:'→' }[dir];
      cell.appendChild(arr);
    }

    // Placed objects
    const obj = placedObjects.find(o => o.pos[0] === x && o.pos[1] === y);
    if (obj) {
      const disp = OBJ_DISPLAY[obj.obj_type] || { emoji: '📦', color: '#888', label: obj.obj_type };
      const od = document.createElement('div');
      od.className = `placed-obj team${obj.teamId}`;
      od.style.borderColor = disp.color;
      const em = document.createElement('span');
      em.textContent = disp.emoji;
      od.appendChild(em);
      const lbl = document.createElement('div');
      lbl.className = 'obj-label';
      lbl.textContent = `${disp.label}`;
      lbl.style.color = disp.color;
      od.appendChild(lbl);
      cell.appendChild(od);
    }

    // Unit sprite (skip if placed object occupying same cell)
    const unit = st && st.units && st.units.find(u => u.pos[0] === x && u.pos[1] === y);
    if (unit) {
      const job = JOB_DEFS[unit.jobId];
      const sp = document.createElement('div');
      sp.className = `sprite t${unit.teamId}-sprite${unit.ko ? ' ko-s' : ''}${unit._collided ? ' collide' : ''}`;
      sp.style.color = unit.ko ? '#666' : job.color;

      const fa = document.createElement('div');
      fa.className = `sp-fa ${unit.facing}`;
      fa.textContent = { up:'▲', down:'▼', left:'◀', right:'▶' }[unit.facing];
      sp.appendChild(fa);

      const em = document.createElement('span');
      em.textContent = job.emoji;
      sp.appendChild(em);

      const hpBar = document.createElement('div');
      hpBar.className = 'sp-hp';
      const hpF = document.createElement('div');
      hpF.className = 'sp-hp-f';
      const pct = unit.ko ? 0 : unit.hp / unit.hp_max * 100;
      hpF.style.width = `${pct}%`;
      hpF.style.background = pct > 50 ? '#4a4' : '#c44';
      hpBar.appendChild(hpF);
      sp.appendChild(hpBar);

      cell.appendChild(sp);
    }
  }
}

// ===== HUD UPDATE =====
function updateHUD(st) {
  for (const u of st.units) {
    const hpPct = u.ko ? 0 : u.hp / u.hp_max * 100;
    const apPct = u.ap / u.ap_max * 100;
    const bh = document.getElementById(`bh-${u.id}`);
    const ba = document.getElementById(`ba-${u.id}`);
    if (!bh) continue;
    bh.style.width = `${hpPct}%`;
    bh.className = `bar-hp${hpPct < 30 ? ' low' : ''}`;
    ba.style.width = `${apPct}%`;
    document.getElementById(`hp-${u.id}`).textContent = `${u.ko ? 0 : u.hp}/${u.hp_max}`;
    document.getElementById(`ap-${u.id}`).textContent = `${u.ap}/${u.ap_max}`;
    document.getElementById(`fc-${u.id}`).textContent = { up:'↑', down:'↓', left:'←', right:'→' }[u.facing];
    document.getElementById(`hud-${u.id}`).className = `u-hud${u.ko ? ' ko' : ''}`;

    const bd = document.getElementById(`bd-${u.id}`);
    bd.innerHTML = '';
    for (const s of u.states) {
      const def = STATUS_DEFS[s.id];
      if (!def) continue;
      const b = document.createElement('span');
      b.className = `badge ${def.category === 'buff' ? 'buff' : 'dbuff'}`;
      b.style.background = def.color;
      b.title = `${def.name} (${s.remaining}T)`;
      b.textContent = `${def.name}${s.remaining}T`;
      bd.appendChild(b);
    }
  }
}

// ===== LOG =====
function addLog(msg, cls = '') {
  const el = document.getElementById('b-log');
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = msg;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

function logEvents(evs) {
  for (const e of evs) {
    switch (e.type) {
      case 'phase':         addLog(e.label, 'lp'); break;
      case 'dot_damage':    addLog(`${e.statusName}ダメージ: ${e.unitId} に ${e.amount}`, 'ld'); break;
      case 'heal':          addLog(`${e.unitId} HP +${e.amount} 回復`, 'lh'); break;
      case 'skill_start':   addLog(`⚡ ${e.skillName} 発動`, 'lsys'); break;
      case 'damage':        addLog(`${e.targetId} に ${e.amount} ダメージ${e.isCrit ? '【クリティカル!】' : ''}`, 'ld'); break;
      case 'state_applied': addLog(`${e.unitId} が ${STATUS_DEFS[e.stateId]?.name || e.stateId} 状態 (${e.duration}T)`, 'ls'); break;
      case 'state_removed': addLog(`${e.unitId} の ${STATUS_DEFS[e.stateId]?.name || e.stateId} 解除: ${e.reason}`, 'ls'); break;
      case 'state_expired': addLog(`${e.unitId} の ${STATUS_DEFS[e.stateId]?.name || e.stateId} 切れ`); break;
      case 'ko':            addLog(`💀 ${e.unitId} 戦闘不能！`, 'lk'); break;
      case 'move':          addLog(`${e.unitId} → (${e.to[0]},${e.to[1]})`); break;
      case 'knockback':     addLog(`${e.unitId} ${e.amount}マス吹飛`); break;
      case 'miss':          addLog(`ミス: ${e.unitId}→${e.targetId}`); break;
      case 'wait':          addLog(`${e.unitId} 待機`); break;
      case 'place_object':  addLog(`📦 ${e.unitId} が ${e.obj.obj_type} を設置`, 'lsys'); break;
      case 'object_expired':addLog(`📦 設置物が消滅 (${e.objId})`); break;
      case 'match_end':     addLog(`🏆 試合終了: ${e.winner === 'draw' ? '引き分け' : `チーム${e.winner + 1}勝利`} (${e.reason})`, 'lk'); break;
    }
  }
}

// ===== ENTRY POINT =====
document.addEventListener('DOMContentLoaded', () => {
  G.initSetupUI();
});
