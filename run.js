import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
import { EQUIPMENT_MAP } from './equipment_db.js'

const CHAR_DATA = {
  "관리자(남)":    { s: "6성 캐릭터/관리자(남).png",    c: "#ff7100" },
  "관리자(여)":    { s: "6성 캐릭터/관리자(여).png",    c: "#ff7100" },
  "라스트 라이트": { s: "6성 캐릭터/라스트 라이트.png", c: "#ff7100" },
  "레바테인":      { s: "6성 캐릭터/레바테인.png",      c: "#ff7100" },
  "아델리아":      { s: "6성 캐릭터/아델리아.png",      c: "#ff7100" },
  "포그라니치니크":{ s: "6성 캐릭터/포그라니치니크.png",c: "#ff7100" },
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

const params = new URLSearchParams(window.location.search);
const id = params.get('id');

function esc(s) {
  return (s ?? '').toString()
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'","&#39;");
}

// 파티 카드 렌더
function renderPartyCards(partyStr) {
  if (!partyStr) return '<span style="color:#666">-</span>';
  return partyStr.split('/').map(s => s.trim()).filter(Boolean).map(name => {
    const d = CHAR_DATA[name];
    if (d) return `<span class="char-card" style="--rank-color:${d.c}" title="${name}">
      <img src="${d.s}" alt="${name}" />
      <span class="card-name">${name}</span>
    </span>`;
    return `<span class="char-icon-text">${esc(name)}</span>`;
  }).join('');
}

// 장비 섹션 렌더
// equipment: JSON 문자열 또는 배열 [{glove,armor,part1,part2}, ...]
function buildEquipHTML(equipRaw) {
  if (!equipRaw) return '';
  let equip;
  try {
    equip = typeof equipRaw === 'string' ? JSON.parse(equipRaw) : equipRaw;
  } catch(e) { return ''; }
  if (!Array.isArray(equip)) return '';

  const hasAny = equip.some(e => e && Object.values(e).some(v => v));
  if (!hasAny) return '';

  const slotKeys   = ['glove', 'armor', 'part1', 'part2'];
  const slotLabels = ['글러브', '방어구', '부품 1', '부품 2'];

  // 헤더: 빈 라벨칸 + 4슬롯 이름
  const headerCols = slotLabels.map(l =>
    `<div class="eq-slot-title">${l}</div>`
  ).join('');

  // 파티별 행
  const rows = equip.map((memberEquip, idx) => {
    const cells = slotKeys.map(key => {
      const itemName = (memberEquip && memberEquip[key]) ? memberEquip[key] : '';
      if (!itemName) {
        return `<div class="eq-cell eq-empty"><span>-</span></div>`;
      }
      const imgPath = EQUIPMENT_MAP[itemName]?.img || '';
      const imgTag  = imgPath
        ? `<img class="eq-img" src="/${imgPath}" alt="${esc(itemName)}" onerror="this.style.display='none'">`
        : '';
      return `<div class="eq-cell">${imgTag}<span class="eq-name">${esc(itemName)}</span></div>`;
    }).join('');

    return `<div class="eq-row">
      <div class="eq-member-label">파티 ${idx + 1}</div>
      ${cells}
    </div>`;
  }).join('');

  return `
    <div class="equip-detail-section">
      <b>장비</b>
      <div class="eq-header-row">
        <div class="eq-header-spacer"></div>
        ${headerCols}
      </div>
      <div class="eq-table">${rows}</div>
    </div>
  `;
}

async function loadDetail() {
  const detailEl = document.getElementById('detail');
  if (!id) { detailEl.innerHTML = '잘못된 접근입니다.'; return; }

  const { data, error } = await supabase
    .from('timeattack_runs')
    .select('title,boss,clear_time,party,equipment,video_url,notes,verified,created_at')
    .eq('id', id).single();

  if (error) { console.error(error); detailEl.innerHTML = '기록을 불러오지 못했습니다.'; return; }

  let current  = { ...data };
  const original = { ...data };

  function renderViewMode() {
    const video = current.video_url
      ? `<p><a class="video" href="${esc(current.video_url)}" target="_blank" rel="noopener">영상 보기</a></p>`
      : `<p class="novideo">영상 없음</p>`;

    const equipHTML = buildEquipHTML(current.equipment);

    detailEl.innerHTML = `
      <div class="ta-detail-actions">
        <button id="btn-edit" class="ta-action-btn edit">수정</button>
        <button id="btn-delete" class="ta-action-btn delete">삭제</button>
      </div>
      <div class="row">
        <b class="time">${esc(current.clear_time)}</b>
        <span class="boss">${esc(current.boss)}</span>
        <span class="${current.verified ? 'video' : 'novideo'}">${current.verified ? '✅ 인증' : '📝 미인증'}</span>
      </div>
      <div class="title" style="margin-top:10px; font-size:16px; color:#eee;">${esc(current.title)}</div>
      <div style="margin-top:12px;">
        <b>파티</b>
        <div class="party-detail">${renderPartyCards(current.party)}</div>
      </div>
      ${equipHTML}
      <div style="margin-top:16px;"><b>특이사항</b><br><span style="color:#aaa">${esc(current.notes) || '-'}</span></div>
      <div style="margin-top:10px;">${video}</div>
      <div style="margin-top:10px; color:#666; font-size:12px;">등록: ${esc(current.created_at)}</div>
    `;

    document.getElementById('btn-edit').addEventListener('click', () => renderEditMode());
    document.getElementById('btn-delete').addEventListener('click', async () => {
      const pw = prompt('삭제 비밀번호를 입력해주세요');
      if (!pw) return;
      if (!confirm('정말 삭제하겠습니까? 삭제하면 되돌릴 수 없습니다.')) return;
      const { data: ok, error } = await supabase.rpc('delete_run_by_password', {
        p_run_id: Number(id), p_password: pw
      });
      if (error) { alert('삭제 실패(서버 오류): ' + error.message); return; }
      if (!ok)   { alert('비밀번호가 틀렸거나, 이미 삭제된 기록이야.'); return; }
      alert('삭제 완료!');
      location.href = './timeattack.html';
    });
  }

  function renderEditMode() {
    detailEl.innerHTML = `
      <div class="ta-detail-actions">
        <button id="btn-save" class="ta-action-btn edit">저장</button>
        <button id="btn-cancel" class="ta-action-btn delete">취소</button>
      </div>
      <div style="margin-top:10px;">
        <label style="display:block;color:#bbb;font-size:13px;">제목</label>
        <input id="e-title" value="${esc(current.title)}" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #2b2b2b;background:#0f0f0f;color:#eee;">
      </div>
      <div style="margin-top:10px;">
        <label style="display:block;color:#bbb;font-size:13px;">보스</label>
        <input id="e-boss" value="${esc(current.boss)}" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #2b2b2b;background:#0f0f0f;color:#eee;">
      </div>
      <div style="margin-top:10px;">
        <label style="display:block;color:#bbb;font-size:13px;">클리어 시간</label>
        <input id="e-time" value="${esc(current.clear_time)}" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #2b2b2b;background:#0f0f0f;color:#eee;">
      </div>
      <div style="margin-top:10px;">
        <label style="display:block;color:#bbb;font-size:13px;">파티</label>
        <input id="e-party" value="${esc(current.party)}" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #2b2b2b;background:#0f0f0f;color:#eee;">
      </div>
      <div style="margin-top:10px;">
        <label style="display:block;color:#bbb;font-size:13px;">영상 링크(선택)</label>
        <input id="e-video" value="${esc(current.video_url || '')}" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #2b2b2b;background:#0f0f0f;color:#eee;">
      </div>
      <div style="margin-top:10px;">
        <label style="display:block;color:#bbb;font-size:13px;">특이사항(선택)</label>
        <textarea id="e-notes" rows="3" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #2b2b2b;background:#0f0f0f;color:#eee;">${esc(current.notes || '')}</textarea>
      </div>
    `;

    document.getElementById('btn-cancel').addEventListener('click', () => {
      current = { ...original };
      renderViewMode();
    });

    document.getElementById('btn-save').addEventListener('click', async () => {
      const newTitle = document.getElementById('e-title').value.trim();
      const newBoss  = document.getElementById('e-boss').value.trim();
      const newTime  = document.getElementById('e-time').value.trim();
      const newParty = document.getElementById('e-party').value.trim();
      const newVideo = document.getElementById('e-video').value.trim();
      const newNotes = document.getElementById('e-notes').value.trim();
      if (!newTitle || !newBoss || !newTime || !newParty) {
        alert('제목/보스/시간/파티는 필수야.'); return;
      }
      const pw = prompt('수정 비밀번호를 입력해줘');
      if (!pw) return;
      const { data: ok, error } = await supabase.rpc('update_run_by_password', {
        p_run_id: Number(id), p_password: pw,
        p_title: newTitle, p_boss: newBoss, p_clear_time: newTime,
        p_party: newParty, p_video_url: newVideo, p_notes: newNotes
      });
      if (error) { alert('수정 실패(서버 오류): ' + error.message); return; }
      if (!ok)   { alert('비밀번호가 틀렸거나, 기록이 없어.'); return; }
      current = { ...current,
        title: newTitle, boss: newBoss, clear_time: newTime,
        party: newParty, video_url: newVideo, notes: newNotes
      };
      alert('수정 완료!');
      renderViewMode();
    });
  }

  renderViewMode();
}

loadDetail();
