// ═══════════════════════════════════════════════════════════════════
// beam_worker.js — Beam Search v7 (전면 재작성)
// 수정 내역:
//   1. skills 원본으로 강화 평타/처형 배율 정상화
//   2. 스코어링 v7 — 0딜 서포터 스킬 정상 평가
//   3. teamGaugeGain 구현
//   4. 틱별 SP 회복 (skillTickSp/linkTickSp/ultTickSp)
//   5. 동시 행동 지원 (스킬 시전 중 다른 캐릭터 기본 공격)
//   6. calcDmg에 atkMult 적용
//   7. 궁극기 blockWindow (게이지 충전 차단)
//   8. accept_team_gauge
//   9. 기본 공격 분기 축소
// ═══════════════════════════════════════════════════════════════════

const BEAM_WIDTH = 6;
const EARLY_BEAM_WIDTH = 10;
const EARLY_STEPS = 8;
const MAX_CANDIDATES = 200;
const ROLLOUT_TOP_N = 30;
const DEFAULT_TIME_LIMIT = 10000;
const PROGRESS_INTERVAL_MS = 250;
const ACTION_WINDOW = 0.3;

let SP = { max_sp: 300, initial_sp: 200, regen_rate: 8, skill_cost: 100, skill_regen_pause: 0.5, link_regen_pause: 1.5 };
let BOSS_DEF = 100; // 현재 보스 기본 방어력 (beamSearch/forcedPlay에서 params.bossDef로 설정)

// ═══════════════════════════════════════════════════════════════════
// 아츠 이상반응 시스템 (Arts Anomaly System)
// ═══════════════════════════════════════════════════════════════════
// 스택 가능한 아츠 부착 타입 (최대 4레벨)
const ARTS_ATTACH_SET = new Set(['cold_attach', 'nature_attach', 'emag_attach', 'heat_attach', 'blaze_attach', 'conductive']);
// frozen은 별도 처리: 기존 아츠 부착 모두 소모 후 동결 발동 (INFLICTION_REMAP에서 제외)
const INFLICTION_REMAP = {};
// 비-자연 타입 (자연 부착과 만나면 부식 발동)
const ARTS_NON_NATURE = new Set(['cold_attach', 'emag_attach', 'conductive', 'heat_attach', 'blaze_attach']);
// 감전(Electrification) 2차 효과: 아츠 피해 증가 (level 1~4)
const ELECTRIFICATION_AMP = [0, 0.12, 0.16, 0.20, 0.24]; // +12/16/20/24%
const ELECTRIFICATION_DUR = [0, 12,   18,   24,   30  ]; // 12/18/24/30s
// 부식(Corrosion) 2차 효과: 내성(DEF) 감소 포인트 (level 1~4), 15초 지속
const CORROSION_RES_REDUCE = [0, 12, 16, 20, 24]; // 위키 기준 저항 감소량
const CORROSION_DURATION = 15;

// 동결(Solidification) 지속시간: Level 1~4 = 6/7/8/9초 (위키: 5 + level)
// 파쇄(Shatter) 데미지: Level 1~4 = 240/360/480/600% ATK (위키: 1.2 × (1 + level))
// 물리 취약(Breach) 디버프: Level 1~4 = +11/14/17/20% 물리 피해 / 12/18/24/30초 지속
const PHYS_VULN_BREACH = [0, 0.11, 0.14, 0.17, 0.20]; // Breach: 물리 피해 증가율
const PHYS_VULN_DUR   = [0, 12,   18,   24,   30  ];  // Breach 디버프 지속시간 (초)

// 아츠 폭발 타입 (동일 속성 2레벨↑ 시 발동, 스택 유지)
const BURST_MAP = {
  cold_attach:   'cold_burst',
  nature_attach: 'nature_burst',
  emag_attach:   'emag_burst',
  conductive:    'conductive_burst',
  heat_attach:   'heat_burst',
  blaze_attach:  'heat_burst',
};

// 두 부착 타입이 만날 때 발생하는 반응 결정
// 위키 기준: 반응 타입은 '들어오는 새 부착 타입'으로 결정됨
function getArtsReaction(existingType, newType) {
  if (!existingType || existingType === newType) return null;
  switch (newType) {
    case 'cold_attach':                    return 'frozen';          // 냉기 → 동결(Solidification)
    case 'nature_attach':                  return 'corrosion';       // 자연 → 부식(Corrosion)
    case 'emag_attach': case 'conductive': return 'electrification'; // 전기계열 → 감전(Electrification)
    case 'heat_attach': case 'blaze_attach': return 'combustion';    // 열기 → 연소(Combustion)
    default: return null;
  }
}

// 아츠 반응/폭발 데미지 계산 (출처: endfield.wiki.gg)
function calcReactionDmg(reactionType, level, atk, artsPower, critMult, defMult, elemBonus, vulnMult, artsAmp) {
  const artsMod = 1 + (artsPower || 0) / 100; // Arts Intensity 배율 (포인트당 1%)
  const base = (mult) => Math.round(atk * mult * artsMod * critMult * defMult * (1 + elemBonus) * (1 + vulnMult) * (1 + artsAmp));
  // 아츠 반응 초기 타격 공식: (80% + 80% × level) ATK
  // level 1=160%, 2=240%, 3=320%, 4=400%
  const reactionInitial = 0.8 + 0.8 * level;
  switch (reactionType) {
    // ── 아츠 폭발 (Burst): 항상 160% ATK 고정 ──
    case 'cold_burst':
    case 'nature_burst':
    case 'emag_burst':
    case 'conductive_burst':
    case 'heat_burst':
      return base(1.6);

    // ── 아츠 반응 (Reaction): 레벨 기반 초기 타격 ──
    // 부식(Corrosion) — 자연 + 비자연: 초기 타격 + 내성 감소 15s
    // 2차 효과: state.corrosionResReduce → getLiveDefMult로 방어배율 보정
    case 'corrosion':
      return base(reactionInitial);

    // 감전(Electrification) — 전기계열 교차: 초기 타격 + 아츠 피해 증가
    // 2차 효과: state.reactionAmp → getLiveMultipliers의 artsAmp에 합산
    case 'electrification':
      return base(reactionInitial);

    // 동결(Solidification) — 냉기 + 비냉기: 초기 타격 + CC
    // (forcibly applied = 초기 타격 스킵, 일반 반응은 초기 타격 포함)
    case 'frozen':
      return base(reactionInitial);

    // 연소(Combustion) — 열기 + 비열기: 초기 타격 + DoT 10틱
    // 초기: (80%+80%×L), DoT 합계: (12%+12%×L)×10틱 = (120%+120%×L)
    // 총합: 2.0×(1+L)  — 시뮬에서는 틱별 처리 대신 합산
    case 'combustion':
      return base(2.0 * (1 + level));

    // 파쇄(ice_shatter) — 동결 상태 적에게 추가 피해
    // Level 1~4: 240/360/480/600% ATK = 1.2 × (1 + level)
    case 'ice_shatter':
      return base(1.2 * (1 + level));

    default: return 0;
  }
}

// 아츠 이상 적용 — anomaly 1개 처리, 반응/폭발 데미지 반환
function applyArtsAnomaly(state, anomaly, c, defMult, mults, t) {
  if (!anomaly) return 0;
  const rawType = anomaly.type;
  const liveAtk = c.finalAtk * mults.atkMult;
  const ai = state.artsInfliction;

  // ── frozen: 기존 아츠 부착 모두 소모 → 동결 데미지, 동결 상태 설정 ──
  if (rawType === 'frozen') {
    if (ai.type && ai.level > 0) {
      const frozenLevel = Math.min(4, ai.level);
      const dmg = calcReactionDmg('frozen', frozenLevel, liveAtk, c.artsPower, c.critMult, defMult, c.elemBonus, mults.vulnMult, mults.artsAmp);
      state.artsInfliction = { type: null, level: 0 };
      state.frozenUntil = t + 5 + frozenLevel; // Level 1~4: 6/7/8/9초 (위키)
      state.frozenLevel = frozenLevel;           // 파쇄 계산에 사용
      return dmg;
    }
    return 0; // 기존 부착 없으면 동결 미발동
  }

  // ── ice_shatter: 동결 상태 적에게 파쇄 데미지 ──
  if (rawType === 'ice_shatter') {
    if (state.frozenUntil > t) {
      const fl = state.frozenLevel || 1;
      const dmg = calcReactionDmg('ice_shatter', fl, liveAtk, c.artsPower, c.critMult, defMult, c.elemBonus, mults.vulnMult, mults.artsAmp);
      state.frozenUntil = 0; // 파쇄 후 동결 해제
      state.frozenLevel = 0;
      return dmg;
    }
    return 0; // 동결 상태 아니면 미발동
  }

  // ── physical_vulnerable: 취약(Vulnerable) 스택 부착 → Breach 디버프 ──
  // 스택 누적 최대 4, 소모 시 물리 피해 +11/14/17/20% (위키: PHYS_VULN_BREACH)
  if (rawType === 'physical_vulnerable') {
    const newLevel = Math.min(4, (state.physVuln?.level || 0) + (anomaly.stacks || 1));
    state.physVuln = { level: newLevel, expiry: t + PHYS_VULN_DUR[newLevel] };
    return 0;
  }

  if (!ARTS_ATTACH_SET.has(rawType)) return 0; // spell_vulnerable, affix_slow 등 무시

  const type  = INFLICTION_REMAP[rawType] || rawType;
  const stacks = anomaly.stacks || 1;
  let dmg = 0;

  if (!ai.type || ai.level <= 0) {
    // 빈 상태: 새 부착 시작
    state.artsInfliction = { type, level: stacks };
  } else {
    const reaction = getArtsReaction(ai.type, type);
    if (reaction) {
      // 반응 발동: 기존 스택 소모 → 데미지 → 새 부착 1레벨 시작
      const consumedLevel = ai.level;
      dmg = calcReactionDmg(reaction, consumedLevel, liveAtk, c.artsPower, c.critMult, defMult, c.elemBonus, mults.vulnMult, mults.artsAmp);
      state.artsInfliction = { type, level: stacks };
      // 감전 2차 효과: 아츠 피해 증가 (지속 디버프)
      if (reaction === 'electrification') {
        const lv = Math.min(4, consumedLevel);
        state.reactionAmp = { val: ELECTRIFICATION_AMP[lv], expiry: t + ELECTRIFICATION_DUR[lv] };
      }
      // 부식 2차 효과: 내성 감소 (저항 포인트, 15초)
      // 증폭 공식: base × (1 + 2 × artsPower / (artsPower + 300))
      if (reaction === 'corrosion') {
        const lv = Math.min(4, consumedLevel);
        const base = CORROSION_RES_REDUCE[lv];
        const ap = c.artsPower || 0;
        const enhanced = base * (1 + 2 * ap / (ap + 300));
        state.corrosionResReduce = { val: enhanced, expiry: t + CORROSION_DURATION };
      }
    } else if (ai.type === type) {
      // 동일 타입: 레벨 증가 (최대 4), 스택 소모 없음
      const newLevel = Math.min(4, ai.level + stacks);
      state.artsInfliction = { type, level: newLevel };
      // 2레벨 이상이면 아츠 폭발 발동 (스택 유지)
      if (newLevel >= 2) {
        const burstType = BURST_MAP[type];
        if (burstType) dmg = calcReactionDmg(burstType, newLevel, liveAtk, c.artsPower, c.critMult, defMult, c.elemBonus, mults.vulnMult, mults.artsAmp);
      }
    } else {
      // 반응 없는 다른 타입: 기존 소거 후 새 부착으로
      state.artsInfliction = { type, level: stacks };
    }
  }
  return dmg;
}

// Link Multiplier 스택별 보너스 (최대 4스택)
// 배틀 스킬: 30/45/60/75%, 궁극기: 20/30/40/50%
const LINK_SKILL_BONUS = [0, 0.30, 0.45, 0.60, 0.75];
const LINK_ULT_BONUS   = [0, 0.20, 0.30, 0.40, 0.50];

// ── 데미지 계산 (atkMult 추가) ──
function calcDmg(atk, mult, critMult, defMult, elemBonus, skillBonus, vulnMult, artsAmp, elemAmp, atkMult) {
  if (mult <= 0) return 0;
  return Math.round(
    atk * (atkMult || 1)
    * mult * critMult * defMult
    * (1 + elemBonus) * (1 + skillBonus)
    * (1 + vulnMult)
    * (1 + artsAmp)
    * (1 + elemAmp)
  );
}

// ── 활성 이펙트 → 배율 ──
function getLiveMultipliers(state, effects, t, charElem) {
  let vulnMult = 0, artsAmp = 0, elemAmp = 0, atkBonus = 0;
  for (let ei = 0; ei < effects.length; ei++) {
    if (state.effectExpiries[ei] <= t) continue;
    const e = effects[ei];
    switch (e.type) {
      case 'vulnerability':
        // 스택형 취약: baseVal + stacks × perStack (예: 질베르타 궁극기)
        if (e.stackable && state.charStacks) {
          vulnMult += (e.baseVal ?? e.val) + (state.charStacks[e.idx] || 0) * (e.perStack || 0);
        } else {
          vulnMult += e.val;
        }
        break;
      case 'arts_amp':
        // physExcluded: 물리 피해에는 적용 안 됨 (예: 자이히 스킬)
        if (e.physExcluded && charElem === '물리') break;
        artsAmp += e.val;
        break;
      case 'elem_amp':
        // elements 배열 지정 시 해당 원소만 적용 (예: 자이히 궁극기 → 냉기+자연)
        if (e.elements && charElem && !e.elements.includes(charElem)) break;
        elemAmp += e.val;
        break;
      case 'atk_up': atkBonus += e.val; break;
      case 'self_buff': break; // self_buff는 개인 스탯에 이미 반영
    }
  }
  // 감전 2차 효과: 아츠 피해 증가 (만료 전이면 artsAmp에 합산)
  if (state.reactionAmp && state.reactionAmp.expiry > t) {
    artsAmp += state.reactionAmp.val;
  }
  // 부식 2차 효과: 내성 감소 (만료 전이면 resReduce에 합산)
  let resReduce = 0;
  if (state.corrosionResReduce && state.corrosionResReduce.expiry > t) {
    resReduce = state.corrosionResReduce.val;
  }
  // 물리 취약 (Breach 디버프): 물리 원소 캐릭터에게만 적용
  if (charElem === '물리' && state.physVuln?.level > 0 && state.physVuln.expiry > t) {
    vulnMult += PHYS_VULN_BREACH[Math.min(4, state.physVuln.level)];
  }
  return { vulnMult, artsAmp, elemAmp, atkMult: 1 + atkBonus, resReduce };
}

// 부식 내성 감소 반영한 실시간 방어 배율 계산
// resReduce > 0 이면 보스 DEF를 낮춰 defMult를 재계산
function getLiveDefMult(resReduce, fallbackDefMult) {
  if (resReduce > 0) {
    return 100 / (100 + Math.max(0, BOSS_DEF - resReduce));
  }
  return fallbackDefMult;
}

// ── SP 시간 진행 ──
function advanceSp(state, newTime) {
  if (newTime <= state.lastSpTime) return;
  const regenStart = Math.max(state.lastSpTime, state.spResumeTime);
  if (newTime > regenStart) {
    state.teamSp = Math.min(SP.max_sp, state.teamSp + (newTime - regenStart) * SP.regen_rate);
  }
  state.lastSpTime = newTime;
}

// ── 상태 복제 (성능 최적화: events는 COW 방식) ──
function cloneState(s) {
  return {
    slots: s.slots.map(c => ({ ...c })),
    effectExpiries: s.effectExpiries.slice(),
    enhancedUntil: s.enhancedUntil.slice(),
    ultBlockUntil: s.ultBlockUntil.slice(),
    teamSp: s.teamSp, lastSpTime: s.lastSpTime, spResumeTime: s.spResumeTime,
    totalDmg: s.totalDmg, remainingHp: s.remainingHp,
    staggerCurrent: s.staggerCurrent, staggerBreakEndTime: s.staggerBreakEndTime,
    executionDone: s.executionDone,
    events: s.events.slice(), // shallow copy
    skillUsed: s.skillUsed, linkUsed: s.linkUsed, ultUsed: s.ultUsed, basicUsed: s.basicUsed,
    charStacks: s.charStacks ? s.charStacks.slice() : [],
    artsInfliction: { type: s.artsInfliction.type, level: s.artsInfliction.level },
    reactionAmp: { val: s.reactionAmp?.val || 0, expiry: s.reactionAmp?.expiry || 0 },
    corrosionResReduce: { val: s.corrosionResReduce?.val || 0, expiry: s.corrosionResReduce?.expiry || 0 },
    frozenUntil: s.frozenUntil || 0,
    frozenLevel: s.frozenLevel || 0,
    physVuln: { level: s.physVuln?.level || 0, expiry: s.physVuln?.expiry || 0 },
    linkStack: s.linkStack || 0,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 가능한 행동 열거 v7 — 기본 공격 분기 축소
// ═══════════════════════════════════════════════════════════════════
function getPossibleMoves(state, t, chars, simTime) {
  const moves = [];
  for (let ci = 0; ci < chars.length; ci++) {
    const cs = state.slots[ci];
    if (cs.nextTime > t + ACTION_WINDOW) continue;
    const at = Math.max(t, cs.nextTime);
    if (at >= simTime) continue;
    const c = chars[ci];

    let hasHighPriorityAction = false;

    // 궁극기
    if (cs.ultGauge >= c.ult_cost && c.ult_dur > 0) {
      moves.push({ ci, action: 'ult', time: at });
      hasHighPriorityAction = true;
    }
    // 연계 스킬
    if (at >= cs.linkCdEnd && at > 1.5 && c.link_dur > 0) {
      moves.push({ ci, action: 'link', time: at });
      hasHighPriorityAction = true;
    }
    // 배틀 스킬
    if (state.teamSp >= SP.skill_cost && c.skill_dur > 0) {
      moves.push({ ci, action: 'skill', time: at });
      hasHighPriorityAction = true;
    }

    // 기본 공격: 고우선 행동이 없거나, SP가 부족해서 곧 회복될 때만
    // 또한 강화 평타 중이면 항상 기본 공격 옵션 제공
    if (!hasHighPriorityAction || (state.enhancedUntil[ci] > t && c.enhancedBasicMult > 0)) {
      moves.push({ ci, action: 'basic', time: at });
    }
  }
  return moves;
}

// ═══════════════════════════════════════════════════════════════════
// 행동 실행 v7 — teamGaugeGain + 틱 SP + blockWindow + atkMult
// ═══════════════════════════════════════════════════════════════════
function executeAction(state, ci, action, t, chars, effects, defMult, staggerData) {
  const c = chars[ci];
  const cs = state.slots[ci];

  const mults = getLiveMultipliers(state, effects, t, c.element);
  const liveDefMult = getLiveDefMult(mults.resReduce, defMult); // 부식 내성 감소 반영
  const liveAtk = c.finalAtk * mults.atkMult;
  const dmgOf = (mult, bonus) => calcDmg(liveAtk, mult, c.critMult, liveDefMult, c.elemBonus, bonus, mults.vulnMult, mults.artsAmp, mults.elemAmp, 1);

  let dmg = 0, dur = 0, actionLabel = '', actionTag = '', evAction = action;

  if (action === 'ult') {
    dur = c.ult_dur;
    dmg = c.ultMult > 0 ? dmgOf(c.ultMult, c.ultBonus) : 0;
    // Link Multiplier: 쌓인 링크 스택에 따른 궁극기 보너스
    { const ls = Math.min(4, state.linkStack || 0); if (ls > 0 && dmg > 0) dmg = Math.round(dmg * (1 + LINK_ULT_BONUS[ls])); }
    state.linkStack = 0; // 궁극기 사용 시 링크 스택 소모
    cs.ultGauge = 0;
    // SP: freeze + 틱 SP + gain
    state.spResumeTime = Math.max(state.spResumeTime, t + SP.link_regen_pause);
    state.teamSp = Math.min(SP.max_sp, state.teamSp + (c.ultTickSp || 0) + (c.ult_sp_gain || 0));
    // 이펙트 활성화
    for (let ei = 0; ei < effects.length; ei++) {
      const e = effects[ei];
      if (e.idx === ci && e.trigger === 'ult') {
        if (e.type === 'enhancement') {
          // 강화 시간은 궁극기 시전 완료 후부터 시작 (t + ult_dur + enhancement_val)
          // → dur = enhancedUntil - t_action_start = enhancement_val (정확히 7s)
          state.enhancedUntil[ci] = t + c.ult_dur + e.val;
        } else {
          // 스택형 이펙트: 사용마다 스택 증가 (예: 질베르타 취약)
          if (e.stackable && state.charStacks) {
            state.charStacks[ci] = Math.min(e.maxStacks || 5, (state.charStacks[ci] || 0) + 1);
          }
          state.effectExpiries[ei] = t + e.duration;
        }
      }
    }
    // blockWindow: 궁극기 시전 + 강화 기간 동안 게이지 충전 차단
    state.ultBlockUntil[ci] = t + (c.ult_blockDuration || c.ult_dur);
    // 아츠 이상 처리 (궁극기 anomaly 목록)
    if (c.ult_anomaly_list) {
      for (const anomaly of c.ult_anomaly_list) {
        dmg += applyArtsAnomaly(state, anomaly, c, liveDefMult, mults, t);
      }
    }
    state.ultUsed++;
    actionLabel = '궁극기'; actionTag = 'tag-ult';
    // teamGaugeGain (궁극기는 팀 게이지 미공유 — Endaxis 기준)

  } else if (action === 'link') {
    dur = c.link_dur;
    dmg = c.linkMult > 0 ? dmgOf(c.linkMult, c.linkBonus) : 0;
    cs.linkCdEnd = t + cs.baseLinkCd;
    // SP: freeze + 틱 SP + gain
    state.spResumeTime = Math.max(state.spResumeTime, t + SP.link_regen_pause);
    state.teamSp = Math.min(SP.max_sp, state.teamSp + (c.linkTickSp || 0) + (c.link_sp_gain || 0));
    // 자기 게이지
    if (state.ultBlockUntil[ci] <= t) {
      cs.ultGauge = Math.min(c.ult_cost, cs.ultGauge + (c.link_gauge || 10));
    }
    // 이펙트
    for (let ei = 0; ei < effects.length; ei++) {
      if (effects[ei].idx === ci && effects[ei].trigger === 'link') {
        state.effectExpiries[ei] = t + effects[ei].duration;
      }
    }
    // 아츠 이상 처리 (연계 스킬 anomaly)
    if (c.link_anomaly) dmg += applyArtsAnomaly(state, c.link_anomaly, c, liveDefMult, mults, t);
    // Link 스택 증가 (최대 4): 여풍·아케쿠리만 링크 부여
    if (c.grants_link) state.linkStack = Math.min(4, (state.linkStack || 0) + 1);
    state.linkUsed++;
    actionLabel = '연계 스킬'; actionTag = 'tag-link';

  } else if (action === 'skill') {
    dur = c.skill_dur;
    dmg = c.skillMult > 0 ? dmgOf(c.skillMult, c.skillBonus) : 0;
    // Link Multiplier: 쌓인 링크 스택에 따른 배틀 스킬 보너스
    { const ls = Math.min(4, state.linkStack || 0); if (ls > 0 && dmg > 0) dmg = Math.round(dmg * (1 + LINK_SKILL_BONUS[ls])); }
    state.linkStack = 0; // 배틀 스킬 사용 시 링크 스택 소모
    // SP: 소모 + freeze + 틱 SP + gain
    state.teamSp -= SP.skill_cost;
    state.spResumeTime = Math.max(state.spResumeTime, t + SP.skill_regen_pause);
    state.teamSp = Math.min(SP.max_sp, state.teamSp + (c.skillTickSp || 0) + (c.skill_sp_gain || 0));
    // 자기 게이지
    if (state.ultBlockUntil[ci] <= t) {
      cs.ultGauge = Math.min(c.ult_cost, cs.ultGauge + (c.skill_gauge || 6.5));
    }
    // teamGaugeGain: 팀원들에게 게이지 공유
    if (c.skill_teamGaugeGain > 0) {
      for (let j = 0; j < chars.length; j++) {
        if (j === ci) continue;
        if (!chars[j].accept_team_gauge) continue;
        if (state.ultBlockUntil[j] > t) continue; // blockWindow 중이면 미수신
        state.slots[j].ultGauge = Math.min(chars[j].ult_cost, state.slots[j].ultGauge + c.skill_teamGaugeGain);
      }
    }
    // 이펙트
    for (let ei = 0; ei < effects.length; ei++) {
      if (effects[ei].idx === ci && effects[ei].trigger === 'skill') {
        state.effectExpiries[ei] = t + effects[ei].duration;
      }
    }
    // 아츠 이상 처리 (배틀 스킬 anomaly)
    if (c.skill_anomaly) dmg += applyArtsAnomaly(state, c.skill_anomaly, c, liveDefMult, mults, t);
    state.skillUsed++;
    actionLabel = '배틀 스킬'; actionTag = 'tag-skill';

  } else { // basic
    const isEnhanced = state.enhancedUntil[ci] > t && c.enhancedBasicMult > 0;
    // finisher(이본): 잔여 강화 시간 전체를 1액션으로 소비
    // cycle(레바테인): 강화 중에도 일반 사이클 반복
    dur = isEnhanced
      ? (c.enhancedMode === 'cycle' ? c.cycle : (state.enhancedUntil[ci] - t))
      : c.cycle;
    let basicMult = isEnhanced ? c.enhancedBasicMult : c.basicMult;
    // 강화 평타는 치명타 스택 효과가 있는 경우 enhancedCritMult 사용
    const usedCritMult = isEnhanced && c.enhancedCritMult ? c.enhancedCritMult : c.critMult;
    dmg = calcDmg(liveAtk, basicMult, usedCritMult, liveDefMult, c.elemBonus, c.basicBonus || 0, mults.vulnMult, mults.artsAmp, mults.elemAmp, 1);
    state.teamSp = Math.min(SP.max_sp, state.teamSp + (c.sp_gain || 0));
    // 기본 공격 게이지 (blockWindow 체크)
    if (state.ultBlockUntil[ci] <= t) {
      cs.ultGauge = Math.min(c.ult_cost, cs.ultGauge + (c.ult_gauge_per_basic || 10));
    }
    // 스태거
    if (staggerData.maxStagger > 0 && t >= state.staggerBreakEndTime) {
      state.staggerCurrent += (c.staggerPerCycle || 0);
      if (state.staggerCurrent >= staggerData.maxStagger) {
        state.staggerBreakEndTime = t + (staggerData.breakDuration || 10);
        state.executionDone = false;
        state.staggerCurrent = 0;
      }
    }
    state.basicUsed++;
    if (isEnhanced) {
      evAction = 'enhanced';
      actionLabel = '⚡강화 공격';
      actionTag = 'tag-enhanced';
    } else {
      actionLabel = '기본 공격';
      actionTag = 'tag-basic';
    }
  }

  // 스태거 배율 ×1.3 (스태거 상태인 동안 모든 공격)
  if (state.staggerBreakEndTime > t) dmg = Math.round(dmg * 1.3);

  // 데미지 적용
  state.totalDmg += dmg;
  state.remainingHp = Math.max(0, state.remainingHp - dmg);
  cs.nextTime = t + dur;

  // 이벤트 기록
  state.events.push({
    time: t, duration: dur, charName: c.name, element: c.element,
    action: evAction, actionLabel, actionTag, dmg, sp: Math.round(state.teamSp)
  });
}

// ═══════════════════════════════════════════════════════════════════
// Rollout 평가 — greedy 플레이아웃으로 실제 kill_time 추정
// ═══════════════════════════════════════════════════════════════════

// greedy 우선순위: ult(4) > link(3) > skill(2) > 강화basic(1.5) > basic(0)
function greedyMove(state, t, chars) {
  let best = null, bestPriority = -1;
  for (let ci = 0; ci < chars.length; ci++) {
    const cs = state.slots[ci];
    if (cs.nextTime > t + ACTION_WINDOW) continue;
    const at = Math.max(t, cs.nextTime);
    const c = chars[ci];
    if (cs.ultGauge >= c.ult_cost && c.ult_dur > 0 && 4 > bestPriority) {
      bestPriority = 4; best = { ci, action: 'ult', time: at };
    }
    if (at >= cs.linkCdEnd && at > 1.5 && c.link_dur > 0 && 3 > bestPriority) {
      bestPriority = 3; best = { ci, action: 'link', time: at };
    }
    if (state.teamSp >= SP.skill_cost && c.skill_dur > 0 && 2 > bestPriority) {
      bestPriority = 2; best = { ci, action: 'skill', time: at };
    }
    if (state.enhancedUntil[ci] > t && c.enhancedBasicMult > 0 && 1.5 > bestPriority) {
      bestPriority = 1.5; best = { ci, action: 'basic', time: at };
    }
  }
  // fallback: 가장 일찍 행동 가능한 캐릭터 기본 공격
  if (!best) {
    for (let ci = 0; ci < chars.length; ci++) {
      const cs = state.slots[ci];
      if (cs.nextTime > t + ACTION_WINDOW) continue;
      const at = Math.max(t, cs.nextTime);
      if (!best || at < best.time) best = { ci, action: 'basic', time: at };
    }
  }
  return best;
}

// rollout: 빔 후보 상태에서 greedy로 롤아웃 → 예상 kill_time 반환 (낮을수록 좋음)
function rolloutScore(state, chars, effects, defMult, staggerData, rolloutTime) {
  const rs = {
    slots: state.slots.map(c => ({ ...c })),
    effectExpiries: state.effectExpiries.slice(),
    enhancedUntil: state.enhancedUntil.slice(),
    ultBlockUntil: state.ultBlockUntil.slice(),
    teamSp: state.teamSp, lastSpTime: state.lastSpTime, spResumeTime: state.spResumeTime,
    totalDmg: state.totalDmg, remainingHp: state.remainingHp,
    staggerCurrent: state.staggerCurrent, staggerBreakEndTime: state.staggerBreakEndTime,
    executionDone: state.executionDone, events: [],
    skillUsed: 0, linkUsed: 0, ultUsed: 0, basicUsed: 0,
    charStacks: state.charStacks ? state.charStacks.slice() : [],
    artsInfliction: { type: state.artsInfliction?.type || null, level: state.artsInfliction?.level || 0 },
    reactionAmp: { val: state.reactionAmp?.val || 0, expiry: state.reactionAmp?.expiry || 0 },
    corrosionResReduce: { val: state.corrosionResReduce?.val || 0, expiry: state.corrosionResReduce?.expiry || 0 },
    frozenUntil: state.frozenUntil || 0,
    frozenLevel: state.frozenLevel || 0,
    physVuln: { level: state.physVuln?.level || 0, expiry: state.physVuln?.expiry || 0 },
    linkStack: state.linkStack || 0,
  };
  for (let step = 0; step < 500; step++) {
    if (rs.remainingHp <= 0) {
      return rs.events.length ? rs.events[rs.events.length - 1].time : rolloutTime;
    }
    const t = Math.min(...rs.slots.map(c => c.nextTime));
    if (t >= rolloutTime) break;
    advanceSp(rs, t);
    const move = greedyMove(rs, t, chars);
    if (!move) break;
    executeAction(rs, move.ci, move.action, move.time, chars, effects, defMult, staggerData);
  }
  if (rs.remainingHp <= 0) {
    return rs.events.length ? rs.events[rs.events.length - 1].time : rolloutTime;
  }
  // 킬 실패 시: 남은 HP를 현재 DPS로 추정
  const t = Math.min(...rs.slots.map(c => c.nextTime));
  if (rs.totalDmg <= 0) return 1e9;
  return t + rs.remainingHp / (rs.totalDmg / t);
}

// ═══════════════════════════════════════════════════════════════════
// 스코어링 v7 — 서포터 스킬 정상 평가
// ═══════════════════════════════════════════════════════════════════
function scoreBeam(s, chars, effects) {
  if (s.remainingHp <= 0) return -1e9;
  const t = Math.min(...s.slots.map(c => c.nextTime));
  if (t <= 0) return 1e12;

  // === 1. 기본 DPS 기반 추정 (0딜 보정 포함) ===
  let estKillTime;
  if (s.totalDmg <= 0) {
    estKillTime = 1e6; // 아직 데미지 0이면 매우 나쁜 스코어
  } else {
    const dps = s.totalDmg / t;
    estKillTime = t + s.remainingHp / dps;
  }

  // === 2. 버프/디버프 예상 DPS 부스트 ===
  // 활성 이펙트가 남은 딜에 미치는 영향을 추정
  let buffDpsMult = 1.0;
  for (let ei = 0; ei < effects.length; ei++) {
    const remaining = s.effectExpiries[ei] - t;
    if (remaining <= 0) continue;
    const e = effects[ei];
    const coverage = Math.min(remaining, 10) / 10; // 남은 시간 비율 (최대 10초 기준)
    switch (e.type) {
      case 'vulnerability': buffDpsMult += e.val * coverage; break;
      case 'arts_amp': buffDpsMult += e.val * coverage; break;
      case 'elem_amp': buffDpsMult += e.val * coverage; break;
      case 'atk_up': buffDpsMult += e.val * coverage; break;
    }
  }
  // 버프로 인한 예상 킬타임 감소
  if (buffDpsMult > 1.0 && s.totalDmg > 0) {
    const boostedDps = (s.totalDmg / t) * buffDpsMult;
    const boostedKillTime = t + s.remainingHp / boostedDps;
    estKillTime = Math.min(estKillTime, boostedKillTime);
  }

  // === 3. 궁극기 게이지 보너스 ===
  // 궁극기가 거의 찬 캐릭터 → 곧 큰 데미지 들어올 예정
  let ultBonus = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const cs = s.slots[i];
    if (c.ult_cost > 0) {
      const ratio = cs.ultGauge / c.ult_cost;
      // 궁극기 배율이 높을수록 가치가 큼
      const ultValue = c.ultMult > 0 ? 2.0 : 0.5; // 서포터 궁도 가치 있음
      ultBonus += ratio * ultValue;
    }
  }

  // === 4. 강화 평타 보너스 ===
  let enhBonus = 0;
  for (let i = 0; i < chars.length; i++) {
    if (s.enhancedUntil[i] > t && chars[i].enhancedBasicMult > 0) {
      enhBonus += (s.enhancedUntil[i] - t) * 0.5;
    }
  }

  // === 5. SP 보너스/페널티 ===
  const spRatio = s.teamSp / SP.max_sp;
  const spBonus = spRatio * 1.0;
  const spPenalty = s.teamSp < SP.skill_cost * 0.5 ? 1.5 : 0;

  // === 6. Link 스택 보너스 ===
  // 스택이 쌓여 있으면 다음 스킬/궁에 보너스가 붙을 예정 → 더 좋은 상태
  const ls = s.linkStack || 0;
  const linkBonusScore = ls > 0 ? (LINK_SKILL_BONUS[Math.min(4, ls)] * 2.0) : 0;

  return estKillTime - ultBonus - enhBonus - spBonus + spPenalty - linkBonusScore;
}

// ═══════════════════════════════════════════════════════════════════
// 빔 확장 v7 — 동시 행동 지원
// ═══════════════════════════════════════════════════════════════════
function expandBeam(beam, chars, effects, defMult, staggerData, simTime) {
  const t = Math.min(...beam.slots.map(c => c.nextTime));
  if (t >= simTime || beam.remainingHp <= 0) return [];

  // 처형 우선 처리
  if (staggerData.maxStagger > 0 && t < beam.staggerBreakEndTime && !beam.executionDone) {
    const mainSlot = beam.slots[0];
    const execTime = Math.max(t, mainSlot.nextTime);
    if (execTime < beam.staggerBreakEndTime) {
      const nb = cloneState(beam);
      advanceSp(nb, execTime);
      nb.teamSp = Math.min(SP.max_sp, nb.teamSp + (staggerData.execRecovery || 25));
      const execMults = getLiveMultipliers(nb, effects, execTime, chars[0].element);
      const liveAtk = chars[0].finalAtk * execMults.atkMult;
      const execDefMult = getLiveDefMult(execMults.resReduce, defMult);
      let execDmg = calcDmg(liveAtk, chars[0].execMult || 9, chars[0].critMult, execDefMult, chars[0].elemBonus, 0, execMults.vulnMult, execMults.artsAmp, execMults.elemAmp, 1);
      execDmg = Math.round(execDmg * 1.3); // 처형은 항상 스태거 중
      nb.totalDmg += execDmg;
      nb.remainingHp = Math.max(0, nb.remainingHp - execDmg);
      nb.executionDone = true; nb.staggerCurrent = 0;
      nb.events.push({
        time: execTime, duration: 0.8, charName: chars[0].name, element: chars[0].element,
        action: 'exec', actionLabel: '⚡처형', actionTag: 'tag-ult', dmg: execDmg, sp: Math.round(nb.teamSp)
      });
      nb.slots[0].nextTime = execTime + 0.83;
      return [nb];
    }
  }

  const moves = getPossibleMoves(beam, t, chars, simTime);
  if (moves.length === 0) return [];

  const results = [];
  for (const move of moves) {
    const nb = cloneState(beam);
    advanceSp(nb, move.time);
    executeAction(nb, move.ci, move.action, move.time, chars, effects, defMult, staggerData);

    // ── 동시 행동: 주행동 중 idle 캐릭터 auto-basic ──
    if (move.action !== 'basic') {
      for (let oi = 0; oi < chars.length; oi++) {
        if (oi === move.ci) continue;
        const ocs = nb.slots[oi];
        if (ocs.nextTime <= move.time + 0.1) {
          const autoTime = Math.max(move.time, ocs.nextTime);
          if (autoTime < simTime) {
            const oc = chars[oi];
            const oMults = getLiveMultipliers(nb, effects, autoTime, oc.element);
            let bm = oc.basicMult;
            const autoEnhanced = nb.enhancedUntil[oi] > autoTime && oc.enhancedBasicMult > 0;
            if (autoEnhanced) bm = oc.enhancedBasicMult;
            const autoCrit = autoEnhanced && oc.enhancedCritMult ? oc.enhancedCritMult : oc.critMult;
            const autoDefMult = getLiveDefMult(oMults.resReduce, defMult);
            let aDmg = calcDmg(oc.finalAtk * oMults.atkMult, bm, autoCrit, autoDefMult, oc.elemBonus, oc.basicBonus || 0, oMults.vulnMult, oMults.artsAmp, oMults.elemAmp, 1);
            if (nb.staggerBreakEndTime > autoTime) aDmg = Math.round(aDmg * 1.3);
            nb.totalDmg += aDmg;
            nb.remainingHp = Math.max(0, nb.remainingHp - aDmg);
            nb.teamSp = Math.min(SP.max_sp, nb.teamSp + (oc.sp_gain || 0));
            if (nb.ultBlockUntil[oi] <= autoTime) {
              ocs.ultGauge = Math.min(oc.ult_cost, ocs.ultGauge + (oc.ult_gauge_per_basic || 10));
            }
            const autoDur = autoEnhanced
              ? (oc.enhancedMode === 'cycle' ? oc.cycle : (nb.enhancedUntil[oi] - autoTime))
              : oc.cycle;
            ocs.nextTime = autoTime + autoDur;
            nb.basicUsed++;
            // 이벤트 기록 (타임라인·로테이션 표시용)
            nb.events.push({
              time: autoTime, duration: autoDur, charName: oc.name, element: oc.element,
              action: autoEnhanced ? 'enhanced' : 'basic',
              actionLabel: autoEnhanced ? '⚡강화 공격' : '기본 공격',
              actionTag: autoEnhanced ? 'tag-enhanced' : 'tag-basic',
              dmg: aDmg, sp: Math.round(nb.teamSp)
            });
          }
        }
      }
    }

    results.push(nb);
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════
// 빔 서치 메인 v7
// ═══════════════════════════════════════════════════════════════════
function beamSearch(params) {
  SP = params.sp;
  BOSS_DEF = params.bossDef || 100;
  const { chars, effects, defMult, staggerData, totalHp, simTime } = params;
  const timeLimitMs = params.timeLimitMs || DEFAULT_TIME_LIMIT;

  let beams = [params.initialState];
  let bestResult = null;
  const startTime = Date.now();
  let lastProgress = startTime;
  let step = 0;

  function updateBest(b, kt) {
    if (!bestResult || (kt !== null && (bestResult.killTime === null || kt < bestResult.killTime))
      || (kt === null && bestResult.killTime === null && b.totalDmg > bestResult.totalDmg)) {
      bestResult = buildResult(b, kt, totalHp, simTime, chars);
    }
  }

  while (beams.length > 0) {
    if (Date.now() - startTime > timeLimitMs) break;
    if (Date.now() - lastProgress >= PROGRESS_INTERVAL_MS) {
      const minT = Math.min(...beams.map(b => Math.min(...b.slots.map(c => c.nextTime))));
      postMessage({ type: 'progress', pct: Math.min(99, Math.round(minT / simTime * 100)), bestKillTime: bestResult?.killTime ?? null, step });
      lastProgress = Date.now();
    }

    const active = [];
    for (const b of beams) {
      const minT = Math.min(...b.slots.map(c => c.nextTime));
      if (minT >= simTime || b.remainingHp <= 0) {
        updateBest(b, b.remainingHp <= 0 ? (b.events.length ? b.events[b.events.length - 1].time : simTime) : null);
      } else { active.push(b); }
    }
    if (active.length === 0) break;

    const nextBeams = [];
    for (const b of active) {
      for (const nb of expandBeam(b, chars, effects, defMult, staggerData, simTime)) {
        nextBeams.push(nb);
      }
      if (nextBeams.length >= MAX_CANDIDATES) break;
    }
    if (nextBeams.length === 0) break;

    // heuristic 정렬 후 빔 너비로 축소
    nextBeams.sort((a, b) => scoreBeam(a, chars, effects) - scoreBeam(b, chars, effects));
    const width = step < EARLY_STEPS ? EARLY_BEAM_WIDTH : BEAM_WIDTH;
    beams = nextBeams.slice(0, width);
    step++;
  }

  for (const b of beams) {
    updateBest(b, b.remainingHp <= 0 ? (b.events.length ? b.events[b.events.length - 1].time : simTime) : null);
  }
  return bestResult ?? buildResult(params.initialState, null, totalHp, simTime, chars);
}

function buildResult(b, killTime, totalHp, simTime, chars) {
  const actualTime = b.events.length ? b.events[b.events.length - 1].time : simTime;
  const kt = killTime ?? (b.remainingHp <= 0 ? actualTime : null);
  const t = kt ?? Math.min(actualTime, simTime);
  const dps = t > 0 ? Math.round(b.totalDmg / t) : 0;
  const charDmg = {}; const typeDmg = { basic: 0, skill: 0, link: 0, ult: 0 };
  chars.forEach(c => { charDmg[c.name] = 0; });
  b.events.forEach(ev => {
    if (ev.dmg > 0) {
      charDmg[ev.charName] = (charDmg[ev.charName] || 0) + ev.dmg;
      const k = ev.action === 'exec' ? 'ult' : ev.action === 'enhanced' ? 'basic' : ev.action;
      if (typeDmg[k] !== undefined) typeDmg[k] += ev.dmg;
    }
  });
  return {
    events: b.events, totalDmg: b.totalDmg, dps, killTime: kt, simTime: t,
    remainingHp: b.remainingHp, totalHp, charDmg, typeDmg,
    skillUsed: b.skillUsed, linkUsed: b.linkUsed, ultUsed: b.ultUsed, basicUsed: b.basicUsed, chars
  };
}

// ═══════════════════════════════════════════════════════════════════
// 강제 루트 테스트 — 지정된 행동 시퀀스를 순서대로 실행
// ═══════════════════════════════════════════════════════════════════
function forcedPlay(params) {
  SP = params.sp;
  BOSS_DEF = params.bossDef || 100;
  const { chars, effects, defMult, staggerData, totalHp, simTime, forcedSequence } = params;

  // 캐릭터 이름 → 인덱스 맵
  const charIndex = {};
  chars.forEach((c, i) => { charIndex[c.name] = i; });

  const state = cloneState(params.initialState);
  let seqIdx = 0;

  for (let step = 0; step < 3000; step++) {
    if (state.remainingHp <= 0) break;
    const t = Math.min(...state.slots.map(c => c.nextTime));
    if (t >= simTime) break;

    let move = null;

    // 시퀀스 실행
    if (seqIdx < forcedSequence.length) {
      const next = forcedSequence[seqIdx];
      const ci = charIndex[next.charName];
      if (ci !== undefined) {
        const cs = state.slots[ci];
        const c = chars[ci];
        const at = Math.max(t, cs.nextTime);

        // minTime 제약: 지정된 시간 이전엔 실행 안 함
        const minTime = next.minTime || 0;
        if (at < minTime) {
          // 아직 이른 시각 → 가장 일찍 행동 가능한 캐릭터 기본 공격으로 시간 진행
          let earliest = null;
          for (let ci2 = 0; ci2 < chars.length; ci2++) {
            const at2 = state.slots[ci2].nextTime;
            if (!earliest || at2 < earliest.time) {
              earliest = { ci: ci2, action: 'basic', time: at2 };
            }
          }
          move = earliest;
        } else {
          // SP 먼저 적용 (action 가능 여부 판단에 필요)
          advanceSp(state, t);

          let canDo = false;
          if (next.action === 'ult')   canDo = cs.ultGauge >= c.ult_cost && c.ult_dur > 0;
          else if (next.action === 'link')  canDo = at >= cs.linkCdEnd && at > 1.5 && c.link_dur > 0;
          else if (next.action === 'skill') canDo = state.teamSp >= SP.skill_cost && c.skill_dur > 0;
          else if (next.action === 'basic') canDo = true;

          if (canDo) {
            move = { ci, action: next.action, time: at };
            seqIdx++;
          } else {
            // 아직 실행 불가 (자원 부족) → 기본 공격으로 대기
            let earliest = null;
            for (let ci2 = 0; ci2 < chars.length; ci2++) {
              const at2 = state.slots[ci2].nextTime;
              if (!earliest || at2 < earliest.time) {
                earliest = { ci: ci2, action: 'basic', time: at2 };
              }
            }
            move = earliest;
          }
        }
      }
    }

    // 시퀀스 소진 후 greedy로 계속
    if (!move) {
      advanceSp(state, t);
      move = greedyMove(state, t, chars);
    }
    if (!move) break;

    advanceSp(state, move.time);
    executeAction(state, move.ci, move.action, move.time, chars, effects, defMult, staggerData);
  }

  const kt = state.remainingHp <= 0
    ? (state.events.length ? state.events[state.events.length - 1].time : simTime)
    : null;
  return buildResult(state, kt, totalHp, simTime, chars);
}

self.onmessage = function (e) {
  if (e.data.type === 'start') {
    try { postMessage({ type: 'done', result: beamSearch(e.data.params) }); }
    catch (err) { postMessage({ type: 'error', msg: err.message + '\n' + (err.stack || '') }); }
  } else if (e.data.type === 'forced_start') {
    try { postMessage({ type: 'done', result: forcedPlay(e.data.params) }); }
    catch (err) { postMessage({ type: 'error', msg: err.message + '\n' + (err.stack || '') }); }
  }
};
