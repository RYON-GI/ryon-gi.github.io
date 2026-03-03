// 효율공식 DB — Endaxis 소스코드 & 게임 실측값 기반
// ─────────────────────────────────────────────────────────────────────
// 엔드필드 데미지 최종 계산 공식:
//
//   최종ATK = (캐릭터기본ATK + 무기ATK) × (1 + ATK%) × 주능력치보정 × 보조능력치보정
//
//   주능력치보정 = 1 + (주능 / 주능기준) × 주능환산률
//   보조능력치보정 = 1 + (보조능 / 보조능기준) × 보조능환산률
//
//   최종피해 = 최종ATK × 스킬배율 × 치명타배율 × 방어배율
//              × (1 + 속성피해보너스) × (1 + 스킬피해보너스)
//              × 증폭배율(AMP)
//
//   치명타배율  = 1 + 치명타율 × (치명타피해 - 1)   ← 기대값 방식
//   방어배율    = 100 / (100 + 방어력)
//   아츠강도보정 = 1 + 아츠강도 × 0.005              ← 넘어뜨리기/낙하 공격에만 적용
// ─────────────────────────────────────────────────────────────────────

// ══ 1. 팀 공유 SP 시스템 상수 ════════════════════════════════════════
export const SP_SYSTEM = {
  max_sp: 300,             // 팀 SP 최대치
  initial_sp: 200,         // 전투 시작 시 초기 SP
  regen_rate: 8,           // 초당 자연 회복 SP
  skill_cost: 100,         // 배틀 스킬 SP 비용 (전 캐릭터 동일)
  skill_regen_pause: 0.5,  // 배틀 스킬 사용 후 SP 회복 정지 시간(초)
  link_regen_pause: 1.5,   // 연계 스킬 발동 시 SP 회복 정지 시간(초)
};

// ══ 2. 주요 능력치 → ATK 환산 공식 ══════════════════════════════════
// 각 클래스의 주능력치(힘/민첩/지능/의지)가 최종 공격력에 미치는 영향
// finalATK에 적용되는 곱연산 보너스율
//
// 공식: ATK보정 = 1 + 주능 × PRIMARY_RATE
//       (주능 = 캐릭터 주능력치 + 무기슬롯/장비에서 추가된 주능)
//
// 실측 근거: Lv90 레바테인 민첩 140 → ATK보정 ≈ 1.70
//            → 140 × 0.005 = 0.70  →  1 + 0.70 = 1.70 ✓
export const PRIMARY_RATE = 0.005;  // 주능력치 1당 ATK +0.5%

// ══ 3. 보조 능력치 → ATK 환산 공식 ══════════════════════════════════
// 공식: ATK보정 = 1 + 보조능 × SECONDARY_RATE
//
// 실측 근거: Lv90 관리자 힘(보조) 123 → ATK보정 ≈ 1.246
//            → 123 × 0.002 = 0.246  →  1 + 0.246 = 1.246 ✓
export const SECONDARY_RATE = 0.002;  // 보조능력치 1당 ATK +0.2%

// ══ 4. 오리지늄 아츠 강도 → 피해 환산 ════════════════════════════════
// 넘어뜨리기(knockup) / 낙하 공격(knockdown) 발동 시에만 적용
// 공식: 강도보정 = 1 + 아츠강도 × ARTS_POWER_RATE
export const ARTS_POWER_RATE = 0.005;  // 아츠강도 1당 피해 +0.5%

// ══ 5. 방어력 → 피해 배율 공식 ═══════════════════════════════════════
// 공식: 방어배율 = 100 / (100 + 방어력)
// 예시:
//   DEF 100 → 배율 0.500 (50% 피해)
//   DEF 140 → 배율 0.417 (41.7% 피해)
//   DEF  70 → 배율 0.588 (58.8% 피해)
export function calcDefMultiplier(def) {
  return 100 / (100 + Math.max(0, def));
}

// ══ 6. 치명타 기대값 배율 ════════════════════════════════════════════
// 공식: 치명타배율 = 1 + 치명타율 × (치명타피해 - 1)
// 예시:
//   치명타율 50%, 치명타피해 200% → 1 + 0.5 × (2.0 - 1) = 1.5
export function calcCritMultiplier(critRate, critDmg) {
  const rate = Math.min(1.0, Math.max(0, critRate));
  const dmg = Math.max(1.0, critDmg);
  return 1 + rate * (dmg - 1);
}

// ══ 7. 최종 ATK 계산 ══════════════════════════════════════════════════
// 입력:
//   charBaseAtk   : 캐릭터 기본 ATK (레벨별 스탯에서)
//   weaponAtk     : 무기 기본 ATK
//   atkPct        : 공격력% 합산 (소수, 예: 0.39)
//   mainStat      : 주능력치 총합 (힘/민첩/지능/의지 중 해당 캐릭터 주능)
//   subStat       : 보조능력치 총합
export function calcFinalAtk(charBaseAtk, weaponAtk, atkPct, mainStat, subStat) {
  const baseAtk = charBaseAtk + weaponAtk;
  const atkMult = 1 + (atkPct || 0);

  const mainBonus = (mainStat || 0) * PRIMARY_RATE;
  const subBonus = (subStat || 0) * SECONDARY_RATE;
  const attrBonus = 1 + mainBonus + subBonus;

  return Math.round(baseAtk * atkMult * attrBonus);
}

// ══ 8. 스킬 피해 계산 ══════════════════════════════════════════════════
// 입력:
//   finalAtk      : 최종 ATK (calcFinalAtk 결과)
//   skillMult     : 스킬 배율 (예: 3.48 = 348%)
//   critMult      : 치명타 기대값 배율 (calcCritMultiplier 결과)
//   defMult       : 방어 배율 (calcDefMultiplier 결과)
//   elemBonus     : 속성 피해 보너스 합산 (소수, 예: 0.20)
//   skillBonus    : 스킬 피해 보너스 합산 (소수, 예: 0.30)
//   ampMult       : 증폭 배율 (지원 캐릭터 AMP 효과, 기본 1.0)
export function calcSkillDamage(finalAtk, skillMult, critMult, defMult, elemBonus, skillBonus, ampMult) {
  return Math.round(
    finalAtk
    * skillMult
    * critMult
    * defMult
    * (1 + (elemBonus || 0))
    * (1 + (skillBonus || 0))
    * (ampMult || 1.0)
  );
}

// ══ 9. 캐릭터 클래스별 주/보조 능력치 정의 ════════════════════════════
// main_stat : ATK에 PRIMARY_RATE(0.005)로 환산되는 주능
// sub_stat  : ATK에 SECONDARY_RATE(0.002)로 환산되는 보조능
export const CLASS_STAT_MAP = {
  // 무기타입별 일반적 분류 (캐릭터_DB.js base_stats.main_stat/sub_stat 참조)
  '힘': { label: '힘', rate: PRIMARY_RATE },
  '민첩': { label: '민첩', rate: PRIMARY_RATE },
  '지능': { label: '지능', rate: PRIMARY_RATE },
  '의지': { label: '의지', rate: PRIMARY_RATE },
};

// ══ 10. 증폭(AMP) 지원 캐릭터 목록 ═══════════════════════════════════
// 특정 지원 캐릭터가 팀 전체에 부여하는 피해 증폭 배율
// type: 'amp' = 곱연산 증폭 (×1.XX) | 'atk' = 공격력% 가산
export const SUPPORT_BUFFS = [
  { name: '질베르타', type: 'amp', val: 1.30, condition: '연계 스킬 후 15초간 팀 전체' },
  { name: '자이히', type: 'amp', val: 1.21, condition: '연계 스킬 후 팀 전체' },
  { name: '안탈', type: 'amp', val: 1.17, condition: '연계 스킬 후 팀 전체' },
  { name: '아델리아', type: 'atk', val: 0.15, condition: '배틀 스킬 후 팀 전체 ATK+15%' },
  { name: '여풍', type: 'atk', val: 0.15, condition: '연계 스킬 후 팀 전체 ATK+15%' },
];

// ══ 11. 속성 피해 보너스 키 목록 ════════════════════════════════════════
// 계산 시 해당하는 속성 보너스를 합산
export const ELEMENT_DMG_KEYS = {
  '물리': 'phys_dmg',
  '열기': 'heat_dmg',
  '냉기': 'cold_dmg',
  '전기': 'elec_dmg',
  '자연': 'nat_dmg',
  '아츠': 'arts_dmg',
};

// ══ 12. 스킬 피해 보너스 키 목록 ════════════════════════════════════════
export const SKILL_BONUS_KEYS = {
  '일반공격': 'basic_atk_bonus',
  '배틀스킬': 'skill_bonus',
  '연계스킬': 'link_bonus',
  '궁극기': 'ult_bonus',
  '모든스킬': 'all_skill_bonus',
};

// ══ 13. 힘 스탯 체력 보너스 ═══════════════════════════════════════════
// 힘 1당 체력이 5씩 증가함
export function calcFinalHp(baseHp, str) {
  return baseHp + (str * 5);
}
