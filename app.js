// app.js (non-module) - file:// 로도 실행 가능하도록 전역 스크립트 방식

(function () {
  window.Endfield = window.Endfield || {};

  const STATE = {
    isRunning: false,
    worker: null,

    selectedWeapons: new Set(),
    ownedWeapons: new Set(),

    selectedRegion: null,
    regionBases: new Set(),
    regionExtra: null,

    currentMainTab: 'guide',
    currentSubTabs: { farming: 'region', search: 'warehouse' },

    lastRecognizedOptions: ['-', '-', '-'],
    lastProcessedOptions: '',
    lastDetectedResults: [],

    video: document.createElement('video'),
    viewCanvas: document.getElementById('view-canvas'),
    viewCtx: document.getElementById('view-canvas')?.getContext('2d') ?? null,
    hiddenCanvas: document.createElement('canvas'),
    hiddenCtx: null,
  };
  STATE.hiddenCtx = STATE.hiddenCanvas.getContext('2d');

  // ---- 탭 ----
  function switchTab(tabId) {
    STATE.currentMainTab = tabId;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === `tab-${tabId}`));
    document.querySelectorAll('.content-area').forEach(a => a.classList.toggle('active', a.id === `area-${tabId}`));
  }

  function switchSubTab(mainId, subId) {
    STATE.currentSubTabs[mainId] = subId;
    const parent = document.getElementById(`area-${mainId}`);
    if (!parent) return;
    parent.querySelectorAll('.sub-tab').forEach(t => t.classList.toggle('active', t.id === `sub-tab-${subId}`));

    if (mainId === 'farming') {
      document.getElementById('sub-content-region').style.display = subId === 'region' ? 'block' : 'none';
      document.getElementById('sub-content-weapon').style.display = subId === 'weapon' ? 'block' : 'none';
    }
  }

  // ---- 콜백들(초기화 후 연결) ----
  let updateRegionResultsFn = () => {};
  let updateScannerMatchFn = () => {};
  let updateFarmingResultsFn = () => {};
  let selectRegionFn = null;

  function toggleWeaponStatus(name) {
    if (STATE.ownedWeapons.has(name)) STATE.ownedWeapons.delete(name);
    else STATE.ownedWeapons.add(name);

    localStorage.setItem('endfield_owned_weapons', JSON.stringify(Array.from(STATE.ownedWeapons)));

    const isOwned = STATE.ownedWeapons.has(name);
    document.querySelectorAll(`.weapon-card[data-name="${name}"]`).forEach(card => {
      if (isOwned) card.classList.add('owned');
      else card.classList.remove('owned');
    });

    updateFarmingResultsFn();
    window.Endfield?.applyWeaponFilters?.();
    updateRegionResultsFn();
    window.Endfield?.applyRegionFilters?.();
    updateScannerMatchFn();
  }

  function stopSharing() {
    STATE.isRunning = false;
    if (STATE.video.srcObject) STATE.video.srcObject.getTracks().forEach(t => t.stop());

    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';

    const badge = document.getElementById('screen-mode-badge');
    badge.textContent = '대기 중';
    badge.style.background = '#555';
  }

  async function startSharing() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      STATE.video.srcObject = stream;

      STATE.video.onloadedmetadata = () => {
        STATE.video.play();
        STATE.isRunning = true;

        Endfield.recognizeLoop({
          CONFIGS: window.CONFIGS,
          STATE,
          normalize: window.normalize,
          updateScannerMatch: updateScannerMatchFn,
        });

        document.getElementById('start-btn').style.display = 'none';
        document.getElementById('stop-btn').style.display = 'block';
      };

      stream.getVideoTracks()[0].onended = stopSharing;
    } catch (e) {
      alert('취소되었습니다.');
    }
  }

  async function init() {
    // 1) 보유 현황(저장값 로드 포함)
    Endfield.initCollectionUI({
      WEAPONS_6: window.WEAPONS_6,
      WEAPONS_5: window.WEAPONS_5,
      STATE,
      toggleWeaponStatus,
    });

    // 2) 추천 파밍지
    updateFarmingResultsFn = () => Endfield.updateFarmingResults({ PLACES: window.PLACES, STATE });
    Endfield.initFarmingUI({
      WEAPONS_6: window.WEAPONS_6,
      WEAPONS_5: window.WEAPONS_5,
      STATE,
      updateFarmingResults: updateFarmingResultsFn,
    });
    updateFarmingResultsFn();

    // 3) 지역별 파밍지
    const updateRegionResults = Endfield.updateRegionResultsFactory({
      STATE,
      WEAPONS_6: window.WEAPONS_6,
      WEAPONS_5: window.WEAPONS_5,
      PRIMARY_STATS: window.PRIMARY_STATS,
    });
    updateRegionResultsFn = () => updateRegionResults();

    const renderRegionSummaryFn = (place) => Endfield.renderRegionSummary({
      place,
      PRIMARY_STATS: window.PRIMARY_STATS,
      WEAPONS_6: window.WEAPONS_6,
      WEAPONS_5: window.WEAPONS_5,
      STATE,
    });

    const selectRegion = Endfield.selectRegionFactory({
      STATE,
      PRIMARY_STATS: window.PRIMARY_STATS,
      EXTRA_STATS: window.EXTRA_STATS,
      renderRegionSummaryFn,
      updateRegionResultsFn,
    });

    selectRegionFn = selectRegion;

    Endfield.initRegionUI({ PLACES: window.PLACES, selectRegion });
    updateRegionResultsFn();

    // 5) 스캐너 매칭
    const updateScannerMatch = Endfield.updateScannerMatchFactory({
      WEAPONS_6: window.WEAPONS_6,
      WEAPONS_5: window.WEAPONS_5,
      STATE,
      toggleWeaponStatus,
    });
    updateScannerMatchFn = (opts) => updateScannerMatch(opts);

    // 버튼 UI 초기화/바인딩(5성 표시 / 2개 일치 포함)
    Endfield.initScanner({
      STATE,
      updateScannerMatch: () => updateScannerMatchFn(),
      stopSharing: () => stopSharing(),
    });

    document.getElementById('start-btn').onclick = startSharing;
    document.getElementById('stop-btn').onclick = stopSharing;

    // 6) 워커 로딩
    try {
      await Endfield.createWorkerAndStart({ STATE });
    } catch (e) {
      console.error(e);
    }
  }

  // HTML onclick에서 호출
  window.switchTab = switchTab;
  window.switchSubTab = switchSubTab;
  window.toggleWeaponStatus = toggleWeaponStatus;
  window.resetWeaponSelection = () => Endfield.resetWeaponSelectionImpl({ STATE }, updateFarmingResultsFn);
  window.resetRegionFilters = () => Endfield.resetRegionFiltersImpl({ STATE }, selectRegionFn);
  // 가이드 사이드탭 전환(전역)
  window.switchGuide = function(name, el) {
    document.querySelectorAll('.guide-side-tab')
      .forEach(e => e.classList.remove('active'));
    if (el) el.classList.add('active');
    document.querySelectorAll('.guide-content')
      .forEach(e => e.classList.remove('active'));
    const target = document.getElementById('guide-' + name);
    if (target) target.classList.add('active');
  };

  // 문의하기(전역)
  window.openInquiry = function() {
    window.open('https://open.kakao.com/o/sgkYrigi', '_blank');
  };


  init();
})();