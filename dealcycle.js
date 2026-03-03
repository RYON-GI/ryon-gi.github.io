// ═══════════════════════════════════════════════════════════════════
// app.js — Endfield Party Optimizer 메인 앱 로직
// 새 DB 구조 (JSON) 기반 전면 재작성
// ═══════════════════════════════════════════════════════════════════
import { adaptCharacters, adaptEquipment, adaptBosses, adaptBuffItems } from './data/db_adapter.js';
import { WEAPON_DB } from './data/무기_DB.js';
import { SP_SYSTEM, calcDefMultiplier, calcCritMultiplier, PRIMARY_RATE, SECONDARY_RATE } from './data/효율공식_DB.js';

// ── JSON fetch ───────────────────────────────────────────────────
async function loadJson(path) { const r = await fetch(path); return r.json(); }

const [charRaw, equipRaw, bossRaw, buffRaw, timingRaw, beamRaw] = await Promise.all([
    loadJson('./data/캐릭터_db.json'),
    loadJson('./data/장비_db.json'),
    loadJson('./data/보스_db.json'),
    loadJson('./data/버프_db.json'),
    loadJson('./data/공격속도_db.json'),
    loadJson('./data/extracted_beam_search_data.json'),
]);

const CHAR_DB = adaptCharacters(charRaw, timingRaw, beamRaw);
const { SET_BONUS_EFFECTS, EQUIPMENT_DB, EQ_BY_SLOT } = adaptEquipment(equipRaw);
const ALL_ENEMIES = adaptBosses(bossRaw);
const BUFF_ITEM_DB = adaptBuffItems(buffRaw);

// ═══════════════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════════════
const CHAR_COLORS = ['#4ade80', '#60d4ff', '#c060ff', '#f0c050'];
const ELEM_COLORS = { 물리: '#a0b8d0', 열기: '#ff6b35', 냉기: '#60d4ff', 전기: '#ffe040', 자연: '#50e0a0' };
const SLOT_TYPES = ['글러브', '방어구', '부품①', '부품②'];
const SLOT_DB_KEY = ['글러브', '방어구', '부품', '부품'];
const BUFF_EFF_LABELS = { atk_flat: 'ATK', atk_pct: 'ATK%', crit_rate: '치명률', crit_dmg: '치명피해', all_dmg: '전피해%', phys_dmg: '물리%' };

// ── 캐릭터별 시너지 이펙트 (Endaxis gamedata + 캐릭터_db.json 기반) ──
const CHAR_EFFECTS = {
    // === 6성 ===
    '질베르타': [
        // 궁극기: 아츠 취약 (스택형 — 궁 사용마다 +0.03, 최대 5스택 = 0.45)
        { trigger: 'ult', type: 'vulnerability', val: 0.30, duration: 5, target: 'enemy', desc: '아츠 취약',
          stackable: true, maxStacks: 5, baseVal: 0.30, perStack: 0.03 },
        { trigger: 'link', type: 'arts_amp', val: 0.30, duration: 15, target: 'team', desc: '연계 아츠 증폭' },
    ],
    '이본': [
        { trigger: 'ult', type: 'enhancement', val: 7, duration: 7, target: 'self', desc: '강화 평타', mode: 'finisher' },
    ],
    '레바테인': [
        { trigger: 'ult', type: 'enhancement', val: 15, duration: 15, target: 'self', desc: '강화 평타', mode: 'cycle' },
    ],
    '아델리아': [
        { trigger: 'skill', type: 'vulnerability', val: 0.20, duration: 15, target: 'enemy', desc: '취약' },
    ],
    '여풍': [
        { trigger: 'link', type: 'atk_up', val: 0.15, duration: 20, target: 'team', desc: 'ATK 증가' },
        { trigger: 'skill', type: 'vulnerability', val: 0.10, duration: 10, target: 'enemy', desc: '물리 취약' },
    ],
    '라스트 라이트': [
        { trigger: 'skill', type: 'self_buff', val: 0.15, duration: 15, target: 'self', desc: '저온 주입' },
    ],
    // === 5성 ===
    '자이히': [
        { trigger: 'skill', type: 'arts_amp', val: 0.15, duration: 25, target: 'team', desc: '아츠 증폭 (비물리)', physExcluded: true },
        { trigger: 'link', type: 'arts_amp', val: 0.21, duration: 12, target: 'team', desc: '연계 증폭 (비물리)', physExcluded: true },
        { trigger: 'ult', type: 'elem_amp', val: 0.24, duration: 12, target: 'team', desc: '원소 증폭 (냉기+자연)', elements: ['냉기', '자연'] },  // val은 buildWorkerParams에서 INT 스케일 동적 보정
    ],
    '안탈': [
        { trigger: 'ult', type: 'elem_amp', val: 0.20, duration: 12, target: 'team', desc: '원소 증폭' },
    ],
    '에스텔라': [
        { trigger: 'link', type: 'vulnerability', val: 0.15, duration: 6, target: 'enemy', desc: '물리 취약' },
    ],
    '카치르': [
        { trigger: 'ult', type: 'vulnerability', val: 0.30, duration: 8, target: 'enemy', desc: '허약' },
    ],
};

const KEY_LABEL_MAP = {
    main_stat_pct: '주요 능력치 증가', sub_stat_pct: '보조 능력치 증가',
    skill_dmg: '배틀 스킬 피해', link_dmg: '연계 스킬 피해', ult_dmg: '궁극기 피해',
    atk_pct: 'ATK%', crit_rate: '치명타 확률', crit_dmg: '치명타 피해',
    arts_dmg: '아츠 피해', arts_power: '아츠 강도',
    cold_dmg: '냉기 피해', heat_dmg: '열기 피해', elec_dmg: '전기 피해',
    nat_dmg: '자연 피해', phys_dmg: '물리 피해', normal_dmg: '일반 공격 피해',
    main_stat: '주요 능력치', str: '힘', agi: '민첩', int: '지능', wil: '의지',
    cold_elec_dmg: '냉기/전기 피해', heat_nat_dmg: '열기/자연 피해',
    stagger_target_dmg: '불균형 피해', ult_eff: '궁극기 충전',
    sub_stat_pct: '보조 능력치',
};
function keyToLabel(key) { return KEY_LABEL_MAP[key] || key; }

// ═══════════════════════════════════════════════════════════════════
// 상태
// ═══════════════════════════════════════════════════════════════════
const party = [null, null, null, null];
const partyWeapons = [null, null, null, null];
const partyWpnSlotLv = [Array(8).fill(9), Array(8).fill(9), Array(8).fill(9), Array(8).fill(9)];
const partyEquip = [[null, null, null, null], [null, null, null, null], [null, null, null, null], [null, null, null, null]];
const partyForgeLv = [[[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]];
const partyPotential = [0, 0, 0, 0];
const partyTalentLv = [4, 4, 4, 4];
const partyBuffs = [null, null, null, null];
let selectedEnemy = null, activeSlot = -1, pickerFilter = 'all', simResult = null;
const partyOpen = [true, true, true, true];

// ═══════════════════════════════════════════════════════════════════
// 스탯 헬퍼
// ═══════════════════════════════════════════════════════════════════
function getWpnSlotVal(slot, lv) { return slot.vals ? (slot.vals[lv - 1] ?? slot.max) : slot.max; }
function getForgeVal(fg, lv) { return fg['lv' + lv] ?? fg.lv0 ?? 0; }
function getEquipStats(eq, forgeLvArr) {
    if (!eq) return {};
    const out = { ...eq.base };
    (eq.forge || []).forEach((fg, fi) => { out[fg.key] = getForgeVal(fg, Array.isArray(forgeLvArr) ? forgeLvArr[fi] || 0 : 0); });
    return out;
}
function getSetCounts(ci) {
    const cnt = {};
    partyEquip[ci].forEach(eq => { if (eq) cnt[eq.set] = (cnt[eq.set] || 0) + 1; });
    return cnt;
}
function getActiveSets(ci) { return Object.entries(getSetCounts(ci)).filter(([, n]) => n >= 3).map(([s]) => s); }

function getTalentBonus(c, talLv) {
    const b = { str: 0, agi: 0, int: 0, wil: 0 };
    if (!c.talents || !talLv) return b;
    for (let l = 1; l <= talLv; l++) {
        const t = c.talents[String(l)];
        if (t) for (const [k, v] of Object.entries(t)) if (k in b) b[k] += v;
    }
    return b;
}
function getPotBonus(c, potLv) {
    const b = { str: 0, agi: 0, int: 0, wil: 0, atk_pct: 0, crit_rate: 0, crit_dmg: 0 };
    if (!c.potentials || !potLv) return b;
    for (let l = 1; l <= potLv; l++) { const p = c.potentials[l]; if (p) for (const [k, v] of Object.entries(p)) if (k in b) b[k] += v; }
    return b;
}

function applySlotKey(key, v, a) {
    const DB = a.dmgBonus;
    switch (key) {
        case 'str': a.str += v; break; case 'agi': a.agi += v; break;
        case 'int': a.int_ += v; break; case 'wil': a.wil += v; break;
        case 'hp': a.hp += v; break; case 'def': a.def_ += v; break;
        case 'atk_pct': a.atkPct += v; break; case 'crit_rate': a.critRate += v; break;
        case 'crit_dmg': a.critDmg += v; break; case 'arts_power': a.artsPower += v; break;
        case 'ult_eff': a.ultEff += v; break;
        case 'heal': case 'dmg_reduction': break;
        case 'hp_pct': a.hpPct += v; break; case 'heal_pct': break;
        case 'main_stat_pct': a.mainStatPct += v; break;
        case 'sub_stat_pct': a.subStatPct += v; break;
        case 'main_stat':
            ({ 힘: 'str', 민첩: 'agi', 지능: 'int_', 의지: 'wil' })[a.main] && (a[({ 힘: 'str', 민첩: 'agi', 지능: 'int_', 의지: 'wil' })[a.main]] += v);
            break;
        default: if (key in DB) DB[key] += v;
    }
}

function makeAcc(c, pot, tal) {
    const lv = document.getElementById('gCharLv').value;
    const base = c.stats[lv] || c.stats['90'];
    if (!base) return null;
    return {
        main: c.main, sub: c.sub,
        str: base.str + (pot.str || 0) + (tal.str || 0),
        agi: base.agi + (pot.agi || 0) + (tal.agi || 0),
        int_: base.int + (pot.int || 0) + (tal.int || 0),
        wil: base.wil + (pot.wil || 0) + (tal.wil || 0),
        hp: base.hp, hpPct: 0, def_: 0, baseAtk: base.atk,
        atkPct: pot.atk_pct || 0, critRate: pot.crit_rate || 0, critDmg: pot.crit_dmg || 0,
        artsPower: 0, ultEff: 0, linkCdReduce: 0, mainStatPct: 0, subStatPct: 0,
        dmgBonus: {
            heat_dmg: 0, cold_dmg: 0, elec_dmg: 0, nat_dmg: 0, phys_dmg: 0,
            arts_dmg: 0, all_skill_dmg: 0, skill_dmg: 0, link_dmg: 0, ult_dmg: 0,
            attack_dmg: 0, cold_elec_dmg: 0, stagger_target_dmg: 0, heat_nat_dmg: 0,
            normal_dmg: 0,
        },
    };
}

function applyWpn(wpn, slotLvArr, a) {
    if (!wpn) return;
    (wpn.slots || []).forEach((s, si) => { applySlotKey(s.key, getWpnSlotVal(s, slotLvArr[si] || 9), a); });
    const buffStart = (wpn.slots || []).length;
    if (Array.isArray(wpn.buff)) {
        const buffLv = slotLvArr[buffStart] || 9;
        wpn.buff.forEach(b => {
            if (b.duration_s) return; // 조건부 팀 버프 → buildWorkerParams에서 팀 전체 적용
            const bv = b.vals ? (b.vals[buffLv - 1] ?? b.max) : b.max;
            applySlotKey(b.type, bv, a);
        });
    }
}

function applyEquips(equipArr, forgeLvArr2D, a, setCnt) {
    for (let si = 0; si < 4; si++) {
        const eq = equipArr[si]; if (!eq) continue;
        if (eq.set) setCnt[eq.set] = (setCnt[eq.set] || 0) + 1;
        for (const [k, v] of Object.entries(getEquipStats(eq, forgeLvArr2D[si]))) applySlotKey(k, v, a);
    }
}

function applySets(setCnt, a) {
    for (const [s, n] of Object.entries(setCnt)) {
        if (n < 3) continue;
        const e = SET_BONUS_EFFECTS[s] || {};
        if (e.atk_pct) a.atkPct += e.atk_pct;
        if (e.crit_rate) a.critRate += e.crit_rate;
        if (e.arts_power) a.artsPower += e.arts_power;
        if (e.all_skill_dmg) a.dmgBonus.all_skill_dmg += e.all_skill_dmg;
        if (e.link_cd_reduce) a.linkCdReduce += e.link_cd_reduce;
        // 원소별 조건부 피해 (전투 중 조건 상시 충족 가정)
        if (e.elec_dmg) a.dmgBonus.elec_dmg += e.elec_dmg;
        if (e.cold_dmg) a.dmgBonus.cold_dmg += e.cold_dmg;
        if (e.heat_dmg) a.dmgBonus.heat_dmg += e.heat_dmg;
        if (e.nat_dmg) a.dmgBonus.nat_dmg += e.nat_dmg;
    }
}

function finalizeAcc(a, c, wpn) {
    const STAT_KEY = { 힘: 'str', 민첩: 'agi', 지능: 'int_', 의지: 'wil' };
    const mainKey = STAT_KEY[c.main], subKey = STAT_KEY[c.sub];
    if (mainKey && a.mainStatPct) a[mainKey] = Math.ceil(a[mainKey] * (1 + a.mainStatPct));
    if (subKey && a.subStatPct) a[subKey] = Math.ceil(a[subKey] * (1 + a.subStatPct));
    const mv = { 힘: a.str, 민첩: a.agi, 지능: a.int_, 의지: a.wil }[c.main] || 0;
    const sv = { 힘: a.str, 민첩: a.agi, 지능: a.int_, 의지: a.wil }[c.sub] || 0;
    const wpnAtk = wpn ? wpn.atk : 411;
    const attrBonus = (1 + mv * PRIMARY_RATE + sv * SECONDARY_RATE);
    const finalAtk = Math.round((a.baseAtk + wpnAtk) * (1 + a.atkPct) * attrBonus);
    const finalHp = Math.round((a.hp + (a.str || 0) * 5) * (1 + (a.hpPct || 0)));
    return {
        finalAtk, critRate: a.critRate, critDmg: a.critDmg, artsPower: a.artsPower, ultEff: a.ultEff,
        dmgBonus: a.dmgBonus, linkCdReduce: a.linkCdReduce, str: a.str, agi: a.agi, int: a.int_, wil: a.wil,
        hp: finalHp, def: a.def_
    };
}

function calcStats(ci) {
    const c = party[ci]; if (!c) return null;
    const pot = getPotBonus(c, partyPotential[ci]);
    const tal = getTalentBonus(c, partyTalentLv[ci]);
    const a = makeAcc(c, pot, tal); if (!a) return null;
    const wpn = partyWeapons[ci]; const slv = partyWpnSlotLv[ci];
    applyWpn(wpn, slv, a);
    const setCnt = {};
    applyEquips(partyEquip[ci], partyForgeLv[ci], a, setCnt);
    applySets(setCnt, a);
    return finalizeAcc(a, c, wpn);
}

function calcStatsForSim(c, wpn, wpnSlotLvArr, equipArr, forgeLvArr2D, potLv, talLv = 4) {
    const pot = getPotBonus(c, potLv);
    const tal = getTalentBonus(c, talLv);
    const a = makeAcc(c, pot, tal); if (!a) return { finalAtk: 0, critRate: 0, critDmg: 0, artsPower: 0, ultEff: 0, dmgBonus: {}, linkCdReduce: 0, str: 0, agi: 0, int: 0, wil: 0, hp: 0, def: 0 };
    const setCnt = {};
    applyWpn(wpn, wpnSlotLvArr, a);
    applyEquips(equipArr, forgeLvArr2D, a, setCnt);
    applySets(setCnt, a);
    return finalizeAcc(a, c, wpn);
}

function getBuffEffectsFor(ci) {
    const out = { atk_flat: 0, atk_pct: 0, crit_rate: 0, crit_dmg: 0, all_dmg: 0 };
    const item = BUFF_ITEM_DB.find(b => b.id === partyBuffs[ci]);
    if (!item) return out;
    for (const ef of item.effects || []) if (ef.type in out) out[ef.type] += ef.val;
    return out;
}

function fmtStat(v) {
    if (typeof v !== 'number') return String(v);
    if (v === 0) return '0';
    return v > 0 && v < 10 ? '+' + (v * 100).toFixed(1) + '%' : String(Math.round(v));
}

// ═══════════════════════════════════════════════════════════════════
// 스펙 모달
// ═══════════════════════════════════════════════════════════════════
function showSpecModal(ci) {
    const c = party[ci]; if (!c) return;
    const s = calcStats(ci); if (!s) return;
    const crBase = parseInt(document.getElementById('gCritRate').value) / 100;
    const cdBase = parseInt(document.getElementById('gCritDmg').value) / 100;
    const totalCrit = Math.min(1, crBase + s.critRate);
    const totalCD = cdBase + s.critDmg;
    const pct = v => Math.abs(v) > 0.0001 ? '+' + (v * 100).toFixed(1) + '%' : '—';
    const activeSets = getActiveSets(ci);
    const db = s.dmgBonus;
    const rows = [
        { l: '힘', v: s.str }, { l: '민첩', v: s.agi }, { l: '지능', v: s.int }, { l: '의지', v: s.wil },
        { l: '생명력', v: (s.hp || 0).toLocaleString() }, { l: '방어력', v: s.def > 0 ? s.def : '—' },
        { l: '공격력', v: s.finalAtk.toLocaleString(), c: '#4ade80' },
        { l: '치명타 확률', v: (totalCrit * 100).toFixed(1) + '%', c: '#f0c050' },
        { l: '치명타 피해', v: (totalCD * 100).toFixed(0) + '%', c: '#f0c050' },
        { l: '아츠 강도', v: s.artsPower > 0 ? '+' + s.artsPower.toFixed(0) : '0', c: '#c060ff' },
        { sep: true, l: '피해 보너스' },
        { l: '물리', v: pct(db.phys_dmg), c: '#a0b8d0' }, { l: '열기', v: pct(db.heat_dmg), c: '#ff6b35' },
        { l: '전기', v: pct(db.elec_dmg), c: '#ffe040' }, { l: '냉기', v: pct(db.cold_dmg), c: '#60d4ff' },
        { l: '자연', v: pct(db.nat_dmg), c: '#50e0a0' },
    ];
    document.getElementById('specModalContent').innerHTML = `
  <div style="padding-right:20px">
    <div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:3px">${c.name}</div>
    <div style="font-size:10px;color:${c.elemColor}">${c.element} · ${c.cls} · ${c.rarity}★</div>
    ${activeSets.length ? `<div style="font-size:10px;color:var(--gold);margin-top:2px">${activeSets.join(' / ')} 3세트</div>` : ''}
  </div>
  <div style="border-top:1px solid var(--border);margin:10px 0"></div>
  ${rows.map(r => r.sep
        ? `<div style="font-size:9px;color:var(--text3);padding:6px 0 2px;letter-spacing:1px">── ${r.l} ──</div>`
        : `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(42,42,69,.35);font-size:11px">
        <span style="color:var(--text2)">${r.l}</span>
        <span style="font-family:'JetBrains Mono',monospace;color:${r.c || '#fff'}">${r.v}</span>
      </div>`).join('')}`;
    document.getElementById('specModalOverlay').classList.add('open');
}
window.showSpecModal = showSpecModal;
window.closeSpecModal = () => document.getElementById('specModalOverlay').classList.remove('open');

// ═══════════════════════════════════════════════════════════════════
// 파티 렌더
// ═══════════════════════════════════════════════════════════════════
function renderAll() { renderPartyRow(); updateRunBtn(); }

function renderPartyRow() {
    const el = document.getElementById('partyRow'); el.innerHTML = '';
    const allBuffs = BUFF_ITEM_DB;
    for (let i = 0; i < 4; i++) {
        const c = party[i]; const div = document.createElement('div');
        if (!c) {
            div.className = 'char-slot empty';
            div.innerHTML = `<div style="text-align:center"><div class="dc-add-icon">+</div><div class="dc-add-label">캐릭터 선택</div></div>`;
            div.onclick = () => openPicker(i); el.appendChild(div); continue;
        }
        div.className = 'char-slot filled';
        const wpn = partyWeapons[i], slotLvArr = partyWpnSlotLv[i], potLv = partyPotential[i];
        const stats = calcStats(i);
        const activeSets = getActiveSets(i);
        const ws = (WEAPON_DB[c.weapon] || []).sort((a, b) => b.rarity - a.rarity);
        const wpnOpts = ws.map(w => `<option value="${w.name}"${wpn && w.name === wpn.name ? ' selected' : ''}>[${w.rarity}★] ${w.name} ATK${w.atk}</option>`).join('');

        // 무기 slots + buff
        let wpnOptsHtml = '';
        if (wpn) {
            const allSlots = [];
            (wpn.slots || []).forEach((s, si) => { allSlots.push({ label: s.label, slotObj: s, idx: si, isBuff: false }); });
            if (Array.isArray(wpn.buff) && wpn.buff.length > 0) {
                allSlots.push({ label: '⬡ ' + (wpn.buff_header || keyToLabel(wpn.buff[0].type)), slotObj: wpn.buff, idx: (wpn.slots || []).length, isBuff: true, isBuffGroup: true });
            }
            if (allSlots.length) {
                const rowsHtml = allSlots.map(({ label, slotObj, idx, isBuff, isBuffGroup }) => {
                    const curLv = slotLvArr[idx] || 9;
                    const lvBtns = [...Array(9)].map((_, j) => {
                        const lv = j + 1, active = curLv === lv;
                        return `<button onclick="onWpnSlotLvChange(${i},${idx},${lv})" class="dc-lv-btn${active ? ' active-lv' : ''}">${lv}</button>`;
                    }).join('');

                    if (isBuffGroup && Array.isArray(slotObj)) {
                        const valLines = slotObj.map(b => {
                            const bv = b.vals ? (b.vals[curLv - 1] ?? b.max) : b.max;
                            return `<div class="dc-wpn-slot-label"><span class="dc-buff-eff" style="color:var(--combo)">${b.header || keyToLabel(b.type)}</span><span style="color:var(--combo)">${fmtStat(bv)}</span></div>`;
                        }).join('');
                        return `<div class="dc-wpn-slot-row"><div style="font-size:11px;color:var(--text3);margin-bottom:3px">${label}</div>${valLines}<div class="dc-lv-btns">${lvBtns}</div></div>`;
                    }
                    const v = slotObj.vals ? (slotObj.vals[curLv - 1] ?? slotObj.max) : slotObj.max;
                    return `<div class="dc-wpn-slot-row"><div class="dc-wpn-slot-label"><span style="color:${isBuff ? 'var(--combo)' : 'var(--text3)'}">${label}</span><span style="color:${isBuff ? 'var(--combo)' : '#fff'}">${fmtStat(v)}</span></div><div class="dc-lv-btns">${lvBtns}</div></div>`;
                }).join('');
                wpnOptsHtml = `<div class="dc-wpn-slots">${rowsHtml}</div>`;
            }
        }

        // 돌파/정예화 버튼
        const potBtns = [0, 1, 2, 3, 4, 5].map(p => `<button class="dc-pt-btn${potLv === p ? ' active-pot' : ''}" onclick="onPotentialChange(${i},${p})">${p}</button>`).join('');
        const talLv = partyTalentLv[i];
        const talBtns = [0, 1, 2, 3, 4].map(t => `<button class="dc-pt-btn${talLv === t ? ' active-pot' : ''}" onclick="onTalentChange(${i},${t})">${t}</button>`).join('');

        // 장비 2×2
        const equipCells = SLOT_TYPES.map((slotLabel, si) => {
            const slotKey = SLOT_DB_KEY[si];
            const items = (EQ_BY_SLOT && EQ_BY_SLOT[slotKey]) || [];
            const curEq = partyEquip[i][si];
            const curFg = partyForgeLv[i][si] || [0, 0, 0];
            const groups = { '': ['<option value="">— 없음 —</option>'] };
            for (const eq of items) {
                if (!groups[eq.set]) groups[eq.set] = [];
                groups[eq.set].push(`<option value="${eq.name}"${curEq && curEq.name === eq.name ? ' selected' : ''}>${eq.name}${eq.isVariant ? ' ◆' : ''}</option>`);
            }
            const eqOpts = Object.entries(groups).map(([s, opts]) => s ? `<optgroup label="◈ ${s}">${opts.join('')}</optgroup>` : opts.join('')).join('');
            let forgeHtml = '';
            if (curEq && curEq.forge) {
                forgeHtml = curEq.forge.map((fg, fi) => {
                    const curLv = curFg[fi] || 0, curV = getForgeVal(fg, curLv), dispV = fmtStat(curV);
                    const btns = [0, 1, 2, 3].map(f => `<button onclick="onForgeChange(${i},${si},${fi},${f})" class="dc-lv-btn${curLv === f ? ' active-gold' : ''}">${f}</button>`).join('');
                    return `<div style="display:flex;align-items:center;gap:2px;margin-top:2px;min-width:0"><span style="font-size:8px;color:var(--text3);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${keyToLabel(fg.label)}</span><span style="display:flex;gap:1px">${btns}</span><span style="font-size:8px;font-family:'JetBrains Mono',monospace;color:var(--combo);min-width:26px;text-align:right">${dispV}</span></div>`;
                }).join('');
            }
            return `<div class="dc-equip-cell"><div class="dc-equip-label">${slotLabel}</div><select class="dc-sel" onchange="onEquipChange(${i},${si},this.value)" onclick="event.stopPropagation()">${eqOpts}</select>${forgeHtml}</div>`;
        }).join('');

        // 버프 아이템
        const selBuff = partyBuffs[i];
        const selBuffItem = allBuffs.find(b => b.id === selBuff);
        const selBuffName = selBuffItem ? selBuffItem.name : '';
        const buffHtml = allBuffs.map(item => {
            const isSel = selBuff === item.id;
            const efStr = item.effects.map(e => e.label || e.type).join(' / ') || '효과';
            const starStr = '★'.repeat(item.rarity);
            return `<label class="dc-buff-opt${isSel ? ' buff-sel' : ''}" onclick="event.preventDefault();event.stopPropagation();onBuffChange(${i},${item.id})" title="${item.desc || ''}"><input type="checkbox"${isSel ? ' checked' : ''} readonly style="pointer-events:none"><span class="dc-buff-rarity">${starStr}</span><span class="dc-buff-name">${item.name}</span><span class="dc-buff-eff">${efStr}</span></label>`;
        }).join('');

        div.innerHTML = `
    <details class="char-details"${partyOpen[i] ? ' open' : ''} data-slot="${i}">
      <summary>
        <span class="dc-slot-num">${i + 1}</span>
        <span class="dc-slot-name">${c.name}</span>
        <span class="dc-slot-elem" style="border-color:${c.elemColor};color:${c.elemColor}">${c.element}</span>
        <span class="dc-slot-cls">${c.cls}</span>
        <span class="dc-slot-atk">ATK ${stats ? stats.finalAtk.toLocaleString() : '—'}</span>
        ${activeSets.length ? `<span style="font-size:11px;color:var(--gold)">${activeSets.join('/')} 3세트</span>` : ''}
        <button onclick="event.stopPropagation();removeChar(${i})" class="dc-slot-remove">✕</button>
      </summary>
      <div class="char-details-body">
        <select class="dc-sel" onchange="onWeaponChange(${i},this.value)" onclick="event.stopPropagation()">${wpnOpts}</select>
        ${wpnOptsHtml}
        <div class="dc-pot-tal-row">
          <div class="dc-pot-tal-item" style="background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.15)">
            <span class="dc-pt-label" style="color:var(--primary)">돌파</span>
            <span class="dc-pt-btns">${potBtns}</span>
          </div>
          <div class="dc-pot-tal-item" style="background:rgba(96,212,255,.06);border:1px solid rgba(96,212,255,.15)">
            <span class="dc-pt-label" style="color:var(--combo)">정예화</span>
            <span class="dc-pt-btns">${talBtns}</span>
          </div>
        </div>
        <div class="dc-equip-grid">${equipCells}</div>
        <button onclick="event.stopPropagation();showSpecModal(${i})" class="dc-spec-btn">📊 상세 스펙 보기</button>
        <details class="dc-buff-inline" onclick="event.stopPropagation()">
          <summary class="dc-buff-hdr">🍶 버프 아이템 ${selBuffName ? '<span class="dc-buff-sel-badge">✔ ' + selBuffName + '</span>' : '<span class="dc-buff-no-badge">(미선택)</span>'}</summary>
          <div class="dc-buff-list">${buffHtml}</div>
        </details>
      </div>
    </details>`;
        const detailsEl = div.querySelector('.char-details');
        if (detailsEl) detailsEl.addEventListener('toggle', function () { partyOpen[i] = this.open; });
        el.appendChild(div);
    }
}

// ═══════════════════════════════════════════════════════════════════
// 이벤트 핸들러
// ═══════════════════════════════════════════════════════════════════
window.onWeaponChange = (idx, name) => { const c = party[idx]; if (!c) return; partyWeapons[idx] = (WEAPON_DB[c.weapon] || []).find(w => w.name === name) || null; renderAll(); };
window.onWpnSlotLvChange = (idx, slotIdx, lv) => { partyWpnSlotLv[idx][slotIdx] = lv; renderAll(); };
window.onEquipChange = (ci, si, name) => { partyEquip[ci][si] = name ? EQUIPMENT_DB[name] || null : null; partyForgeLv[ci][si] = [0, 0, 0]; renderAll(); };
window.onForgeChange = (ci, si, fi, v) => { partyForgeLv[ci][si][fi] = parseInt(v) || 0; renderAll(); };
window.onPotentialChange = (idx, v) => { partyPotential[idx] = parseInt(v) || 0; renderAll(); };
window.onTalentChange = (idx, v) => { partyTalentLv[idx] = parseInt(v) || 0; renderAll(); };
window.onBuffChange = (ci, id) => { partyBuffs[ci] = partyBuffs[ci] === id ? null : id; renderAll(); };
window.removeChar = (idx) => { party[idx] = null; partyWeapons[idx] = null; partyWpnSlotLv[idx] = Array(8).fill(9); partyEquip[idx] = [null, null, null, null]; partyForgeLv[idx] = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]; partyPotential[idx] = 0; partyBuffs[idx] = null; partyOpen[idx] = true; renderAll(); };
window.onSettingChange = () => { renderAll(); renderEnemyGrid(); };

// ═══════════════════════════════════════════════════════════════════
// 피커
// ═══════════════════════════════════════════════════════════════════
function openPicker(idx) { activeSlot = idx; document.getElementById('charPicker').classList.add('open'); renderCharGrid(); }
function closePicker() { document.getElementById('charPicker').classList.remove('open'); activeSlot = -1; }
window.openPicker = openPicker; window.closePicker = closePicker;

document.getElementById('pickerCloseBtn').onclick = closePicker;
document.getElementById('charPicker').addEventListener('click', e => { if (e.target === document.getElementById('charPicker')) closePicker(); });
document.getElementById('pickerFilters').querySelectorAll('.dc-filter-btn').forEach(btn => {
    btn.onclick = () => { document.querySelectorAll('.dc-filter-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); pickerFilter = btn.dataset.filter; renderCharGrid(); };
});

function renderCharGrid() {
    let chars = [...CHAR_DB];
    if (pickerFilter === 'r6') chars = chars.filter(c => c.rarity === 6);
    else if (pickerFilter === 'r5') chars = chars.filter(c => c.rarity === 5);
    else if (pickerFilter.startsWith('e-')) chars = chars.filter(c => c.element === pickerFilter.slice(2));
    else if (pickerFilter.startsWith('c-')) chars = chars.filter(c => c.cls === pickerFilter.slice(2));
    const grid = document.getElementById('charGrid'); grid.innerHTML = '';
    chars.forEach(c => {
        const inParty = party.some(p => p && p.name === c.name);
        const card = document.createElement('div');
        card.className = 'dc-char-card' + (inParty ? ' disabled' : '');
        card.innerHTML = `<div class="dc-char-rarity${c.rarity === 6 ? '' : c.rarity === 5 ? ' r5' : ' r4'}">${'★'.repeat(c.rarity)}</div><div class="dc-char-cname">${c.name}</div><div class="dc-char-elem" style="color:${c.elemColor}">${c.element} · ${c.cls}</div>`;
        if (!inParty) card.onclick = () => {
            party[activeSlot] = c;
            partyWeapons[activeSlot] = (WEAPON_DB[c.weapon] || []).sort((a, b) => b.rarity - a.rarity)[0] || null;
            partyWpnSlotLv[activeSlot] = Array(8).fill(9); partyEquip[activeSlot] = [null, null, null, null];
            partyForgeLv[activeSlot] = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
            partyPotential[activeSlot] = 0; partyBuffs[activeSlot] = null;
            closePicker(); renderAll();
        };
        grid.appendChild(card);
    });
}

// ═══════════════════════════════════════════════════════════════════
// 보스 그리드
// ═══════════════════════════════════════════════════════════════════
function renderEnemyGrid() {
    const lv = parseInt(document.getElementById('gEnemyLv').value);
    const grid = document.getElementById('enemyGrid'); grid.innerHTML = '';
    ALL_ENEMIES.forEach(e => {
        const stat = e.stats[lv] || e.stats[80] || e.stats[90] || { hp: 0, def: 100 };
        const card = document.createElement('div');
        card.className = 'dc-enemy-card' + (e === selectedEnemy ? ' selected' : '');
        card.innerHTML = `<div class="dc-enemy-name">${e.name}</div><div class="dc-enemy-sub"><span>HP ${(stat.hp / 10000).toFixed(1)}만</span><span>DEF ${stat.def}</span></div>`;
        card.onclick = () => { selectedEnemy = e; renderEnemyGrid(); updateRunBtn(); };
        grid.appendChild(card);
    });
}
function updateRunBtn() {
    const off = party.filter(Boolean).length < 1 || !selectedEnemy;
    document.getElementById('runBtn').disabled = off;
}

// ═══════════════════════════════════════════════════════════════════
// 워커 파라미터 빌드
// ═══════════════════════════════════════════════════════════════════
function getMult(c, skillKey, lv) { return (c.mults[String(lv)] || c.mults['12'])[skillKey] || 0; }

// 이본 강화 평타 전용 critMult 계산
// ult 강화 기간: 타격당 crit_rate +3% (최대 10스택), 풀스택 시 crit_dmg +60%
// 20 normal hits + 1 strong hit 동안 crit stack 변화를 히트별로 계산하여 가중 평균
function getEnhancedCritMult(c, baseCritRate, baseCritDmg) {
    const mech = c.skills?.ultimate?.mechanics || [];
    const hasCritStack = mech.some(m => m.includes('치명타 확률') && m.includes('스택'));
    if (!hasCritStack) return null; // 해당 메카닉 없으면 기본 critMult 사용
    const hitCount = c.skills?.ultimate?.enhanced_hit_count || 20;
    const critRatePerStack = 0.03;
    const maxCritStacks = 10;
    const fullStackCritDmgBonus = 0.60;
    let totalCritMult = 0;
    for (let i = 0; i < hitCount; i++) {
        const stacksAtHit = Math.min(maxCritStacks, i); // i번째 타격 시 보유 스택
        const r = Math.min(1.0, baseCritRate + stacksAtHit * critRatePerStack);
        const extraCritDmg = stacksAtHit >= maxCritStacks ? fullStackCritDmgBonus : 0;
        const d = baseCritDmg + extraCritDmg;
        totalCritMult += calcCritMultiplier(r, d);
    }
    return totalCritMult / hitCount; // 히트별 critMult 평균
}

// 궁 후 강화 평타 배율 (strong + extra)
function getEnhancedMult(c, lv) {
    const ultLv = c.skills?.ultimate?.levels?.[String(lv)] || c.skills?.ultimate?.levels?.['12'];
    if (!ultLv) return 0;
    // 강화 평타 방식 궁극기 (이본 등):
    // normal_multiplier × 일반타격수 + strong_multiplier + extra_multiplier
    // Endaxis variants 데이터: 이본 강화중격 = 세그먼트당 총 20 일반타 + 최종 강력한 일격 1타
    if (ultLv.normal_multiplier !== undefined) {
        const normalHits = c.skills?.ultimate?.enhanced_hit_count || 20;
        // extra_multiplier는 동결 시에만 적용 — 7s 창 내 ~2사이클 중 평균 1회 기준으로 50% 가중
        return ultLv.normal_multiplier * normalHits
            + (ultLv.strong_multiplier || 0)
            + (ultLv.extra_multiplier || 0) * 0.5;
    }
    // 레바테인 등: hit_multipliers 합산
    if (ultLv.hit_multipliers) return ultLv.hit_multipliers.reduce((a, b) => a + b, 0);
    const strong = ultLv.strong_multiplier || 0;
    const extra = ultLv.extra_multiplier || 0;
    return strong + extra;
}

// 처형 배율
function getExecMult(c, lv) {
    const baLv = c.skills?.basic_attack?.levels?.[String(lv)] || c.skills?.basic_attack?.levels?.['12'];
    return baLv?.execution_multiplier || 9; // 기본 9배
}
function buildWorkerParams() {
    const skillLv = parseInt(document.getElementById('gSkillLv').value);
    const critRateBase = parseInt(document.getElementById('gCritRate').value) / 100;
    const critDmgBase = parseInt(document.getElementById('gCritDmg').value) / 100;
    const simTime = parseInt(document.getElementById('gSimTime').value);
    const enemyLv = parseInt(document.getElementById('gEnemyLv').value);
    const optUltFull = document.getElementById('gUltFull').value === '1';

    const chars = party.filter(Boolean);
    const enemy = selectedEnemy;
    const enemyStat = enemy.stats[enemyLv] || enemy.stats[80] || { hp: 0, def: 100 };
    const totalHp = enemyStat.hp;
    const defMult = calcDefMultiplier(enemyStat.def || 100);

    const charData = chars.map((c, i) => {
        const slotIdx = party.indexOf(c);
        const weapon = partyWeapons[slotIdx] || (WEAPON_DB[c.weapon] || []).sort((a, b) => b.rarity - a.rarity)[0];
        const wpnLv = partyWpnSlotLv[slotIdx] || [9, 9, 9, 9];
        const equipArr = partyEquip[slotIdx] || [null, null, null, null];
        const forgeLvArr = partyForgeLv[slotIdx] || [0, 0, 0, 0];
        const potLv = partyPotential[slotIdx] || 0;
        const talLv = partyTalentLv[slotIdx] || 0;
        const stats = calcStatsForSim(c, weapon, wpnLv, equipArr, forgeLvArr, potLv, talLv);
        const buffEff = getBuffEffectsFor(slotIdx);

        const finalAtkBase = stats.finalAtk;
        const finalAtk = Math.round(finalAtkBase * (1 + (buffEff.atk_pct || 0)) * (1 + (finalAtkBase > 0 ? (buffEff.atk_flat || 0) / finalAtkBase : 0)));
        const crit_r = Math.min(1.0, critRateBase + stats.critRate + (buffEff.crit_rate || 0));
        const crit_d = critDmgBase + (buffEff.crit_dmg || 0);
        const critMult = calcCritMultiplier(crit_r, crit_d);

        const elemKey = { 물리: 'phys_dmg', 열기: 'heat_dmg', 냉기: 'cold_dmg', 전기: 'elec_dmg', 자연: 'nat_dmg' }[c.element] || 'phys_dmg';
        // 냉기/전기 → cold_elec_dmg 합산, 열기/자연 → heat_nat_dmg 합산
        const elemCompoundKey = { 냉기: 'cold_elec_dmg', 전기: 'cold_elec_dmg', 열기: 'heat_nat_dmg', 자연: 'heat_nat_dmg' }[c.element];
        const elemBonus = (stats.dmgBonus[elemKey] || 0) + (stats.dmgBonus.arts_dmg || 0)
            + (elemCompoundKey ? (stats.dmgBonus[elemCompoundKey] || 0) : 0);
        const allSkill = (stats.dmgBonus.all_skill_dmg || 0) + (buffEff.all_dmg || 0);
        const baseLinkCd = c.link_cd * (1 - (stats.linkCdReduce || 0));

        // beamData에서 추가 데이터 추출
        const bd = c.beamData || {};
        const skillTickSp = (bd.skill_ticks || []).reduce((sum, tk) => sum + (tk.sp || 0), 0);
        const linkTickSp = (bd.link_ticks || []).reduce((sum, tk) => sum + (tk.sp || 0), 0);
        const ultTickSp = (bd.ult_ticks || []).reduce((sum, tk) => sum + (tk.sp || 0), 0);

        return {
            name: c.name, element: c.element, elemColor: c.elemColor, weapon: c.weapon, cls: c.cls, rarity: c.rarity,
            cycle: c.cycle, skill_dur: c.skill_dur, link_dur: c.link_dur, ult_dur: c.ult_dur,
            ult_cost: c.ult_cost, link_cd: c.link_cd,
            skill_gauge: c.skill_gauge, link_gauge: c.link_gauge, ult_gauge_per_basic: c.ult_gauge_per_basic,
            sp_gain: c.sp_gain, ult_sp_gain: c.ult_sp_gain, link_sp_gain: c.link_sp_gain, skill_sp_gain: c.skill_sp_gain,
            finalAtk, critMult,
            enhancedCritMult: getEnhancedCritMult(c, crit_r, crit_d) ?? critMult,
            elemBonus, int_stat: stats.int, artsPower: stats.artsPower,
            basicBonus: (stats.dmgBonus.normal_dmg || 0),
            skillBonus: (stats.dmgBonus.skill_dmg || 0) + allSkill,
            linkBonus: (stats.dmgBonus.link_dmg || 0) + allSkill,
            ultBonus: (stats.dmgBonus.ult_dmg || 0) + allSkill,
            baseLinkCd,
            ultMult: getMult(c, 'ult', skillLv), skillMult: getMult(c, 'battle', skillLv),
            linkMult: getMult(c, 'combo', skillLv), basicMult: getMult(c, 'basic', skillLv),
            // 강화 평타 배율 (강화 창 전체의 총 배율)
            // beam_worker에서 enhanced basic은 잔여 강화 시간을 한 번에 소비 (연속 사격 모델)
            enhancedBasicMult: getEnhancedMult(c, skillLv),
            // 처형 배율
            execMult: getExecMult(c, skillLv),
            staggerPerCycle: c.stagger_per_cycle,
            mults: c.mults,
            // ── v7 신규 파라미터 ──
            // 팀 게이지 공유
            skill_teamGaugeGain: bd.skill_team_gauge || 0,
            link_teamGaugeGain: 0, // 링크는 팀 게이지 없음 (Endaxis 기준)
            accept_team_gauge: bd.accept_team_gauge !== false,
            // 틱별 SP 회복 합산
            skillTickSp, linkTickSp, ultTickSp,
            // 궁극기 block window (강화 구간 동안 게이지 충전 차단)
            ult_blockDuration: c.ult_dur + ((CHAR_EFFECTS[c.name] || []).find(e => e.type === 'enhancement')?.val || 0),
            // 강화 평타 모드: finisher(이본-한 번에 끝) / cycle(레바테인-사이클 반복)
            enhancedMode: (CHAR_EFFECTS[c.name] || []).find(e => e.type === 'enhancement')?.mode || 'finisher',
            // 아츠 부착 anomaly (beam_worker의 applyArtsAnomaly에서 자동 처리)
            skill_anomaly: (bd.skill_anomalies || [])[0]?.[0] || null,
            link_anomaly:  (bd.link_anomalies  || [])[0]?.[0] || null,
            ult_anomaly_list: (bd.ult_anomalies || []).map(a => a[0]).filter(Boolean),
            // 링크(연타) 생성 여부: 여풍·아케쿠리만 링크 스택 부여
            grants_link: c.name === '여풍' || c.name === '아케쿠리',
        };
    });

    // ── 무기 조건부 팀 버프 (duration_s 항목, 상시 발동 가정) ──
    {
        const wpnTeam = Array.from({ length: chars.length }, () => ({ atkPct: 0, artsDmg: 0 }));
        chars.forEach((c, ci) => {
            const slotIdx = party.indexOf(c);
            const weapon = partyWeapons[slotIdx] || (WEAPON_DB[c.weapon] || []).sort((a, b) => b.rarity - a.rarity)[0];
            if (!weapon || !Array.isArray(weapon.buff)) return;
            const buffStart = (weapon.slots || []).length;
            const buffLv = (partyWpnSlotLv[slotIdx] || [])[buffStart] || 9;
            const stackMax = {};
            weapon.buff.forEach(b => {
                if (!b.duration_s) return;
                const bv = b.vals ? (b.vals[buffLv - 1] ?? b.max) : b.max;
                if (b.kind === 'stack_max') {
                    // stack_max: 같은 타입 중 최댓값(기본 발동치)만 수집
                    if (bv > (stackMax[b.type] || 0)) stackMax[b.type] = bv;
                    return;
                }
                // 타겟 판별: '다른 오퍼레이터'=자신 제외, '속성이 다른'=같은 속성 제외
                const isOtherOnly = b.raw?.includes('다른 오퍼레이터') && !b.raw?.includes('속성이 다른');
                const isDiffElemOnly = b.raw?.includes('속성이 다른');
                chars.forEach((tc, ti) => {
                    if (isOtherOnly && ti === ci) return;
                    if (isDiffElemOnly && tc.element === c.element) return;
                    if (b.type === 'atk_pct') wpnTeam[ti].atkPct += bv;
                    if (b.type === 'arts_dmg') wpnTeam[ti].artsDmg += bv;
                });
            });
            // stack_max 최댓값 → 팀 전체 적용
            Object.entries(stackMax).forEach(([type, bv]) => {
                chars.forEach((_, ti) => {
                    if (type === 'arts_dmg') wpnTeam[ti].artsDmg += bv;
                    if (type === 'atk_pct') wpnTeam[ti].atkPct += bv;
                });
            });
        });
        charData.forEach((cd, ti) => {
            if (wpnTeam[ti].atkPct) cd.finalAtk = Math.round(cd.finalAtk * (1 + wpnTeam[ti].atkPct));
            if (wpnTeam[ti].artsDmg) cd.elemBonus += wpnTeam[ti].artsDmg;
        });
    }

    const effects = [];
    chars.forEach((c, idx) => {
        const effs = CHAR_EFFECTS[c.name];
        if (!effs) return;
        effs.forEach(e => {
            let eff = { idx, ...e };
            // 자이히 궁극기: INT 스케일 원소 증폭 (base 0.24 + INT×0.0003, 최대 0.36)
            if (c.name === '자이히' && e.trigger === 'ult' && e.type === 'elem_amp') {
                const intVal = charData[idx]?.int_stat || 0;
                eff = { ...eff, val: Math.min(0.36, 0.24 + intVal * 0.0003) };
            }
            effects.push(eff);
        });
    });

    const initialSlots = chars.map((c, i) => ({
        nextTime: i * 0.12, ultGauge: optUltFull ? c.ult_cost : 0,
        linkCdEnd: i * 0.1, baseLinkCd: charData[i].baseLinkCd,
    }));

    const bossDef = enemyStat.def || 100;
    return {
        chars: charData, effects, defMult, bossDef,
        staggerData: { maxStagger: enemy.maxStagger || 0, execRecovery: enemy.executionRecovery || 25, breakDuration: enemy.staggerBreakDuration || 10 },
        totalHp, simTime,
        initialState: {
            slots: initialSlots,
            effectExpiries: effects.map(() => 0),  // 각 이펙트별 만료시간
            enhancedUntil: chars.map(() => 0),       // 궁 강화평타 만료시간
            ultBlockUntil: chars.map(() => 0),       // 궁극기 blockWindow 만료시간
            teamSp: SP_SYSTEM.initial_sp,
            lastSpTime: 0, spResumeTime: 0, totalDmg: 0, remainingHp: totalHp,
            staggerCurrent: 0, staggerBreakEndTime: -1, executionDone: false,
            events: [], skillUsed: 0, linkUsed: 0, ultUsed: 0, basicUsed: 0,
            charStacks: chars.map(() => 0),   // 캐릭터별 스택형 이펙트 스택 카운터
            artsInfliction: { type: null, level: 0 }, // 보스 아츠 부착 상태 (type/level)
            reactionAmp: { val: 0, expiry: 0 },        // 감전 아츠 피해 증가 (val/만료시각)
            corrosionResReduce: { val: 0, expiry: 0 }, // 부식 내성 감소 (val/만료시각)
            frozenUntil: 0,                          // 동결 상태 만료시각
            frozenLevel: 0,                          // 동결 레벨 (파쇄 계산용)
            physVuln: { level: 0, expiry: 0 },       // 물리 취약 Breach 디버프 (level/만료시각)
            linkStack: 0,                      // Link 버프 스택 (연계 체인 카운터)
        },
        sp: SP_SYSTEM, timeLimitMs: 8000,
    };
}

// ═══════════════════════════════════════════════════════════════════
// 실행
// ═══════════════════════════════════════════════════════════════════
let _activeWorker = null;
function setProgress(pct, note) {
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressPct').textContent = pct + '%';
    if (note !== undefined) document.getElementById('progressNote').textContent = note;
}
function showProgress(show) { document.getElementById('progressWrap').classList.toggle('visible', show); }

window.runOptimizer = function () {
    const btn = document.getElementById('runBtn');
    if (_activeWorker) { _activeWorker.terminate(); _activeWorker = null; }
    btn.disabled = true; btn.textContent = '🔍 최적화 중...';
    showProgress(true); setProgress(0, '빔 서치 시작 중...');
    document.getElementById('progressLabel').textContent = '🔍 빔 서치 최적화 중...';

    let params;
    try { params = buildWorkerParams(); }
    catch (e) { console.error(e); alert('파라미터 오류: ' + e.message); finishRun(); return; }

    const worker = new Worker('./beam_worker.js?v=' + Date.now());
    _activeWorker = worker;

    worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'progress') {
            setProgress(msg.pct, msg.bestKillTime ? `현재 최선: ${msg.bestKillTime.toFixed(2)}s` : '탐색 중...');
        } else if (msg.type === 'done') {
            setProgress(100, '완료!');
            simResult = msg.result;
            simResult.chars = party.filter(Boolean);
            renderResults(simResult);
            finishRun();
        } else if (msg.type === 'error') {
            console.error('Worker 오류:', msg.msg);
            finishRun();
        }
    };
    worker.onerror = (e) => { console.error('Worker 오류:', e); finishRun(); };
    worker.postMessage({ type: 'start', params });

    function finishRun() {
        btn.disabled = false; btn.textContent = '⚡ 최적 딜 사이클 계산';
        setTimeout(() => showProgress(false), 1500);
        if (_activeWorker === worker) _activeWorker = null;
    }
};


// ═══════════════════════════════════════════════════════════════════
// 결과 렌더링
// ═══════════════════════════════════════════════════════════════════
function renderResults(r) {
    document.getElementById('results').classList.add('visible');
    const killStr = `${r.killTime ? r.killTime.toFixed(1) : '>' + r.simTime.toFixed(0)}s`;
    const skillStr = `${r.skillUsed}S · ${r.linkUsed}L · ${r.ultUsed}U`;

    document.getElementById('rTotalDmg').textContent = (r.totalDmg / 10000).toFixed(1);
    document.getElementById('rDps').textContent = r.dps.toLocaleString();
    const rTimeEl = document.getElementById('rTime');
    rTimeEl.textContent = killStr;
    rTimeEl.style.color = r.killTime ? 'var(--primary)' : '#ff4040';
    document.getElementById('rSkills').textContent = skillStr;

    // 캐릭터 기여
    const contrib = document.getElementById('charContrib'); contrib.innerHTML = '';
    const sorted = [...r.chars].sort((a, b) => (r.charDmg[b.name] || 0) - (r.charDmg[a.name] || 0));
    const maxDmg = Math.max(...sorted.map(c => r.charDmg[c.name] || 0));
    sorted.forEach((c, i) => {
        const dmg = r.charDmg[c.name] || 0, pct = r.totalDmg > 0 ? (dmg / r.totalDmg * 100) : 0, barPct = maxDmg > 0 ? (dmg / maxDmg * 100) : 0;
        const color = CHAR_COLORS[i % CHAR_COLORS.length];
        const card = document.createElement('div'); card.className = 'dc-contrib-card';
        card.innerHTML = `<div class="dc-contrib-head"><div><div class="dc-contrib-name">${c.name}</div><div class="dc-contrib-sub" style="color:${c.elemColor}">${c.element} · ${c.cls}</div></div><div style="text-align:right"><div class="dc-contrib-pct" style="color:${color}">${pct.toFixed(1)}%</div><div class="dc-contrib-dmg">${(dmg / 10000).toFixed(1)}만</div></div></div><div class="dc-bar-track"><div class="dc-bar-fill" style="width:${barPct}%;background:${color}"></div></div>`;
        contrib.appendChild(card);
    });

    // 타입별
    const tb = document.getElementById('typeDmgBreakdown'); tb.innerHTML = '';
    [{ key: 'basic', label: '기본 공격', color: '#60d4ff' }, { key: 'skill', label: '배틀 스킬', color: '#ff6b35' }, { key: 'link', label: '연계 스킬', color: '#c060ff' }, { key: 'ult', label: '궁극기', color: '#f0c050' }].forEach(t => {
        const v = r.typeDmg[t.key] || 0, pct = r.totalDmg > 0 ? (v / r.totalDmg * 100) : 0;
        tb.innerHTML += `<div class="dc-dmg-row"><div class="dc-dmg-label">${t.label}</div><div class="dc-dmg-track"><div class="dc-dmg-fill" style="width:${pct}%;background:${t.color}"></div></div><div class="dc-dmg-pct">${pct.toFixed(1)}%</div><div class="dc-dmg-val">${(v / 10000).toFixed(1)}만</div></div>`;
    });

    // 로테이션 (캐릭터별 필터 포함)
    const rotList = document.getElementById('rotList');
    const rotFilter = document.getElementById('rotFilter');

    function buildRotItem(ev, num) {
        const item = document.createElement('div'); item.className = 'dc-rot-item';
        const tagClass = ev.action === 'basic' || ev.action === 'enhanced' ? 'basic' : ev.action === 'skill' ? 'skill' : ev.action === 'link' ? 'link' : 'ult';
        item.innerHTML = `<div class="dc-rot-idx">${num}</div><div class="dc-rot-time">${ev.time.toFixed(2)}s</div><div class="dc-rot-char" style="color:${ELEM_COLORS[ev.element] || '#fff'}">${ev.charName}</div><div class="dc-rot-action"><span class="dc-rot-tag ${tagClass}">${ev.actionLabel}</span></div><div class="dc-rot-dmg">${ev.dmg > 0 ? ev.dmg.toLocaleString() : '—'}</div><div class="dc-rot-sp">SP:${ev.sp}</div>`;
        return item;
    }

    function renderRotList(filter) {
        rotList.innerHTML = '';
        const evs = filter === '전체' ? r.events : r.events.filter(ev => ev.charName === filter);
        evs.forEach((ev, idx) => rotList.appendChild(buildRotItem(ev, idx + 1)));
    }

    if (rotFilter) {
        rotFilter.innerHTML = '';
        let activeFilter = '전체';
        ['전체', ...r.chars.map(c => c.name)].forEach(name => {
            const btn = document.createElement('button');
            btn.className = 'dc-rot-filter-btn' + (name === '전체' ? ' active' : '');
            btn.textContent = name;
            btn.addEventListener('click', () => {
                activeFilter = name;
                rotFilter.querySelectorAll('.dc-rot-filter-btn').forEach(b => b.classList.toggle('active', b.textContent === activeFilter));
                renderRotList(activeFilter);
            });
            rotFilter.appendChild(btn);
        });
    }

    renderRotList('전체');

    setTimeout(() => drawTimeline(r), 50);
}

// ═══════════════════════════════════════════════════════════════════
// 타임라인 캔버스
// ═══════════════════════════════════════════════════════════════════
let _tlHitAreas = [];

function drawTimeline(r) {
    const canvas = document.getElementById('tl'); if (!canvas) return;
    const W = canvas.parentElement.offsetWidth || 900; canvas.width = W;
    const ROW_H = 34, HEADER = 22, PL = 105;
    const H = HEADER + r.chars.length * ROW_H + 4; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0a10'; ctx.fillRect(0, 0, W, H);

    const totalT = r.simTime, pxPerS = (W - PL - 10) / totalT;
    const ACOLORS = { basic: '#60d4ff', enhanced: '#4ade80', skill: '#ff6b35', link: '#c060ff', ult: '#f0c050', exec: '#ff3030' };

    // 격자선 및 시간 레이블
    for (let s = 0; s <= totalT; s += 5) {
        const x = PL + s * pxPerS;
        ctx.strokeStyle = s % 30 === 0 ? 'rgba(74,222,128,.15)' : 'rgba(42,42,69,.5)';
        ctx.lineWidth = s % 30 === 0 ? 1 : .5;
        ctx.beginPath(); ctx.moveTo(x, HEADER); ctx.lineTo(x, H); ctx.stroke();
        if (s % 10 === 0) { ctx.fillStyle = 'rgba(112,128,168,.7)'; ctx.font = '9px JetBrains Mono,monospace'; ctx.fillText(s + 's', x - 8, 15); }
    }

    // 행 배경 및 캐릭터명
    r.chars.forEach((c, i) => {
        const y = HEADER + i * ROW_H;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(14,14,26,.6)' : 'rgba(19,19,31,.6)'; ctx.fillRect(0, y, W, ROW_H);
        ctx.fillStyle = CHAR_COLORS[i % CHAR_COLORS.length]; ctx.font = 'bold 10px Noto Sans KR,sans-serif'; ctx.fillText(c.name, 4, y + ROW_H / 2 + 4);
    });

    // 각 캐릭터 행 전체를 배경 바로 채움 (공백 시각화)
    r.chars.forEach((_, i) => {
        const gy = HEADER + i * ROW_H + 3, gh = ROW_H - 6;
        ctx.fillStyle = 'rgba(50, 80, 160, 0.14)';
        rr(ctx, PL, gy, W - PL - 10, gh, 3); ctx.fill();
        ctx.strokeStyle = 'rgba(80, 130, 220, 0.22)';
        ctx.lineWidth = 0.5;
        rr(ctx, PL, gy, W - PL - 10, gh, 3); ctx.stroke();
    });

    // 이벤트 바 그리기 + hit area 수집
    _tlHitAreas = [];
    r.events.forEach(ev => {
        const ci = r.chars.findIndex(c => c.name === ev.charName); if (ci < 0) return;
        const color = ACOLORS[ev.action] || '#fff';
        const x = PL + ev.time * pxPerS, w = Math.max(4, ev.duration * pxPerS - 1);
        const y = HEADER + ci * ROW_H + 3, h = ROW_H - 6;
        ctx.fillStyle = color + '28'; rr(ctx, x, y, w, h, 3); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; rr(ctx, x, y, w, h, 3); ctx.stroke();
        _tlHitAreas.push({ x, y, w, h, ev });
    });

    // 마우스 이벤트 리스너 (최초 1회만 등록)
    if (!canvas._tlSetup) {
        canvas._tlSetup = true;
        const tip = document.getElementById('tlTooltip');
        const ACOLORS_TIP = { basic: '#60d4ff', enhanced: '#4ade80', skill: '#ff6b35', link: '#c060ff', ult: '#f0c050', exec: '#ff3030' };

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const mx = (e.clientX - rect.left) * scaleX;
            const my = (e.clientY - rect.top) * scaleY;
            const hit = _tlHitAreas.find(a => mx >= a.x && mx <= a.x + a.w && my >= a.y && my <= a.y + a.h);
            if (hit && tip) {
                const ev = hit.ev;
                const color = ACOLORS_TIP[ev.action] || '#fff';
                const endT = (ev.time + ev.duration).toFixed(2);
                const dmgStr = ev.dmg > 0 ? `<div style="color:#4ade80;font-weight:700;font-size:12px">${ev.dmg.toLocaleString()}</div>` : '';
                tip.innerHTML =
                    `<div style="font-weight:700;color:${color};margin-bottom:3px">${ev.actionLabel}</div>` +
                    `<div style="color:#a0a8c0;margin-bottom:4px">${ev.charName}</div>` +
                    dmgStr +
                    `<div style="color:#6070a0;font-size:10px;margin-top:3px">${ev.time.toFixed(2)}s → ${endT}s (${ev.duration.toFixed(2)}s)</div>` +
                    `<div style="color:#6070a0;font-size:10px">SP: ${ev.sp}</div>`;
                tip.style.display = 'block';
                // 화면 오른쪽 끝 넘지 않도록 보정
                const tipW = tip.offsetWidth;
                const left = e.clientX + 14 + tipW > window.innerWidth ? e.clientX - tipW - 8 : e.clientX + 14;
                tip.style.left = left + 'px';
                tip.style.top = (e.clientY - 10) + 'px';
            } else if (tip) {
                tip.style.display = 'none';
            }
        });
        canvas.addEventListener('mouseleave', () => {
            const tip = document.getElementById('tlTooltip');
            if (tip) tip.style.display = 'none';
        });
    }
}
function rr(ctx, x, y, w, h, r_) {
    ctx.beginPath(); ctx.moveTo(x + r_, y); ctx.lineTo(x + w - r_, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r_);
    ctx.lineTo(x + w, y + h - r_); ctx.quadraticCurveTo(x + w, y + h, x + w - r_, y + h); ctx.lineTo(x + r_, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r_); ctx.lineTo(x, y + r_); ctx.quadraticCurveTo(x, y, x + r_, y); ctx.closePath();
}
window.addEventListener('resize', () => { if (simResult) drawTimeline(simResult); });

// ═══════════════════════════════════════════════════════════════════
// 파티 설정 저장 / 불러오기
// ═══════════════════════════════════════════════════════════════════
window.savePartyConfig = () => {
    const config = {
        version: 2,
        savedAt: new Date().toISOString(),
        party: party.map((c, i) => {
            if (!c) return null;
            return {
                name: c.name,
                weapon: partyWeapons[i]?.name || null,
                wpnSlotLv: partyWpnSlotLv[i],
                equip: partyEquip[i].map(e => e?.name || null),
                forgeLv: partyForgeLv[i],
                potential: partyPotential[i],
                talent: partyTalentLv[i],
                buff: partyBuffs[i],
            };
        }),
        settings: {
            charLv: document.getElementById('gCharLv')?.value,
            skillLv: document.getElementById('gSkillLv')?.value,
            critRate: document.getElementById('gCritRate')?.value,
            critDmg: document.getElementById('gCritDmg')?.value,
            simTime: document.getElementById('gSimTime')?.value,
            enemyLv: document.getElementById('gEnemyLv')?.value,
            ultFull: document.getElementById('gUltFull')?.value,
        },
        enemy: selectedEnemy?.name || null,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `party_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
};

window.loadPartyConfig = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const config = JSON.parse(text);
            applyPartyConfig(config);
        } catch (err) {
            alert('파일 불러오기 실패: ' + err.message);
        }
    };
    input.click();
};

function applyPartyConfig(config) {
    // 설정 복원
    if (config.settings) {
        const s = config.settings;
        if (s.charLv) { const el = document.getElementById('gCharLv'); if (el) el.value = s.charLv; }
        if (s.skillLv) { const el = document.getElementById('gSkillLv'); if (el) el.value = s.skillLv; }
        if (s.critRate) { const el = document.getElementById('gCritRate'); if (el) el.value = s.critRate; }
        if (s.critDmg) { const el = document.getElementById('gCritDmg'); if (el) el.value = s.critDmg; }
        if (s.simTime) { const el = document.getElementById('gSimTime'); if (el) el.value = s.simTime; }
        if (s.enemyLv) { const el = document.getElementById('gEnemyLv'); if (el) el.value = s.enemyLv; }
        if (s.ultFull) { const el = document.getElementById('gUltFull'); if (el) el.value = s.ultFull; }
    }

    // 보스 복원
    if (config.enemy) {
        const boss = ALL_ENEMIES.find(b => b.name === config.enemy);
        if (boss) selectedEnemy = boss;
    }

    // 파티 복원
    (config.party || []).forEach((slot, i) => {
        if (i >= 4) return;
        if (!slot) {
            party[i] = null; partyWeapons[i] = null;
            partyWpnSlotLv[i] = Array(8).fill(9);
            partyEquip[i] = [null, null, null, null];
            partyForgeLv[i] = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
            partyPotential[i] = 0; partyTalentLv[i] = 4; partyBuffs[i] = null;
            return;
        }
        const c = CHAR_DB.find(ch => ch.name === slot.name);
        if (!c) return;
        party[i] = c;

        // 무기 복원
        if (slot.weapon) {
            const wpn = (WEAPON_DB[c.weapon] || []).find(w => w.name === slot.weapon);
            partyWeapons[i] = wpn || null;
        }
        if (slot.wpnSlotLv) partyWpnSlotLv[i] = slot.wpnSlotLv;

        // 장비 복원
        if (slot.equip) {
            partyEquip[i] = slot.equip.map(eName => eName ? EQUIPMENT_DB[eName] || null : null);
        }
        if (slot.forgeLv) partyForgeLv[i] = slot.forgeLv;
        if (slot.potential !== undefined) partyPotential[i] = slot.potential;
        if (slot.talent !== undefined) partyTalentLv[i] = slot.talent;
        if (slot.buff !== undefined) partyBuffs[i] = slot.buff;
        partyOpen[i] = true;
    });

    renderAll();
    renderEnemyGrid();
}

// ═══════════════════════════════════════════════════════════════════
// init
// ═══════════════════════════════════════════════════════════════════
renderAll();
renderEnemyGrid();
