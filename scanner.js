// =============================================
// 게임 테두리 자동 감지 함수 (타이틀바 + 외부 여백 제거)
// =============================================
let _borderCache = { top: 0, left: 0, right: 0 };
let _borderFrameCount = 0;

function detectGameBorder(video, threshold = 45) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = vw;
  tmpCanvas.height = vh;
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.drawImage(video, 0, 0);
  const imgData = tmpCtx.getImageData(0, 0, vw, vh).data;

  // 상단: 25%, 50%, 75% 세 지점에서 타이틀바 높이 감지
  const scanX = [
    Math.floor(vw * 0.25),
    Math.floor(vw * 0.5),
    Math.floor(vw * 0.75)
  ];
  const detectedTops = [];

  for (const x of scanX) {
    for (let y = 0; y < vh / 3; y++) {
      const i = (y * vw + x) * 4;
      const brightness = (imgData[i] + imgData[i+1] + imgData[i+2]) / 3;
      if (brightness < threshold) {
        // 연속성 체크: 아래로 5픽셀도 어두워야 진짜 게임 화면
        let consistent = true;
        for (let dy = 1; dy <= 5; dy++) {
          const ni = ((y + dy) * vw + x) * 4;
          if ((imgData[ni] + imgData[ni+1] + imgData[ni+2]) / 3 > threshold + 10) {
            consistent = false;
            break;
          }
        }
        if (consistent) { detectedTops.push(y); break; }
      }
    }
  }

  const top = detectedTops.length > 0 ? Math.min(...detectedTops) : 0;

  // 좌측 테두리 감지
  let left = 0;
  for (let x = 0; x < vw / 5; x++) {
    const i = (Math.floor(vh / 2) * vw + x) * 4;
    if ((imgData[i] + imgData[i+1] + imgData[i+2]) / 3 < threshold) { left = x; break; }
  }

  // 우측 테두리 감지
  let right = 0;
  for (let x = vw - 1; x > vw * 0.8; x--) {
    const i = (Math.floor(vh / 2) * vw + x) * 4;
    if ((imgData[i] + imgData[i+1] + imgData[i+2]) / 3 < threshold) { right = vw - x - 1; break; }
  }

  return { top, left, right };
}

// =============================================
// 이하 기존 코드 (border 감지 로직만 추가됨)
// =============================================

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


function pickPresetKey(vw, vh) {
  // ROI는 항상 BASE를 사용하므로 프리셋 구분 불필요
  // 창모드 여부만 판단 (vw, vh 둘 다 체크해서 전체화면과 혼동 방지)
  const knownWindows = [
    { vw: 1604, vh: 946  },
    { vw: 1924, vh: 1126 },
    { vw: 1924, vh: 1246 }, // 1920×1200 창모드
    { vw: 2564, vh: 1486 },
    { vw: 2564, vh: 1646 },
    { vw: 3444, vh: 1486 },
  ];
  const TOL = 8;

  const isWindow = knownWindows.some(p =>
    Math.abs(vw - p.vw) <= TOL && Math.abs(vh - p.vh) <= TOL
  );
  return isWindow ? "WINDOW" : "BASE";
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

// 1) 프리셋(창모드 캡처 해상도) 먼저 결정
const presetKey = pickPresetKey(vw, vh);
const isWindowMode = (presetKey !== "BASE");

// 2) modeKey: 화면 비율로 결정 (창모드/전체화면 공통)
// 창모드는 타이틀바 때문에 vh가 커져서 ratio가 살짝 낮아짐 (예: 1600x900 창모드 = 1.695)
// 그래서 16:9 기준을 1.7 → 1.6으로 낮춤
const ratio = vw / vh;
let modeKey;
if (ratio >= 2.2) modeKey = 'WIDE';         // 21:9
else if (ratio >= 1.65) modeKey = 'DEFAULT'; // 16:9
else modeKey = 'TALL';                      // 16:10

const badge = document.getElementById('screen-mode-badge');

badge.style.background =
  modeKey === 'WIDE' ? '#a335ee' :
  modeKey === 'TALL' ? '#1f7ae0' :
  '#28a745';

badge.textContent =
  (modeKey === 'WIDE' ? 'WIDE 모드' :
   modeKey === 'TALL' ? '16:10 모드' :
   '표준 모드')
  + (isWindowMode ? ' (창모드)' : '');

// 창모드는 테두리를 잘라낸 뒤 게임 화면만 남으므로
// 전체화면(BASE)과 동일한 ROI를 사용
let config = CONFIGS?.[modeKey]?.BASE?.[STATE.currentSubTabs.search];

// 최후 폴백(예전 구조 호환)
if (!config) config = CONFIGS?.[modeKey]?.[STATE.currentSubTabs.search];

    // =============================================
    // [변경] 창모드일 때 테두리 자동 감지로 ROI 보정
    // 20프레임마다 한 번씩 감지 (성능 최적화)
    // =============================================
    if (isWindowMode) {
      if (_borderFrameCount++ % 20 === 0) {
        _borderCache = detectGameBorder(video, 45);
      }
    } else {
      // 전체화면은 테두리 없음
      _borderCache = { top: 0, left: 0, right: 0 };
      _borderFrameCount = 0;
    }
    const border = _borderCache;

    const gameX = border.left;
    const gameY = border.top;
    const gameW = vw - border.left - border.right;
    const gameH = vh - border.top;

    const sx = gameX + gameW * config.roi.x;
    const sy = gameY + gameH * config.roi.y;
    const sw = gameW * config.roi.w;
    const sh = gameH * config.roi.h;
    // =============================================

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
