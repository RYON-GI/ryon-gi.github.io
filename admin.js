import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabase = createClient(
  'https://ocdqyaiystqjjalenent.supabase.co',
  'sb_publishable_A3e_7cRzFpdv9FAq0hEJCQ_ChyKV6at'
);

let adminToken = "";

const statusEl = document.getElementById('status');
const listEl = document.getElementById('list');

document.getElementById('btn-token').addEventListener('click', () => {
  const t = prompt('관리자 토큰 입력');
  if (!t) return;
  adminToken = t;
  statusEl.textContent = '토큰 입력됨';
});

async function loadRuns() {
  const { data, error } = await supabase
    .from('timeattack_runs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    statusEl.textContent = error.message;
    return;
  }

  listEl.innerHTML = '';

  data.forEach(run => {
    const div = document.createElement('div');

    div.innerHTML = `
      <div>
        #${run.id} — ${run.title}
        <button data-id="${run.id}">삭제</button>
      </div>
    `;

    div.querySelector('button').addEventListener('click', async () => {
      if (!adminToken) {
        alert('토큰 입력 먼저');
        return;
      }

      if (!confirm('삭제할까?')) return;

      const res = await fetch('https://ocdqyaiystqjjalenent.supabase.co/functions/v1/swift-action', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    run_id: Number(run.id),
    admin_token: adminToken.trim()
  })
});

      const json = await res.json();

      if (!res.ok || !json.ok) {
  if (json.reason === 'locked' || json.reason === 'locked_now') {
    alert(`잠금 상태입니다.\n잠금 해제 시각: ${json.locked_until || '알 수 없음'}`);
  } else if (json.reason === 'banned') {
    alert('이 IP는 차단되었습니다.');
  } else if (json.reason === 'bad_token') {
    alert(`토큰이 틀렸습니다. 실패 횟수: ${json.fail_count ?? '?'}`);
  } else {
    alert(json.message || json.error || json.reason || '삭제 실패');
  }
  return;
}


      alert('삭제 완료');
      loadRuns();
    });

    listEl.appendChild(div);
  });
}

loadRuns();