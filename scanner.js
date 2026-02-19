function initScanner({
  CONFIGS,
  STATE,
  normalize,
  updateScannerMatch,
  stopSharing,
}) {
  // 버튼 클릭 시 스캐너 화면 즉시 갱신(로컬 저장)
  if (typeof STATE.scannerShow5 !== 'boolean') {
    const v = localStorage.getItem('endfield_scanner_show5');
    STATE.scannerShow5 = (v === '1'); // 표시=1
  }
  if (typeof STATE.scannerInclude2 !== 'boolean') {
    const v = localStorage.getItem('endfield_scanner_include2');
    STATE.scannerInclude2 = (v === '1'); // 표시=1
  }

  const btn5 = document.getElementById('btn-scan-5');
  const btn2 = document.getElementById('btn-scan-2');

  const syncBtns = () => {
    // 빨강=숨김, 초록=표시
    if (btn5) {
      btn5.textContent = STATE.scannerShow5 ? '5성 표시' : '5성 숨김';
      btn5.style.background = STATE.scannerShow5 ? 'var(--green)' : 'var(--red)';
    }
    if (btn2) {
      btn2.textContent = STATE.scannerInclude2 ? '2개 일치 표시' : '2개 일치 숨김';
      btn2.style.background = STATE.scannerInclude2 ? 'var(--green)' : 'var(--red)';
    }
  };
  syncBtns();

  if (btn5) btn5.onclick = () => {
    STATE.scannerShow5 = !STATE.scannerShow5;
    localStorage.setItem('endfield_scanner_show5', STATE.scannerShow5 ? '1' : '0');
    syncBtns();
    updateScannerMatch();
  };
  if (btn2) btn2.onclick = () => {
    STATE.scannerInclude2 = !STATE.scannerInclude2;
    localStorage.setItem('endfield_scanner_include2', STATE.scannerInclude2 ? '1' : '0');
    syncBtns();
    updateScannerMatch();
  };


  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');

   // 스캐너 UI가 없는 페이지면 초기화 스킵
   if (!startBtn || !stopBtn) return;

  startBtn.onclick = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      STATE.video.srcObject = stream;
      STATE.video.onloadedmetadata = () => {
        STATE.video.play();
        STATE.isRunning = true;
        recognizeLoop({ CONFIGS, STATE, normalize, updateScannerMatch });
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
      };
      stream.getVideoTracks()[0].onended = stopSharing;
    } catch (e) {
      alert('취소되었습니다.');
    }
  };

  stopBtn.onclick = stopSharing;

  function stopSharing() {
    stopSharingImpl({ STATE, stopSharingFn: stopSharing });
  }

  function stopSharingImpl({ STATE, stopSharingFn }) {
    STATE.isRunning = false;
    if (STATE.video.srcObject) STATE.video.srcObject.getTracks().forEach(t => t.stop());
    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';
    const badge = document.getElementById('screen-mode-badge');
    badge.textContent = '대기 중';
    badge.style.background = '#555';
  }
}

async function createWorkerAndStart({ STATE }) {
  if (!window.Tesseract) return;

  STATE.worker = await Tesseract.createWorker('kor');
  await STATE.worker.setParameters({ tessedit_pageseg_mode: '7' });

  const startBtn = document.getElementById('start-btn');
  startBtn.disabled = false;
  startBtn.textContent = '화면 공유 시작';
}

function recognizeLoopFactory(deps) {
  return function recognizeLoopRunner() {
    return recognizeLoop(deps);
  };
}

function pickPresetKey(vw, vh) {
  // 창모드 캡처 해상도는 거의 고정이므로
  // 축별로 작은 오차만 허용해서 정확히 매칭

  const presets = [
    { key: "P_1920_1080", vw: 1924, vh: 1126 },
    { key: "P_2560_1440", vw: 2564, vh: 1486 },
    { key: "P_2560_1600", vw: 2564, vh: 1646 },
    { key: "P_3440_1440", vw: 3444, vh: 1486 },
  ];

  const TOL_W = 8; // 필요하면 6~12 사이 조절
  const TOL_H = 8;

  for (const p of presets) {
    if (
      Math.abs(vw - p.vw) <= TOL_W &&
      Math.abs(vh - p.vh) <= TOL_H
    ) {
      return p.key;
    }
  }

  // 정확히 창모드가 아니면 무조건 전체화면(BASE)
  return "BASE";
}

// 내부 루프 (requestAnimationFrame 기반)
async function recognizeLoop({ CONFIGS, STATE, normalize, updateScannerMatch }) {
  if (!STATE.isRunning || STATE.currentMainTab === 'guide') {
    requestAnimationFrame(() => recognizeLoop({ CONFIGS, STATE, normalize, updateScannerMatch }));
    return;
  }

  const video = STATE.video;
  if (video.readyState >= 2) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const ratio = vw / vh;
    let modeKey;
     if (ratio >= 2.2) modeKey = 'WIDE';      // 21:9
     else if (ratio >= 1.7) modeKey = 'DEFAULT'; // 16:9
     else modeKey = 'TALL';                   // 16:10

const badge = document.getElementById('screen-mode-badge');

     badge.style.background =
       modeKey === 'WIDE' ? '#a335ee' :
       modeKey === 'TALL' ? '#1f7ae0' :
       '#28a745';

    const presetKey = pickPresetKey(vw, vh);
    const isWindowMode = (presetKey !== "BASE");

badge.textContent =
  (modeKey === 'WIDE' ? 'WIDE 모드' :
   modeKey === 'TALL' ? '16:10 모드' :
   '표준 모드')
  + (isWindowMode ? ' (창모드)' : '');

let config = CONFIGS?.[modeKey]?.[presetKey]?.[STATE.currentSubTabs.search];

// 폴백: presetKey가 없거나 아직 ROI 안 넣었으면 BASE 사용
if (!config) config = CONFIGS?.[modeKey]?.BASE?.[STATE.currentSubTabs.search];

// 최후 폴백(예전 구조 호환)
if (!config) config = CONFIGS?.[modeKey]?.[STATE.currentSubTabs.search];

    const sx = vw * config.roi.x, sy = vh * config.roi.y, sw = vw * config.roi.w, sh = vh * config.roi.h;

    // 시각화 캔버스
    STATE.viewCanvas.width = sw;
    STATE.viewCanvas.height = sh;
    STATE.viewCtx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

    //true false
    if (false) {
    // ===== ROI DEBUG (반투명 박스) =====
    const colors = [
      'rgba(0,255,0,0.25)',
      'rgba(255,0,0,0.25)',
      'rgba(0,255,255,0.25)'
    ];

    for (let i = 0; i < 3; i++) {
      const box = config.boxes[i];

      const left = box.x * sw;
      const top = box.y * sh;
      const width = box.w * sw;
      const height = box.h * sh;

      STATE.viewCtx.fillStyle = colors[i];
      STATE.viewCtx.fillRect(left, top, width, height);

      STATE.viewCtx.strokeStyle = colors[i].replace("0.25", "0.9");
      STATE.viewCtx.lineWidth = 2;
      STATE.viewCtx.strokeRect(left, top, width, height);
    }
    }

    // OCR용 전처리 캔버스
    STATE.hiddenCanvas.width = sw * 2;
    STATE.hiddenCanvas.height = sh * 2;
    STATE.hiddenCtx.filter = 'contrast(175%) grayscale(100%) brightness(105%)';
    STATE.hiddenCtx.drawImage(video, sx, sy, sw, sh, 0, 0, sw * 2, sh * 2);

    const currentOptions = [];
    for (let i = 0; i < 3; i++) {
      const box = config.boxes[i];
      const res = await STATE.worker.recognize(STATE.hiddenCanvas, {
        rectangle: {
          left: box.x * STATE.hiddenCanvas.width,
          top: box.y * STATE.hiddenCanvas.height,
          width: box.w * STATE.hiddenCanvas.width,
          height: box.h * STATE.hiddenCanvas.height,
        }
      });

      const rawText = res.data.text.trim();
      const norm = normalize(rawText);

      if (norm && /[가-힣]{1,}/.test(norm)) {
        STATE.lastRecognizedOptions[i] = norm;
        const el = document.getElementById(`opt-${i+1}`);
        if (el) el.textContent = norm;
      }
      currentOptions.push(STATE.lastRecognizedOptions[i]);
    }

    const currentOptionsStr = currentOptions.join(',');
    if (STATE.lastProcessedOptions !== currentOptionsStr) {
      updateScannerMatch(currentOptions);
      STATE.lastProcessedOptions = currentOptionsStr;
    }
  }

  requestAnimationFrame(() => recognizeLoop({ CONFIGS, STATE, normalize, updateScannerMatch }));
}

function updateScannerMatchFactory(deps) {
  const { WEAPONS_6, WEAPONS_5, STATE, toggleWeaponStatus } = deps;

  return function updateScannerMatch(opts) {
    if (opts && Array.isArray(opts)) {
      STATE.lastDetectedResults = opts;
    } else if (!opts && STATE.lastDetectedResults.length === 0) {
      return;
    }

    const currentOpts = opts || STATE.lastDetectedResults;
    const show5 = !!STATE.scannerShow5;
    const minMatch = STATE.scannerInclude2 ? 2 : 3;

    document.getElementById('section-5star').style.display = show5 ? 'block' : 'none';

    const process = (list, targetId, imgPath) => {
      const matches = list
        .map(w => ({
          ...w,
          count: w.opts.filter(o => currentOpts.includes(o)).length,
          isOwned: STATE.ownedWeapons.has(w.name)
        }))
        .filter(m => m.count >= minMatch)
        .sort((a,b) => b.count - a.count);

      const targetDiv = document.getElementById(targetId);
      if (!targetDiv) return;

      if (matches.length === 0) {
        targetDiv.innerHTML = `<div style="color:#666; font-size:0.9em; padding:10px; grid-column: 1/-1;">매칭된 무기가 없습니다.</div>`;
        return;
      }

      targetDiv.innerHTML = matches.map(m => {
        const starPrefix = imgPath.includes('6성') ? '6성' : '5성';
        return `
          <div class="weapon-card ${m.isOwned ? 'owned' : ''}" data-name="${m.name}" onclick="toggleWeaponStatus('${m.name}')" style="padding:5px;">
            <div class="weapon-img-container">
              <img src="배경.png" class="layer bg-layer">
              <img src="${imgPath}/${m.name.replace(/:/g,'')}.png" class="layer weapon-layer">
              <img src="${imgPath}/${starPrefix} 하단.png" class="layer bottom-layer">
            </div>
            <div style="font-weight:bold; font-size:0.85em;">${m.name}</div>
            <div class="match-badge" style="${m.isOwned ? 'background: var(--green); color:#fff; font-weight:bold;' : ''}">
              ${m.isOwned ? '종결' : `${m.count}개 일치`}
            </div>
          </div>
        `;
      }).join('');
    };

    process(WEAPONS_6, 'list-6star', '6성 무기');
    if (show5) process(WEAPONS_5, 'list-5star', '5성 무기');
  };
}

window.Endfield = window.Endfield || {};
Endfield.recognizeLoop = recognizeLoop;
Endfield.createWorkerAndStart = createWorkerAndStart;
Endfield.updateScannerMatchFactory = updateScannerMatchFactory;
Endfield.initScanner = initScanner;
