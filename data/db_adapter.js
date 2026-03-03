// ═══════════════════════════════════════════════════════════════════
// db_adapter.js — 새 JSON DB를 시뮬레이션 내부 형식으로 변환
// ═══════════════════════════════════════════════════════════════════

// ── 원소 색상 매핑 ──
const ELEM_COLOR = { 물리: '#a0b8d0', 열기: '#ff6b35', 냉기: '#60d4ff', 전기: '#ffe040', 자연: '#50e0a0' };
const ELEM_MAP = { physical: '물리', cold: '냉기', heat: '열기', electric: '전기', nature: '자연' };

// ── 1. 캐릭터 DB 어댑터 ──────────────────────────────────────────
export function adaptCharacters(charJson, timingJson, beamJson) {
  const timingMap = new Map(timingJson.map(t => [t.name, t]));
  const beamMap = new Map(beamJson.map(b => [b.name, b]));

  return charJson.map(c => {
    const timing = timingMap.get(c.name);
    const beam = beamMap.get(c.name);
    const elem = c.element;
    const elemEn = ELEM_MAP[beam?.element] || elem;
    const displayElem = elem || elemEn;

    // 레벨별 스탯
    const stats = {};
    if (c.base_stats?.levels) {
      for (const [lv, s] of Object.entries(c.base_stats.levels)) {
        stats[lv] = { hp: s.hp, atk: s.atk, str: s.str, agi: s.agi, int: s.int, wil: s.wil };
      }
    }

    // 스킬 배율 (레벨 1~12)
    const mults = {};

    // 범용 배율 추출 — 다양한 필드명 지원
    function getAnyMult(lvData) {
      if (!lvData) return 0;
      // 직접적인 damage_multiplier 우선
      if (lvData.damage_multiplier) return lvData.damage_multiplier;
      // 특수 배율 필드들
      if (lvData.phantom_damage_multiplier) return lvData.phantom_damage_multiplier;
      if (lvData.enhanced_damage_multiplier) return lvData.enhanced_damage_multiplier;
      if (lvData.base_damage_multiplier) return lvData.base_damage_multiplier;
      if (lvData.slash_base_multiplier) return lvData.slash_base_multiplier + (lvData.slash_enhanced_multiplier || 0);
      if (lvData.ice_spike_multiplier) return lvData.ice_spike_multiplier + (lvData.slash_base_multiplier || 0);
      if (lvData.amp_multiplier) return lvData.amp_multiplier;
      // hit_multipliers 합산 (배틀/연계가 다타격인 경우)
      if (lvData.hit_multipliers) return lvData.hit_multipliers.reduce((a, b) => a + b, 0);
      // 이본 연계 스킬: 충격파 4회 × shockwave_multiplier + explosion_multiplier
      if (lvData.shockwave_multiplier !== undefined) {
        return lvData.shockwave_multiplier * 4 + (lvData.explosion_multiplier || 0);
      }
      // 강화 평타 방식 궁극기 (이본 등): 시전 자체 데미지 없음, enhancedBasicMult에서 처리
      // normal_multiplier = 강화 평타 배율, strong/extra = 최종 일격 — ult 직접 배율은 0
      if (lvData.normal_multiplier !== undefined) return 0;
      // 모든 숫자형 multiplier 키 합산 (fallback — 다성분 스킬 대응)
      let total = 0;
      for (const k of Object.keys(lvData)) {
        if (k.endsWith('_multiplier') && typeof lvData[k] === 'number' && lvData[k] > 0) {
          total += lvData[k];
        }
      }
      return total;
    }

    for (let lv = 1; lv <= 12; lv++) {
      const lvStr = String(lv);

      // 기본공격: hit_multipliers 합산
      const ba = c.skills?.basic_attack?.levels?.[lvStr];
      const basic = ba?.hit_multipliers ? ba.hit_multipliers.reduce((a, b) => a + b, 0) : 0;

      // 배틀/연계/궁극기 — 범용 파싱
      const battle = getAnyMult(c.skills?.battle_skill?.levels?.[lvStr]);
      const combo = getAnyMult(c.skills?.combo_skill?.levels?.[lvStr]);
      const ult = getAnyMult(c.skills?.ultimate?.levels?.[lvStr]);

      mults[lvStr] = { basic, battle, combo, ult };
    }

    // 타이밍 (공격속도_db.json + extracted_beam_search_data.json 병합)
    const cycle = timing?.cycle || 3.5;
    const skill_dur = beam?.skill?.duration || timing?.skill_duration || 1.0;
    const link_dur = beam?.link?.duration || timing?.link_duration || 1.0;
    const ult_dur = beam?.ultimate?.duration || timing?.ult_duration || 2.0;
    const link_cd = beam?.link?.cooldown || timing?.link_cooldown || 16;
    const ult_cost = beam?.ultimate?.gaugeMax || timing?.ult_gauge_max || 90;
    const sp_gain = timing?.sp_per_cycle || 20;
    const skill_gauge = beam?.skill?.gaugeGain || timing?.skill_gauge_gain || 6.5;
    const link_gauge = beam?.link?.gaugeGain || timing?.link_gauge_gain || 10;
    const ult_gauge_per_basic = 10;
    const ult_sp_gain = timing?.ult_sp_gain || 0;
    const link_sp_gain = timing?.link_sp_gain || 0;
    const skill_sp_gain = timing?.skill_sp_gain || 0;
    const stagger_per_cycle = timing?.stagger_per_cycle || 15;

    // 재능(talents) 어댑터 ─ 정예화 단계별 스탯 증가
    const talents = {};
    if (c.talents) {
      const ELITE_MAP = { '1차 정예화': 1, '2차 정예화': 2, '3차 정예화': 3, '4차 정예화': 4 };
      const STAT_MAP = { '힘': 'str', '민첩': 'agi', '지능': 'int', '의지': 'wil' };
      for (const talent of c.talents) {
        for (const eff of (talent.effects || [])) {
          const lv = ELITE_MAP[eff.unlock];
          if (lv && eff.stat && STAT_MAP[eff.stat]) {
            if (!talents[lv]) talents[lv] = {};
            const key = STAT_MAP[eff.stat];
            talents[lv][key] = (talents[lv][key] || 0) + (eff.value || 0);
          }
        }
      }
    }

    // 돌파(potentials) 어댑터
    const potentials = {};
    // 현재 potentials에서 스탯 보너스를 추출하기 어려움 (텍스트 기반)
    // 기본 정보만 보존

    // beam search 전용 데이터 보존
    const beamData = beam ? {
      skill_ticks: beam.skill?.damage_ticks || [],
      link_ticks: beam.link?.damage_ticks || [],
      ult_ticks: beam.ultimate?.damage_ticks || [],
      exec_ticks: beam.execution?.damage_ticks || [],
      skill_anomalies: beam.skill?.anomalies || [],
      link_anomalies: beam.link?.anomalies || [],
      ult_anomalies: beam.ultimate?.anomalies || [],
      accept_team_gauge: beam.accept_team_gauge !== false,
      skill_team_gauge: beam.skill?.teamGaugeGain || 0,
    } : null;

    return {
      character_id: c.character_id,
      name: c.name,
      name_en: c.name_en || '',
      rarity: c.rarity || 5,
      element: displayElem,
      elemColor: ELEM_COLOR[displayElem] || '#fff',
      weapon: c.weapon || '',
      cls: c.class || '',
      main: c.base_stats?.main_stat || '힘',
      sub: c.base_stats?.sub_stat || '민첩',
      stats, mults, talents, potentials,
      skills: c.skills,  // 강화 평타/처형 배율 추출에 필요한 원본 스킬 데이터
      // 타이밍
      cycle, skill_dur, link_dur, ult_dur,
      link_cd, ult_cost, sp_gain,
      skill_gauge, link_gauge, ult_gauge_per_basic,
      ult_sp_gain, link_sp_gain, skill_sp_gain,
      stagger_per_cycle,
      // beam search 데이터
      beamData,
    };
  });
}

// ── 2. 장비 DB 어댑터 ──────────────────────────────────────────
export function adaptEquipment(equipJson) {
  const SET_BONUS_EFFECTS = {};
  const STAT_KEY_MAP = {
    '배틀 스킬 피해 보너스': 'skill_dmg', '궁극기 피해 보너스': 'ult_dmg',
    '연계 스킬 피해 보너스': 'link_dmg', '물리 피해 보너스': 'phys_dmg',
    '냉기와 전기 피해 보너스': 'cold_elec_dmg', '열기와 자연 피해 보너스': 'heat_nat_dmg',
    '오리지늄 아츠 강도': 'arts_power', '치명타 확률': 'crit_rate',
    '보조 능력치': 'sub_stat_pct', '주요 능력치': 'main_stat_pct',
    '불균형 목표에 주는 피해 보너스': 'stagger_target_dmg',
    '궁극기 충전 효율': 'ult_eff',
    '일반 공격 피해 보너스': 'normal_dmg',
  };
  const STAT_KEY_MAP_P = { '힘': 'str', '민첩': 'agi', '지능': 'int', '의지': 'wil' };

  // 세트 효과 파싱 (간략 — 핵심 수치만)
  for (const [setName, desc] of Object.entries(equipJson.set_bonuses || {})) {
    const eff = {};
    if (!desc) { SET_BONUS_EFFECTS[setName] = eff; continue; }
    if (desc.includes('공격력 +8%')) eff.atk_pct = 0.08;
    if (desc.includes('공격력 +15%')) eff.atk_pct = 0.15;
    if (desc.includes('치명타 확률 +5%')) eff.crit_rate = (eff.crit_rate || 0) + 0.05;
    if (desc.includes('오리지늄 아츠 강도 +30')) eff.arts_power = 30;
    if (desc.includes('모든 스킬 피해 +20%')) eff.all_skill_dmg = 0.20;
    if (desc.includes('불균형 효율 보너스 +20%')) eff.unbalance_eff = 0.20;
    if (desc.includes('치유 효율 +20%')) eff.heal_pct = 0.20;
    if (desc.includes('생명력 +1000')) eff.hp_flat = 1000;
    if (desc.includes('연계 스킬 쿨타임 감소 +15%')) eff.link_cd_reduce = 0.15;
    // M.I. 경찰용: 치명타 후 ATK +5% 최대 5스택 → 전투 중 max 가정 +25%, 최대 중첩 시 치명타 확률 추가 +5%
    if (desc.includes('공격력 +5%') && desc.includes('5스택')) eff.atk_pct = (eff.atk_pct || 0) + 0.25;
    if (desc.includes('치명타 확률 추가 +5%')) eff.crit_rate = (eff.crit_rate || 0) + 0.05;
    // 펄스식: 감전 후 전기 피해 +50% / 동결 후 냉기 피해 +50%
    if (desc.includes('전기 피해 +50%')) eff.elec_dmg = (eff.elec_dmg || 0) + 0.50;
    if (desc.includes('냉기 피해 +50%')) eff.cold_dmg = (eff.cold_dmg || 0) + 0.50;
    // 열 작업용: 연소 후 열기 피해 +50% / 부식 후 자연 피해 +50%
    if (desc.includes('열기 피해 +50%')) eff.heat_dmg = (eff.heat_dmg || 0) + 0.50;
    if (desc.includes('자연 피해 +50%')) eff.nat_dmg = (eff.nat_dmg || 0) + 0.50;
    SET_BONUS_EFFECTS[setName] = eff;
  }

  const TYPE_MAP = { 'Gauntlet': '글러브', 'Armor': '방어구', 'Component': '부품' };
  const EQUIPMENT_DB = {};
  const EQ_BY_SLOT = { '글러브': [], '방어구': [], '부품': [] };

  for (const eq of (equipJson.equipment || [])) {
    const slotKo = eq.type_ko || TYPE_MAP[eq.type] || '부품';
    const stats = eq.stats || {};

    // base 스탯 (강화 0단계)
    const base = {};
    const pKey = STAT_KEY_MAP_P[stats.p_stat] || stats.p_stat;
    if (pKey && stats.p_value?.[0] != null) base[pKey] = stats.p_value[0];
    const sKey = STAT_KEY_MAP_P[stats.s_stat] || stats.s_stat;
    if (sKey && stats.s_value?.[0] != null) base[sKey] = stats.s_value[0];

    // forge (강화 옵션 3개: p, s, t 각각 0~3 단계)
    const forge = [];
    if (stats.p_stat && stats.p_value) {
      forge.push({ key: pKey, label: stats.p_stat, lv0: stats.p_value[0], lv1: stats.p_value[1], lv2: stats.p_value[2], lv3: stats.p_value[3] });
    }
    if (stats.s_stat && stats.s_value) {
      forge.push({ key: sKey, label: stats.s_stat, lv0: stats.s_value[0], lv1: stats.s_value[1], lv2: stats.s_value[2], lv3: stats.s_value[3] });
    }
    if (stats.t_stat && stats.t_value) {
      const tKey = STAT_KEY_MAP[stats.t_stat] || stats.t_stat;
      forge.push({ key: tKey, label: stats.t_stat, lv0: stats.t_value[0], lv1: stats.t_value[1], lv2: stats.t_value[2], lv3: stats.t_value[3] });
    }

    const adapted = {
      name: eq.name_ko,
      set: eq.set || '',
      rarity: eq.rarity || 5,
      slot: slotKo,
      isVariant: eq.isVariant || false,
      base_def: eq.base_def || 0,
      base, forge,
    };
    EQUIPMENT_DB[eq.name_ko] = adapted;
    if (EQ_BY_SLOT[slotKo]) EQ_BY_SLOT[slotKo].push(adapted);
  }

  return { SET_BONUS_EFFECTS, EQUIPMENT_DB, EQ_BY_SLOT };
}

// ── 3. 보스 DB 어댑터 ──────────────────────────────────────────
export function adaptBosses(bossJson) {
  return bossJson.map((b, idx) => {
    const stats = {};
    for (const [key, val] of Object.entries(b.hp || {})) {
      const lv = parseInt(key.replace('level', ''));
      if (!isNaN(lv)) {
        stats[lv] = { hp: val, def: b.def?.[key] || 100 };
      }
    }
    return {
      id: b.name_en || `boss_${idx}`,
      name: b.name_ko,
      name_en: b.name_en || '',
      type: b.type || 'Boss',
      stats,
      res: b.res || 0,
      maxStagger: 200,
      staggerBreakDuration: 10,
      executionRecovery: 100,
    };
  });
}

// ── 4. 버프 아이템 어댑터 ──────────────────────────────────────
export function adaptBuffItems(buffJson) {
  return buffJson.map((b, idx) => {
    const effects = [];
    const text = b.buff_effect || '';
    let m;
    // ATK flat (only non-percent, e.g. "ATK +180")
    m = text.match(/ATK \+(\d+)(?=[^%\d]|$)/);
    if (m) effects.push({ type: 'atk_flat', val: parseInt(m[1]), label: 'ATK +' + m[1] });
    // ATK %
    m = text.match(/ATK \+(\d+(?:\.\d+)?)%/);
    if (m) effects.push({ type: 'atk_pct', val: parseFloat(m[1]) / 100, label: 'ATK +' + m[1] + '%' });
    // Critical Rate
    m = text.match(/Critical Rate \+(\d+(?:\.\d+)?)%/);
    if (m) effects.push({ type: 'crit_rate', val: parseFloat(m[1]) / 100, label: '치명률 +' + m[1] + '%' });
    // All Damage / DMG Dealt (general)
    m = text.match(/DMG Dealt \+(\d+(?:\.\d+)?)%/i);
    if (m) effects.push({ type: 'all_dmg', val: parseFloat(m[1]) / 100, label: '전피해 +' + m[1] + '%' });
    // All Damage (explicit "All Damage")
    if (!m) { m = text.match(/All Damage \+(\d+(?:\.\d+)?)%/i); if (m) effects.push({ type: 'all_dmg', val: parseFloat(m[1]) / 100, label: '전피해 +' + m[1] + '%' }); }
    // Ultimate Gain Efficiency
    m = text.match(/Ultimate Gain Efficiency \+(\d+(?:\.\d+)?)%/);
    if (m) effects.push({ type: 'ult_eff', val: parseFloat(m[1]) / 100, label: '궁충전 +' + m[1] + '%' });
    // All Attributes
    m = text.match(/All Attributes \+(\d+)/);
    if (m) effects.push({ type: 'all_stat', val: parseInt(m[1]), label: '전스탯 +' + m[1] });
    // Physical DMG
    m = text.match(/Physical DMG (?:Dealt )?\+(\d+(?:\.\d+)?)%/);
    if (m) effects.push({ type: 'phys_dmg', val: parseFloat(m[1]) / 100, label: '물리% +' + m[1] + '%' });
    // DEF flat
    m = text.match(/DEF \+(\d+(?:\.\d+)?)(?=[^%\d]|$)/);
    if (m) effects.push({ type: 'def_flat', val: parseFloat(m[1]), label: 'DEF +' + m[1] });
    // DEF %
    m = text.match(/DEF \+(\d+(?:\.\d+)?)%/);
    if (m) effects.push({ type: 'def_pct', val: parseFloat(m[1]) / 100, label: 'DEF +' + m[1] + '%' });
    // DMG Reduction
    m = text.match(/DMG Reduction \+(\d+(?:\.\d+)?)%/);
    if (m) effects.push({ type: 'dmg_reduction', val: parseFloat(m[1]) / 100, label: '피감 +' + m[1] + '%' });
    // Treatment Received / Treatment Bonus
    m = text.match(/Treatment (?:Received Bonus|Bonus) \+(\d+(?:\.\d+)?)%/);
    if (m) effects.push({ type: 'heal_recv', val: parseFloat(m[1]) / 100, label: '치유 +' + m[1] + '%' });
    // Instant Ultimate Energy
    m = text.match(/(?:gain|instantly gain) (\d+)% Ultimate Energy/i);
    if (m) effects.push({ type: 'ult_instant', val: parseInt(m[1]), label: '궁 +' + m[1] + '%' });

    // 효과 설명 (한글 우선)
    const descKo = b.buff_effect_ko || b.buff_effect || '';

    return {
      id: idx,
      name: b.name_ko || b.name_en,
      name_en: b.name_en || '',
      rarity: b.rarity || 3,
      effects,
      desc: descKo,
    };
  });
}
