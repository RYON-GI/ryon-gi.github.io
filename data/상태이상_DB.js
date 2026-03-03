// 상태이상 및 아츠 이상반응 DB
// 출처: endfield.wiki.gg (Damage, Arts_Reaction, Combustion, Solidification, Corrosion, Electrification)
// ═══════════════════════════════════════════════════════════════════

// ── 아츠 부착(Arts Infliction) 타입 ─────────────────────────────
// 동일 속성 2번째 부착부터 아츠 폭발 발동 (스택 소모 없음)
// 다른 속성 만나면 아츠 반응 발동 (양쪽 스택 모두 소모)
// 최대 4레벨까지 누적 가능
export const ARTS_INFLICTION_TYPES = {
    cold_attach:   { label: '냉기 부착', element: '냉기', burst: 'cold_burst',   reaction: 'solidification' },
    nature_attach: { label: '자연 부착', element: '자연', burst: 'nature_burst', reaction: 'corrosion' },
    emag_attach:   { label: '전자기 부착', element: '전기', burst: 'emag_burst',   reaction: 'electrification' },
    conductive:    { label: '전도 부착', element: '전기', burst: 'conductive_burst', reaction: 'electrification' },
    heat_attach:   { label: '열기 부착', element: '열기', burst: 'heat_burst',   reaction: 'combustion' },
    blaze_attach:  { label: '화염 부착', element: '열기', burst: 'blaze_burst',  reaction: 'combustion' },
};

// ── 아츠 폭발(Arts Burst) ────────────────────────────────────────
// 발동 조건: 동일 속성 부착이 2레벨 이상일 때 (스택 소모 없음)
// 데미지: 항상 160% ATK (레벨 무관)
// 추가 배율: ArtsIntensityMultiplier = 1 + ArtsIntensity / 100
export const ARTS_BURST = {
    baseMult: 1.6,  // 160% ATK (고정)
    description: '동일 속성 부착 2스택↑ 시 발동. 스택 유지.',
};

// ── 아츠 반응(Arts Reaction) ─────────────────────────────────────
// 발동 조건: 다른 속성 부착이 만날 때 (양쪽 스택 모두 소모)
// 초기 타격 공식: (80% + 80% × level) ATK
//   level 1 = 160%, 2 = 240%, 3 = 320%, 4 = 400%
export const ARTS_REACTION_INITIAL = { a: 0.8, b: 0.8 }; // mult = a + b × level

export const ARTS_REACTIONS = {
    // 동결 — 냉기 vs 비냉기 (Solidification)
    solidification: {
        label: '동결',
        trigger: '냉기 부착 + 非냉기 부착',
        // 초기 타격: (80% + 80% × level) ATK
        initialMult: (level) => 0.8 + 0.8 * level,
        // CC: 레벨에 따라 6~9초 행동불가
        ccDuration: [0, 6, 7, 8, 9], // [0, lv1, lv2, lv3, lv4]
        // Shatter 가능 (취약/물리 상태이상으로 추가 타격)
        // Shatter 배율: (120% + 120% × level) ATK
        shatterMult: (level) => 1.2 + 1.2 * level,
        shatterDesc: '취약/물리 상태이상 적중 시 Shatter 발동, 동결 소멸',
    },

    // 부식 — 자연 vs 비자연 (Corrosion)
    corrosion: {
        label: '부식',
        trigger: '자연 부착 + 非자연 부착',
        // 초기 타격: (80% + 80% × level) ATK
        initialMult: (level) => 0.8 + 0.8 * level,
        // 내성 감소: 15초 지속 (아츠 강도에 따라 효과 증폭)
        // BaseResistanceReduction: [0, 12, 16, 20, 24] (level 1~4, 단위: 저항 포인트)
        resistanceReduction: [0, 12, 16, 20, 24],
        duration: 15,
        // 내성 증폭 공식: EnhancedValue = Base × (1 + 2 × ArtsIntensity / (ArtsIntensity + 300))
    },

    // 감전 — 전기 vs 비전기 (Electrification)
    electrification: {
        label: '감전',
        trigger: 'emag_attach + conductive (전기 계열 교차)',
        // 초기 타격: (80% + 80% × level) ATK
        initialMult: (level) => 0.8 + 0.8 * level,
        // 아츠 피해 증가 (받는 아츠 피해 %)
        // [0, 12%, 16%, 20%, 24%] (level 1~4)
        artsDmgTaken: [0, 0.12, 0.16, 0.20, 0.24],
        // 지속 시간 [0, 12s, 18s, 24s, 30s]
        duration: [0, 12, 18, 24, 30],
        // 효과 증폭 공식: EnhancedValue = Base × (1 + 2 × ArtsIntensity / (ArtsIntensity + 300))
    },

    // 연소 — 열기 vs 비열기 (Combustion)
    combustion: {
        label: '연소',
        trigger: '열기 부착 + 非열기 부착',
        // 초기 타격: (80% + 80% × level) ATK
        initialMult: (level) => 0.8 + 0.8 * level,
        // DoT: (12% + 12% × level) ATK/틱, 10틱 (10초)
        dotPerTick: (level) => 0.12 + 0.12 * level,
        dotTicks: 10,
        // 합산 DoT 총 피해: (12% + 12% × level) × 10 ATK
        // level 1 = 240%, 2 = 360%, 3 = 480%, 4 = 600%
        // 초기 + DoT 합계: (80%+80%L) + (120%+120%L) = 200%+200%L = 200%(1+L)
        totalMult: (level) => 2.0 * (1 + level),
    },
};

// ── 아츠 강도(Arts Intensity) ────────────────────────────────────
// 아츠 강도 = 캐릭터 지능(INT) 스탯으로 결정
// ArtsIntensityMultiplier (폭발/반응 데미지 배율):
//   = 1 + ArtsIntensity / 100
// 내성 감소/감전 효과 증폭:
//   EnhancedValue = BaseValue × (1 + 2 × ArtsIntensity / (ArtsIntensity + 300))
export const ARTS_INTENSITY = {
    burstReactionMultiplier: (intensity) => 1 + intensity / 100,
    enhancedEffect: (base, intensity) => base * (1 + 2 * intensity / (intensity + 300)),
};

// ── 물리 상태이상(Physical Status) ──────────────────────────────
// 참고용 (현재 시뮬에서 별도 처리)
export const PHYSICAL_STATUS = {
    lift_knockdown: { baseMult: 1.2, hiddenMult: (lv) => 1 + (lv - 139) / 2 },
    crush:          { baseMult: (vulnStacks) => 1.5 + 1.5 * vulnStacks },
    breach:         { baseMult: (vulnStacks) => 0.5 + 0.5 * vulnStacks },
    shatter:        { baseMult: (statusLevel) => 1.2 + 1.2 * statusLevel },
};
