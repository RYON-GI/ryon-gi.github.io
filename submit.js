import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
import { EQUIPMENT_DB, EQUIPMENT_SETS } from './equipment_db.js'

const supabase = createClient(
  'https://ocdqyaiystqjjalenent.supabase.co',
  'sb_publishable_A3e_7cRzFpdv9FAq0hEJCQ_ChyKV6at'
);

const BOSS_LIST = [
  { group: '보스', items: ["로댄", "트라이겔로스", "마블 아겔로미레"] },
  { group: '그림자 이정표 — 대지에게 버림받은 존재', items: ["독 안개 탈출", "이단의 길", "활과 도끼의 연계"] },
  { group: '그림자 이정표 — 무기물', items: ["다가오는 위협", "돌격의 방패", "흔들림 없는 기반"] },
];

const PARTY_LIST = [
  "레바테인","질베르타","이본","관리자(남)","관리자(여)","포그라니치니크","엠버","라스트 라이트","여풍","아델리아",
  "펠리카","진천우","울프가드","아크라이트","자이히","알레쉬","판","아비웨나","스노우샤인",
  "아케쿠리","에스텔라","카치르","플루라이트","안탈",
];

// 슬롯 정의: 열 순서
const SLOTS = ['글러브', '방어구', '부품', '부품'];

// ── 초기화 ──────────────────────────────────────────
function initBossSelect() {
  const el = document.getElementById('f-boss');
  if (!el) return;
  el.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = ''; ph.textContent = '보스/컨텐츠 선택'; ph.disabled = true; ph.selected = true;
  el.appendChild(ph);
  BOSS_LIST.forEach(({ group, items }) => {
    const og = document.createElement('optgroup');
    og.label = group;
    items.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      og.appendChild(opt);
    });
    el.appendChild(og);
  });
}

function initPartyList() {
  const dl = document.getElementById('partyOptions');
  if (!dl) return;
  dl.innerHTML = '';
  PARTY_LIST.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; dl.appendChild(opt);
  });
}

// ── 선택 항목 토글 ──────────────────────────────────
function initOptionalToggle() {
  const toggle = document.getElementById('optional-toggle');
  const body   = document.getElementById('optional-body');
  const arrow  = document.getElementById('optional-arrow');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    const open = body.classList.toggle('open');
    arrow.classList.toggle('open', open);
  });
}

// ── 장비 드롭다운 빌더 ──────────────────────────────
// slotFilter: '글러브' | '방어구' | '부품'
function buildEquipSelects(memberIdx, slotColIdx, slotFilter) {
  const cell = document.createElement('div');
  cell.className = 'ta-equip-cell';

  // 세트 선택
  const setSelect = document.createElement('select');
  setSelect.id = `eq-${memberIdx}-${slotColIdx}-set`;
  setSelect.innerHTML = '<option value="">세트 선택</option>';
  EQUIPMENT_SETS.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    setSelect.appendChild(opt);
  });

  // 아이템 선택
  const itemSelect = document.createElement('select');
  itemSelect.id = `eq-${memberIdx}-${slotColIdx}-item`;
  itemSelect.innerHTML = '<option value="">장비 선택</option>';
  itemSelect.disabled = true;

  // 미리보기
  const preview = document.createElement('div');
  preview.className = 'ta-equip-preview';

  // 세트 선택 → 아이템 목록 갱신
  setSelect.addEventListener('change', () => {
    const setName = setSelect.value;
    itemSelect.innerHTML = '<option value="">장비 선택</option>';
    itemSelect.disabled = !setName;
    preview.innerHTML = '';
    if (!setName) return;
    const items = (EQUIPMENT_DB[setName] || []).filter(it => it.slot === slotFilter);
    items.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it.name; opt.textContent = it.name; opt.dataset.img = it.img;
      itemSelect.appendChild(opt);
    });
  });

  // 아이템 선택 → 미리보기
  itemSelect.addEventListener('change', () => {
    preview.innerHTML = '';
    const opt = itemSelect.options[itemSelect.selectedIndex];
    if (!opt || !opt.dataset.img) return;
    const img = document.createElement('img');
    img.src = `/${opt.dataset.img}`;
    img.alt = opt.value;
    const name = document.createElement('span');
    name.textContent = opt.value;
    preview.appendChild(img);
    preview.appendChild(name);
  });

  cell.appendChild(setSelect);
  cell.appendChild(itemSelect);
  cell.appendChild(preview);
  return cell;
}

function initEquipGrid() {
  const grid = document.getElementById('equip-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (let m = 0; m < 4; m++) {
    const row = document.createElement('div');
    row.className = 'ta-equip-row-wrap';

    const label = document.createElement('div');
    label.className = 'ta-equip-member-label';
    label.textContent = `파티 ${m + 1}`;
    row.appendChild(label);

    const cells = document.createElement('div');
    cells.className = 'ta-equip-row';

    // 4열: 글러브, 방어구, 부품1, 부품2
    SLOTS.forEach((slot, colIdx) => {
      cells.appendChild(buildEquipSelects(m, colIdx, slot));
    });
    row.appendChild(cells);
    grid.appendChild(row);
  }
}

// ── 장비 데이터 수집 ────────────────────────────────
function collectEquipment() {
  // equipment: [ { glove, armor, part1, part2 }, ... ] 4명
  const result = [];
  for (let m = 0; m < 4; m++) {
    const slots = {};
    const keys = ['glove', 'armor', 'part1', 'part2'];
    SLOTS.forEach((_, colIdx) => {
      const itemSel = document.getElementById(`eq-${m}-${colIdx}-item`);
      slots[keys[colIdx]] = itemSel?.value || '';
    });
    result.push(slots);
  }
  // 모두 비어있으면 null 반환
  const hasAny = result.some(r => Object.values(r).some(v => v));
  return hasAny ? result : null;
}

// ── 유틸 ────────────────────────────────────────────
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
}
function randSalt(len = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function getPartyString() {
  return ['f-party1','f-party2','f-party3','f-party4']
    .map(id => document.getElementById(id)?.value.trim() || '')
    .filter(Boolean).join(' / ');
}
function isHttpUrl(s) { return /^https?:\/\//i.test(s || ''); }

// ── 제출 ────────────────────────────────────────────
async function submitRun() {
  const msgBox    = document.getElementById('submit-msg');
  const btnSubmit = document.getElementById('btn-submit');

  const title  = document.getElementById('f-title').value.trim();
  const boss   = document.getElementById('f-boss').value.trim();
  const minRaw = document.getElementById('f-time-min').value.trim();
  const secRaw = document.getElementById('f-time-sec').value.trim();
  const secNum = parseFloat(secRaw);

  if (!secRaw || isNaN(secNum) || secNum < 0) {
    msgBox.textContent = '초(seconds)를 올바르게 입력해줘.'; return;
  }
  const minNum = minRaw === '' ? 0 : parseInt(minRaw, 10);
  const secPad = secNum < 10 ? '0' + secNum.toFixed(2) : secNum.toFixed(2);
  const clear_time = `${String(minNum).padStart(2,'0')}:${secPad}`;

  const party     = getPartyString();
  const video_url = document.getElementById('f-video').value.trim();
  const notes     = document.getElementById('f-notes').value.trim();
  const verified  = isHttpUrl(video_url);
  const pass      = document.getElementById('f-pass').value;

  if (!title || !boss || !party || !pass) {
    msgBox.textContent = '필수 항목(제목/보스/시간/파티/비번)을 입력해줘.'; return;
  }

  const equipment = collectEquipment(); // null or array

  btnSubmit.disabled = true;
  msgBox.textContent = '저장 중...';

  const salt = randSalt();
  const hash = await sha256Hex(salt + pass);
  const password_hash = `${salt}$${hash}`;

  const payload = { title, boss, clear_time, party, video_url, notes, verified, password_hash };
  if (equipment) payload.equipment = JSON.stringify(equipment);

  const { error } = await supabase.from('timeattack_runs').insert([payload]);

  btnSubmit.disabled = false;
  if (error) { console.error(error); msgBox.textContent = '저장 실패'; return; }

  localStorage.setItem('submit_toast', '저장 완료!');
  window.location.href = './timeattack.html';
}

// ── 실행 ────────────────────────────────────────────
initBossSelect();
initPartyList();
initOptionalToggle();
initEquipGrid();
document.getElementById('btn-submit')?.addEventListener('click', submitRun);
