function initCollectionUI({ WEAPONS_6, WEAPONS_5, STATE, toggleWeaponStatus }) {
  // 1) 저장된 데이터 불러오기
  const saved = localStorage.getItem('endfield_owned_weapons');
  if (saved) {
    try { STATE.ownedWeapons = new Set(JSON.parse(saved)); } catch {}
  }
  // 저장된 보유 현황 반영(다른 탭 UI도 즉시 갱신)
  window.Endfield?.applyWeaponFilters?.();
  window.Endfield?.updateRegionResults?.();
  window.Endfield?.updateScannerMatch?.();

  const g6 = document.getElementById('collection-6star');
  const g5 = document.getElementById('collection-5star');
  if (!g6 || !g5) return;

  g6.innerHTML = '';
  g5.innerHTML = '';

  const createCollectionCard = (w, path, starPrefix) => {
    const div = document.createElement('div');
    div.className = 'weapon-card';
    div.dataset.name = w.name;
    if (STATE.ownedWeapons.has(w.name)) div.classList.add('owned');
    div.onclick = () => toggleWeaponStatus(w.name);

    div.innerHTML = `
      <div class="weapon-img-container">
        <img src="배경.png" class="layer bg-layer">
        <img src="${path}/${w.name.replace(/:/g,'')}.png" class="layer weapon-layer" onerror="this.src='https://via.placeholder.com/240?text=No+Img'">
        <img src="${path}/${starPrefix} 하단.png" class="layer bottom-layer" onerror="this.src='https://via.placeholder.com/240x80?text=No+Bottom'">
      </div>
      <div>${w.name}</div>
    `;
    return div;
  };

  WEAPONS_6.forEach(w => g6.appendChild(createCollectionCard(w, '6성 무기', '6성')));
  WEAPONS_5.forEach(w => g5.appendChild(createCollectionCard(w, '5성 무기', '5성')));

  // ---- JSON 저장/불러오기 버튼 ----
  const exportBtn = document.getElementById('btn-export-collection');
  const importBtn = document.getElementById('btn-import-collection');
  const importFile = document.getElementById('import-collection-file');

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const data = {
        version: 1,
        owned: Array.from(STATE.ownedWeapons),
        savedAt: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `endfield_collection_${new Date().toLocaleDateString('ko-KR').replace(/\. /g,'-').replace('.','')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!data.owned || !Array.isArray(data.owned)) throw new Error('잘못된 파일');

          // 기존 owned 초기화 후 불러오기
          STATE.ownedWeapons.clear();
          data.owned.forEach(name => STATE.ownedWeapons.add(name));
          localStorage.setItem('endfield_owned_weapons', JSON.stringify(Array.from(STATE.ownedWeapons)));

          // 카드 UI 갱신
          document.querySelectorAll('.weapon-card').forEach(card => {
            const name = card.dataset.name;
            if (name) card.classList.toggle('owned', STATE.ownedWeapons.has(name));
          });

          // 연동 탭 갱신
          window.Endfield?.applyWeaponFilters?.();
          window.Endfield?.updateRegionResults?.();
          window.Endfield?.updateScannerMatch?.();

          const count = STATE.ownedWeapons.size;
          showCollectionToast(`✅ ${count}개 무기 보유 현황을 불러왔어요!`);
        } catch {
          showCollectionToast('❌ 파일을 읽을 수 없어요. 올바른 JSON 파일인지 확인해주세요.', true);
        }
        importFile.value = '';
      };
      reader.readAsText(file);
    });
  }
}

function showCollectionToast(msg, isError = false) {
  let toast = document.getElementById('collection-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'collection-toast';
    toast.style.cssText = `
      position:fixed; bottom:30px; left:50%; transform:translateX(-50%) translateY(20px);
      padding:11px 22px; border-radius:24px; font-size:13px; font-weight:700;
      font-family:'Noto Sans KR',sans-serif; box-shadow:0 4px 20px rgba(0,0,0,0.5);
      opacity:0; transition:all 0.35s cubic-bezier(0.34,1.56,0.64,1);
      pointer-events:none; z-index:9999; white-space:nowrap;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = isError ? '#7f1d1d' : 'var(--green)';
  toast.style.color = isError ? '#fff' : '#000';
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
  }, 3000);
}

window.Endfield = window.Endfield || {};
Endfield.initCollectionUI = initCollectionUI;
