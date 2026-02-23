import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const CHAR_DATA = {
  "관리자(남)":    { s: "6성 캐릭터/관리자(남).png",    c: "#ff7100" },
  "관리자(여)":    { s: "6성 캐릭터/관리자(여).png",    c: "#ff7100" },
  "라스트 라이트": { s: "6성 캐릭터/라스트 라이트.png", c: "#ff7100" },
  "레바테인":      { s: "6성 캐릭터/레바테인.png",      c: "#ff7100" },
  "아델리아":      { s: "6성 캐릭터/아델리아.png",      c: "#ff7100" },
  "포그라니치니크": { s: "6성 캐릭터/포그라니치니크.png", c: "#ff7100" },
  "여풍":          { s: "6성 캐릭터/여풍.png",          c: "#ff7100" },
  "이본":          { s: "6성 캐릭터/이본.png",          c: "#ff7100" },
  "엠버":          { s: "6성 캐릭터/엠버.png",          c: "#ff7100" },
  "질베르타":      { s: "6성 캐릭터/질베르타.png",      c: "#ff7100" },
  "스노우샤인":    { s: "5성 캐릭터/스노우샤인.png",    c: "#ffd200" },
  "아비웨나":      { s: "5성 캐릭터/아비웨나.png",      c: "#ffd200" },
  "아크라이트":    { s: "5성 캐릭터/아크라이트.png",    c: "#ffd200" },
  "알레쉬":        { s: "5성 캐릭터/알레쉬.png",        c: "#ffd200" },
  "울프가드":      { s: "5성 캐릭터/울프가드.png",      c: "#ffd200" },
  "자이히":        { s: "5성 캐릭터/자이히.png",        c: "#ffd200" },
  "진천우":        { s: "5성 캐릭터/진천우.png",        c: "#ffd200" },
  "판":            { s: "5성 캐릭터/판.png",            c: "#ffd200" },
  "펠리카":        { s: "5성 캐릭터/펠리카.png",        c: "#ffd200" },
  "플루라이트":    { s: "4성 캐릭터/플루라이트.png",    c: "#9b59b6" },
  "아케쿠리":      { s: "4성 캐릭터/아케쿠리.png",      c: "#9b59b6" },
  "에스텔라":      { s: "4성 캐릭터/에스텔라.png",      c: "#9b59b6" },
  "카치르":        { s: "4성 캐릭터/카치르.png",        c: "#9b59b6" },
  "안탈":          { s: "4성 캐릭터/안탈.png",          c: "#9b59b6" },
};

const supabase = createClient(
  'https://ocdqyaiystqjjalenent.supabase.co',
  'sb_publishable_A3e_7cRzFpdv9FAq0hEJCQ_ChyKV6at'
);

const CATEGORY_MAP = {
  '보스': [
    { label: '전체', value: '' },
    { label: '로댄', value: '로댄' },
    { label: '트리아겔로스', value: '트리아겔로스' },
    { label: '마블 아겔로미레', value: '마블 아겔로미레' },
  ],
  '그림자 이정표': [
    { label: '전체', value: '' },
    // 대지에게 버림받은 존재
    { label: '독 안개 탈출', value: '독 안개 탈출', group: '대지에게 버림받은 존재' },
    { label: '이단의 길', value: '이단의 길', group: '대지에게 버림받은 존재' },
    { label: '활과 도끼의 연계', value: '활과 도끼의 연계', group: '대지에게 버림받은 존재' },
    // 무기물
    { label: '다가오는 위협', value: '다가오는 위협', group: '무기물' },
    { label: '돌격의 방패', value: '돌격의 방패', group: '무기물' },
    { label: '흔들림 없는 기반', value: '흔들림 없는 기반', group: '무기물' },
  ],
};

const PAGE_SIZE = 20;

let allRuns = [];
let currentCategory = '';
let currentGroup = '';   // 그림자 이정표 내 그룹 (대지에게 버림받은 존재 / 무기물)
let currentBoss = '';
let sortMode = 'time';
let activeTab = 'ta-verified';
let searchQuery = '';
let verifiedPage = 1;
let unverifiedPage = 1;

// ── 탭 전환 ──────────────────────────────────────────
function taShowTab(tab) {
  document.getElementById('ta-verified').classList.add('hidden');
  document.getElementById('ta-unverified').classList.add('hidden');
  // v5 메인탭(.tab) 건드리지 않고 서브탭만 토글
  document.getElementById('ta-tab-verified').classList.remove('active');
  document.getElementById('ta-tab-unverified').classList.remove('active');
  document.getElementById(tab).classList.remove('hidden');
  document.getElementById(tab === 'ta-verified' ? 'ta-tab-verified' : 'ta-tab-unverified').classList.add('active');
  activeTab = tab;
  updateTabCount();
}
window.taShowTab = taShowTab;

// ── 시간 파싱 ─────────────────────────────────────────
function parseTime(str) {
  if (!str) return Infinity;
  const m = str.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = parseFloat(str);
  return isNaN(n) ? Infinity : n;
}

// ── 날짜 포맷 ─────────────────────────────────────────
function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff/60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff/86400)}일 전`;
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

// ── 파티 렌더 ─────────────────────────────────────────
function renderParty(partyStr) {
  if (!partyStr) return '<span style="color:#666">-</span>';
  return partyStr.split('/').map(s => s.trim()).filter(Boolean).map(name => {
    const d = CHAR_DATA[name];
    if (d) return `<span class="char-icon size-sm" style="--rank-color:${d.c}" title="${name}">
      <img src="${d.s}" alt="${name}" loading="lazy" />
      <span class="char-name">${name}</span>
    </span>`;
    return `<span class="char-icon-text">${name}</span>`;
  }).join('');
}

// ── 검색 필터 ─────────────────────────────────────────
function matchesSearch(run) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  const party = (run.party || '').toLowerCase();
  const title = (run.title || '').toLowerCase();
  const boss  = (run.boss  || '').toLowerCase();
  return party.includes(q) || title.includes(q) || boss.includes(q);
}

// ── 탭 카운트 업데이트 ────────────────────────────────
function updateTabCount() {
  let data = getFilteredData();
  const vCount = data.filter(r => r.verified).length;
  const uCount = data.filter(r => !r.verified).length;
  const countEl = document.getElementById('ta-tab-count');
  if (countEl) {
    const active = activeTab === 'ta-verified' ? vCount : uCount;
    countEl.textContent = `${active}개`;
  }
}

function getFilteredData() {
  let data = allRuns.slice();
  if (currentCategory === '보스') {
    const bossList = CATEGORY_MAP['보스'].map(b => b.value).filter(Boolean);
    data = data.filter(r => bossList.includes(r.boss));
  } else if (currentCategory === '그림자 이정표') {
    const allMilestone = CATEGORY_MAP['그림자 이정표'].map(b => b.value).filter(Boolean);
    data = data.filter(r => allMilestone.includes(r.boss));
    if (currentGroup) {
      const groupItems = CATEGORY_MAP['그림자 이정표'].filter(b => b.group === currentGroup).map(b => b.value);
      data = data.filter(r => groupItems.includes(r.boss));
    }
  }
  if (currentBoss) data = data.filter(r => r.boss === currentBoss);
  if (searchQuery)  data = data.filter(r => matchesSearch(r));
  if (sortMode === 'time') {
    data.sort((a, b) => parseTime(a.clear_time) - parseTime(b.clear_time));
  } else {
    data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  return data;
}

// ── 빈 상태 ───────────────────────────────────────────
function emptyHTML(msg = '기록이 없어요') {
  return `<div class="ta-empty">
    <div class="ta-empty-icon">🏁</div>
    <div class="ta-empty-msg">${msg}</div>
  </div>`;
}

// ── 카드 렌더 ─────────────────────────────────────────
function renderCard(run, rank, isFirst) {
  const video = run.video_url
    ? `<a class="ta-video-link" href="${run.video_url}" target="_blank" rel="noopener">▶ 영상</a>`
    : `<span class="ta-novideo">영상 없음</span>`;

  const rankBadge = isFirst
    ? `<span class="ta-rank gold">👑 1위</span>`
    : `<span class="ta-rank">${rank}위</span>`;

  const bossBadge = `<span class="ta-boss-badge boss-${run.boss}">${run.boss || '-'}</span>`;

  return `
    <div class="ta-record ${isFirst ? 'is-first' : ''}" data-id="${run.id}">
      <div class="ta-record-top">
        <div class="ta-record-left">
          ${rankBadge}
          <span class="ta-time">${run.clear_time || '-'}</span>
          ${bossBadge}
        </div>
        <div class="ta-record-right">
          ${video}
          <span class="ta-date">${formatDate(run.created_at)}</span>
        </div>
      </div>
      <div class="ta-party">${renderParty(run.party)}</div>
      ${run.title ? `<div class="ta-record-title">${run.title}</div>` : ''}
    </div>
  `;
}

// ── 더보기 버튼 ───────────────────────────────────────
function moreButton(tab, total, shown) {
  if (shown >= total) return '';
  return `<button class="ta-more-btn" onclick="loadMore('${tab}')">
    더보기 (${shown}/${total})
  </button>`;
}
window.loadMore = function(tab) {
  if (tab === 'ta-verified') verifiedPage++;
  else unverifiedPage++;
  renderRuns();
};

// ── 메인 렌더 ─────────────────────────────────────────
function renderRuns() {
  const data = getFilteredData();
  const verified   = data.filter(r => r.verified);
  const unverified = data.filter(r => !r.verified);

  const verifiedEl   = document.getElementById('ta-verified');
  const unverifiedEl = document.getElementById('ta-unverified');

  // 인증 목록 — 보스별 1위 추적
  const bossFirstSet = new Set();

  function renderList(list, el, page) {
    if (list.length === 0) {
      el.innerHTML = emptyHTML(searchQuery ? `"${searchQuery}" 검색 결과가 없어요` : '아직 기록이 없어요. 첫 번째 기록을 제출해보세요!');
      return;
    }
    const shown = page * PAGE_SIZE;
    const slice = list.slice(0, shown);
    let html = '';
    slice.forEach((run, idx) => {
      const rank = idx + 1;
      // 전체 탭이면 전체 1위, 보스 필터면 해당 보스 1위
      const isFirst = rank === 1;
      html += renderCard(run, rank, isFirst);
    });
    html += moreButton(el.id === 'ta-verified' ? 'ta-verified' : 'ta-unverified', list.length, shown);
    el.innerHTML = html;

    // 카드 클릭
    el.querySelectorAll('.ta-record[data-id]').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
        window.location.href = `./run.html?id=${card.dataset.id}`;
      });
    });
  }

  renderList(verified,   verifiedEl,   verifiedPage);
  renderList(unverified, unverifiedEl, unverifiedPage);
  updateTabCount();
}

// ── 데이터 로드 ───────────────────────────────────────
async function loadRuns() {
  const { data, error } = await supabase
    .from('timeattack_runs')
    .select('id,title,boss,clear_time,party,video_url,verified,created_at')
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  allRuns = data;
  renderRuns();
}

// ── 토스트 ────────────────────────────────────────────
function showToast(msg) {
  const el = document.getElementById('ta-toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 400);
  }, 2800);
}

// ── 이벤트 ────────────────────────────────────────────
// 카테고리 탭
function renderDetailTabs(category, group) {
  const wrap = document.getElementById('detail-filter-wrap');
  const tabsEl = document.getElementById('detail-tabs');
  if (!category || !CATEGORY_MAP[category]) {
    wrap.style.display = 'none';
    tabsEl.innerHTML = '';
    return;
  }
  // 보스: 전체 목록 / 그림자 이정표: 해당 그룹만
  let items = CATEGORY_MAP[category];
  if (group) items = items.filter(item => !item.group || item.group === group);

  tabsEl.innerHTML = '';
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'ta-boss-tab' + (item.value === currentBoss ? ' active' : '');
    btn.dataset.detail = item.value;
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      tabsEl.querySelectorAll('.ta-boss-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentBoss = item.value;
      verifiedPage = 1; unverifiedPage = 1;
      renderRuns();
    });
    tabsEl.appendChild(btn);
  });
  wrap.style.display = 'flex';
}

// 일반 카테고리 탭 (전체, 보스)
document.querySelectorAll('#category-tabs .ta-boss-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    // 모든 탭 active 해제
    document.querySelectorAll('#category-tabs .ta-boss-tab, #milestone-tabs .ta-boss-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.category;
    currentGroup = '';
    currentBoss = '';
    verifiedPage = 1; unverifiedPage = 1;
    renderDetailTabs(currentCategory, '');
    renderRuns();
  });
});

// 그림자 이정표 그룹 탭 (대지에게 버림받은 존재, 무기물)
document.querySelectorAll('#milestone-tabs .ta-boss-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#category-tabs .ta-boss-tab, #milestone-tabs .ta-boss-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.category;
    currentGroup = btn.dataset.group;
    currentBoss = '';
    verifiedPage = 1; unverifiedPage = 1;
    renderDetailTabs(currentCategory, currentGroup);
    renderRuns();
  });
});

// 정렬
document.getElementById('btn-sort')?.addEventListener('click', () => {
  const btn = document.getElementById('btn-sort');
  if (sortMode === 'time') {
    sortMode = 'latest';
    btn.textContent = '🕐 최신순';
    btn.dataset.mode = 'latest';
  } else {
    sortMode = 'time';
    btn.textContent = '⏱ 기록순';
    btn.dataset.mode = 'time';
  }
  verifiedPage = 1; unverifiedPage = 1;
  renderRuns();
});

// 검색
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
searchInput?.addEventListener('input', () => {
  searchQuery = searchInput.value.trim();
  searchClear.classList.toggle('hidden', !searchQuery);
  verifiedPage = 1; unverifiedPage = 1;
  renderRuns();
});
searchClear?.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  searchClear.classList.add('hidden');
  verifiedPage = 1; unverifiedPage = 1;
  renderRuns();
});

// 제출 버튼
document.getElementById('btn-open-form')?.addEventListener('click', () => {
  window.location.href = './submit.html';
});

// 토스트 (제출 후 돌아왔을 때)
const toast = localStorage.getItem('submit_toast');
if (toast) {
  localStorage.removeItem('submit_toast');
  setTimeout(() => showToast(toast), 300);
}

loadRuns();
