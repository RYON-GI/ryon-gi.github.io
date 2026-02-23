// 장비 DB
// slot: '글러브' | '방어구' | '부품'  (부품은 부품1·부품2 두 슬롯에 공통 사용)
// isVariant: 업그레이드 단계 장비 여부 (· I, · II, · III)
// img: '장비/세트명/장비명.png' 절대경로

export const SLOTS = ['글러브', '방어구', '부품'];

export const EQUIPMENT_SETS = [
  "개척",
  "검술사",
  "경량 초자연",
  "본 크러셔",
  "생체 보조",
  "식양의 숨결",
  "열 작업용",
  "위기 탈출",
  "응룡 50식",
  "조류의 물결",
  "펄스식",
  "M. I. 경찰용",
];

export const EQUIPMENT_DB = {
  "개척": [
    { name: "개척자 내부식성 장갑", img: "장비/개척/개척자 내부식성 장갑.png", slot: "글러브", isVariant: false },
    { name: "개척자 방어구 · I", img: "장비/개척/개척자 방어구 · I.png", slot: "방어구", isVariant: true },
    { name: "개척자 방어구 · II", img: "장비/개척/개척자 방어구 · II.png", slot: "방어구", isVariant: true },
    { name: "개척자 방어구 · III", img: "장비/개척/개척자 방어구 · III.png", slot: "방어구", isVariant: true },
    { name: "개척자 방어구", img: "장비/개척/개척자 방어구.png", slot: "방어구", isVariant: false },
    { name: "개척자 증량 산소 공급 장치", img: "장비/개척/개척자 증량 산소 공급 장치.png", slot: "부품", isVariant: false },
    { name: "개척자 통신기 · I", img: "장비/개척/개척자 통신기 · I.png", slot: "부품", isVariant: true },
    { name: "개척자 통신기", img: "장비/개척/개척자 통신기.png", slot: "부품", isVariant: false },
  ],
  "검술사": [
    { name: "홍산 부싯돌", img: "장비/검술사/홍산 부싯돌.png", slot: "부품", isVariant: false },
    { name: "홍산 전술 건틀릿", img: "장비/검술사/홍산 전술 건틀릿.png", slot: "글러브", isVariant: false },
    { name: "홍산 전술 장갑", img: "장비/검술사/홍산 전술 장갑.png", slot: "글러브", isVariant: false },
    { name: "홍산 중장갑", img: "장비/검술사/홍산 중장갑.png", slot: "방어구", isVariant: false },
  ],
  "경량 초자연": [
    { name: "경량 초자연 글러브", img: "장비/경량 초자연/경량 초자연 글러브.png", slot: "글러브", isVariant: false },
    { name: "경량 초자연 보호판", img: "장비/경량 초자연/경량 초자연 보호판.png", slot: "방어구", isVariant: false },
    { name: "경량 초자연 분석 반지", img: "장비/경량 초자연/경량 초자연 분석 반지.png", slot: "부품", isVariant: false },
    { name: "경량 초자연 안정판", img: "장비/경량 초자연/경량 초자연 안정판.png", slot: "부품", isVariant: false },
  ],
  "본 크러셔": [
    { name: "본 크러셔 마스크 · I", img: "장비/본 크러셔/본 크러셔 마스크 · I.png", slot: "부품", isVariant: true },
    { name: "본 크러셔 마스크", img: "장비/본 크러셔/본 크러셔 마스크.png", slot: "부품", isVariant: false },
    { name: "본 크러셔 머플러 · I", img: "장비/본 크러셔/본 크러셔 머플러 · I.png", slot: "방어구", isVariant: true },
    { name: "본 크러셔 머플러", img: "장비/본 크러셔/본 크러셔 머플러.png", slot: "방어구", isVariant: false },
    { name: "본 크러셔 조각상 · I", img: "장비/본 크러셔/본 크러셔 조각상 · I.png", slot: "부품", isVariant: true },
    { name: "본 크러셔 조각상", img: "장비/본 크러셔/본 크러셔 조각상.png", slot: "부품", isVariant: false },
    { name: "본 크러셔 중갑 방어구 · I", img: "장비/본 크러셔/본 크러셔 중갑 방어구 · I.png", slot: "방어구", isVariant: true },
    { name: "본 크러셔 중갑 방어구", img: "장비/본 크러셔/본 크러셔 중갑 방어구.png", slot: "방어구", isVariant: false },
  ],
  "생체 보조": [
    { name: "생체 보조 건틀릿", img: "장비/생체 보조/생체 보조 건틀릿.png", slot: "글러브", isVariant: false },
    { name: "생체 보조 견갑", img: "장비/생체 보조/생체 보조 견갑.png", slot: "글러브", isVariant: false },
    { name: "생체 보조 보호 주사기", img: "장비/생체 보조/생체 보조 보호 주사기.png", slot: "부품", isVariant: false },
    { name: "생체 보조 보호판", img: "장비/생체 보조/생체 보조 보호판.png", slot: "부품", isVariant: false },
    { name: "생체 보조 접속기 · I", img: "장비/생체 보조/생체 보조 접속기 · I.png", slot: "부품", isVariant: true },
    { name: "생체 보조 접속기", img: "장비/생체 보조/생체 보조 접속기.png", slot: "부품", isVariant: false },
    { name: "생체 보조 중갑", img: "장비/생체 보조/생체 보조 중갑.png", slot: "방어구", isVariant: false },
    { name: "생체 보조 흉갑", img: "장비/생체 보조/생체 보조 흉갑.png", slot: "방어구", isVariant: false },
  ],
  "식양의 숨결": [
    { name: "식양의 숨결 글러브 · I", img: "장비/식양의 숨결/식양의 숨결 글러브 · I.png", slot: "글러브", isVariant: true },
    { name: "식양의 숨결 글러브", img: "장비/식양의 숨결/식양의 숨결 글러브.png", slot: "글러브", isVariant: false },
    { name: "식양의 숨결 보조 견갑", img: "장비/식양의 숨결/식양의 숨결 보조 견갑.png", slot: "부품", isVariant: false },
    { name: "식양의 숨결 장갑", img: "장비/식양의 숨결/식양의 숨결 장갑.png", slot: "방어구", isVariant: false },
    { name: "식양의 숨결 충전 코어 · I", img: "장비/식양의 숨결/식양의 숨결 충전 코어 · I.png", slot: "부품", isVariant: true },
    { name: "식양의 숨결 충전 코어", img: "장비/식양의 숨결/식양의 숨결 충전 코어.png", slot: "부품", isVariant: false },
  ],
  "열 작업용": [
    { name: "열 작업용 강화 골격", img: "장비/열 작업용/열 작업용 강화 골격.png", slot: "방어구", isVariant: false },
    { name: "열 작업용 건틀릿 · I", img: "장비/열 작업용/열 작업용 건틀릿 · I.png", slot: "글러브", isVariant: true },
    { name: "열 작업용 건틀릿", img: "장비/열 작업용/열 작업용 건틀릿.png", slot: "글러브", isVariant: false },
    { name: "열 작업용 에너지 저장함", img: "장비/열 작업용/열 작업용 에너지 저장함.png", slot: "부품", isVariant: false },
    { name: "열 작업용 온도 측정기", img: "장비/열 작업용/열 작업용 온도 측정기.png", slot: "부품", isVariant: false },
    { name: "열 작업용 전력 상자", img: "장비/열 작업용/열 작업용 전력 상자.png", slot: "부품", isVariant: false },
  ],
  "위기 탈출": [
    { name: "위기 탈출 도장 · I", img: "장비/위기 탈출/위기 탈출 도장 · I.png", slot: "부품", isVariant: true },
    { name: "위기 탈출 도장", img: "장비/위기 탈출/위기 탈출 도장.png", slot: "부품", isVariant: false },
    { name: "위기 탈출 식별 패널 · I", img: "장비/위기 탈출/위기 탈출 식별 패널 · I.png", slot: "부품", isVariant: true },
    { name: "위기 탈출 식별 패널", img: "장비/위기 탈출/위기 탈출 식별 패널.png", slot: "부품", isVariant: false },
  ],
  "응룡 50식": [
    { name: "응룡 50식 경갑", img: "장비/응룡 50식/응룡 50식 경갑.png", slot: "방어구", isVariant: false },
    { name: "응룡 50식 글러브 · I", img: "장비/응룡 50식/응룡 50식 글러브 · I.png", slot: "글러브", isVariant: true },
    { name: "응룡 50식 글러브", img: "장비/응룡 50식/응룡 50식 글러브.png", slot: "글러브", isVariant: false },
    { name: "응룡 50식 단검 · I", img: "장비/응룡 50식/응룡 50식 단검 · I.png", slot: "부품", isVariant: true },
    { name: "응룡 50식 단검", img: "장비/응룡 50식/응룡 50식 단검.png", slot: "부품", isVariant: false },
    { name: "응룡 50식 중갑", img: "장비/응룡 50식/응룡 50식 중갑.png", slot: "방어구", isVariant: false },
    { name: "응룡 50식 탐지기", img: "장비/응룡 50식/응룡 50식 탐지기.png", slot: "부품", isVariant: false },
  ],
  "조류의 물결": [
    { name: "낙조 경갑", img: "장비/조류의 물결/낙조 경갑.png", slot: "방어구", isVariant: false },
    { name: "조류의 물결 건틀릿", img: "장비/조류의 물결/조류의 물결 건틀릿.png", slot: "글러브", isVariant: false },
    { name: "탁류 화염 절단기", img: "장비/조류의 물결/탁류 화염 절단기.png", slot: "부품", isVariant: false },
    { name: "현하 산소 공급 장치", img: "장비/조류의 물결/현하 산소 공급 장치.png", slot: "부품", isVariant: false },
  ],
  "펄스식": [
    { name: "펄스식 교정기", img: "장비/펄스식/펄스식 교정기.png", slot: "부품", isVariant: false },
    { name: "펄스식 방해 슈트", img: "장비/펄스식/펄스식 방해 슈트.png", slot: "방어구", isVariant: false },
    { name: "펄스식 장갑", img: "장비/펄스식/펄스식 장갑.png", slot: "글러브", isVariant: false },
  ],
  "M. I. 경찰용": [
    { name: "M. I. 경찰용 단검 · I", img: "장비/M. I. 경찰용/M. I. 경찰용 단검 · I.png", slot: "부품", isVariant: true },
    { name: "M. I. 경찰용 단검", img: "장비/M. I. 경찰용/M. I. 경찰용 단검.png", slot: "부품", isVariant: false },
    { name: "M. I. 경찰용 도구 세트", img: "장비/M. I. 경찰용/M. I. 경찰용 도구 세트.png", slot: "부품", isVariant: false },
    { name: "M. I. 경찰용 망토 · I", img: "장비/M. I. 경찰용/M. I. 경찰용 망토 · I.png", slot: "방어구", isVariant: true },
    { name: "M. I. 경찰용 망토 · II", img: "장비/M. I. 경찰용/M. I. 경찰용 망토 · II.png", slot: "방어구", isVariant: true },
    { name: "M. I. 경찰용 망토", img: "장비/M. I. 경찰용/M. I. 경찰용 망토.png", slot: "방어구", isVariant: false },
    { name: "M. I. 경찰용 방어구", img: "장비/M. I. 경찰용/M. I. 경찰용 방어구.png", slot: "방어구", isVariant: false },
    { name: "M. I. 경찰용 수갑", img: "장비/M. I. 경찰용/M. I. 경찰용 수갑.png", slot: "부품", isVariant: false },
    { name: "M. I. 경찰용 장갑", img: "장비/M. I. 경찰용/M. I. 경찰용 장갑.png", slot: "글러브", isVariant: false },
    { name: "M. I. 경찰용 조준기", img: "장비/M. I. 경찰용/M. I. 경찰용 조준기.png", slot: "부품", isVariant: false },
    { name: "M. I. 경찰용 팔찌 · I", img: "장비/M. I. 경찰용/M. I. 경찰용 팔찌 · I.png", slot: "글러브", isVariant: true },
    { name: "M. I. 경찰용 팔찌", img: "장비/M. I. 경찰용/M. I. 경찰용 팔찌.png", slot: "글러브", isVariant: false },
  ],
};

// 이름으로 빠르게 조회: EQUIPMENT_MAP['장비명'] → { set, img, slot, isVariant }
export const EQUIPMENT_MAP = {};
for (const [set, items] of Object.entries(EQUIPMENT_DB)) {
  for (const item of items) {
    EQUIPMENT_MAP[item.name] = { set, img: item.img, slot: item.slot, isVariant: item.isVariant };
  }
}

// 슬롯별 장비 목록: EQUIPMENT_BY_SLOT['글러브'] → [{ name, img, set, isVariant }, ...]
export const EQUIPMENT_BY_SLOT = { '글러브': [], '방어구': [], '부품': [] };
for (const [set, items] of Object.entries(EQUIPMENT_DB)) {
  for (const item of items) {
    EQUIPMENT_BY_SLOT[item.slot].push({ name: item.name, img: item.img, set, isVariant: item.isVariant });
  }
}