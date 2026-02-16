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
}

window.Endfield = window.Endfield || {};
Endfield.initCollectionUI = initCollectionUI;
