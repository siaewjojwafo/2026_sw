// guide.js - 악보 및 가이드 모드 관리 파일 - 2026-11-13 이채민

// ==========================================
// [1] 전역 상태 변수 (hands.js와 공유)
// ==========================================
window.currentMode = 'FREE';             // 'FREE'(자율 모드) 또는 'GUIDE'(연주 모드)
window.currentGuideTargetPitch = null;   // 현재 눌러야 할 정답 건반 (예: 'E4')
window.lastWrongNote = null;             // 방금 틀린 건반 (빨간불 표시용)

let currentSongKey = null;
let currentStep = 0;
let wrongNoteTimer = null;

// ==========================================
// [2] 악보 데이터베이스 (건반 pitch 이름 기준)
// ==========================================
const SONG_DB = {
  airplane: {
    title: "✈️ 비행기",
    notes: [
      { pitch: "E4", label: "미" }, { pitch: "D4", label: "레" }, { pitch: "C4", label: "도" }, { pitch: "D4", label: "레" },
      { pitch: "E4", label: "미" }, { pitch: "E4", label: "미" }, { pitch: "E4", label: "미" },
      { pitch: "D4", label: "레" }, { pitch: "D4", label: "레" }, { pitch: "D4", label: "레" },
      { pitch: "E4", label: "미" }, { pitch: "G4", label: "솔" }, { pitch: "G4", label: "솔" },
      { pitch: "E4", label: "미" }, { pitch: "D4", label: "레" }, { pitch: "C4", label: "도" }, { pitch: "D4", label: "레" },
      { pitch: "E4", label: "미" }, { pitch: "E4", label: "미" }, { pitch: "E4", label: "미" },
      { pitch: "D4", label: "레" }, { pitch: "D4", label: "레" }, { pitch: "E4", label: "미" }, { pitch: "D4", label: "레" }, { pitch: "C4", label: "도" }
    ]
  },
  twinkle: {
    title: "⭐ 작은 별",
    notes: [
      { pitch: "C4", label: "도" }, { pitch: "C4", label: "도" }, { pitch: "G4", label: "솔" }, { pitch: "G4", label: "솔" },
      { pitch: "A4", label: "라" }, { pitch: "A4", label: "라" }, { pitch: "G4", label: "솔" },
      { pitch: "F4", label: "파" }, { pitch: "F4", label: "파" }, { pitch: "E4", label: "미" }, { pitch: "E4", label: "미" },
      { pitch: "D4", label: "레" }, { pitch: "D4", label: "레" }, { pitch: "C4", label: "도" }
    ]
  }
};

// ==========================================
// [3] 모드 선택 화면 및 UI 제어 함수
// ==========================================
window.openModeModal = function() {
  window.currentMode = 'FREE';
  window.currentGuideTargetPitch = null;
  window.lastWrongNote = null;

  const modeModal = document.getElementById('modeModal');
  const songSelectBox = document.getElementById('songSelectBox');
  const guideHeader = document.getElementById('guideHeader');
  const freeModeResetBtn = document.getElementById('freeModeResetBtn');

  if (modeModal) modeModal.style.display = 'flex';
  if (songSelectBox) songSelectBox.style.display = 'none';
  if (guideHeader) guideHeader.style.display = 'none';
  if (freeModeResetBtn) freeModeResetBtn.style.display = 'none';
};

window.showSongList = function() {
  const songSelectBox = document.getElementById('songSelectBox');
  if (songSelectBox) songSelectBox.style.display = 'block';
};

window.startFreeMode = function() {
  window.currentMode = 'FREE';
  window.currentGuideTargetPitch = null;

  const modeModal = document.getElementById('modeModal');
  const freeModeResetBtn = document.getElementById('freeModeResetBtn');

  if (modeModal) modeModal.style.display = 'none';
  if (freeModeResetBtn) freeModeResetBtn.style.display = 'block';
};

window.startGuideMode = function(songKey) {
  if (!SONG_DB[songKey]) return;

  window.currentMode = 'GUIDE';
  currentSongKey = songKey;
  currentStep = 0;
  updateGuideTarget();

  const modeModal = document.getElementById('modeModal');
  const guideHeader = document.getElementById('guideHeader');
  const songTitleDisplay = document.getElementById('songTitleDisplay');
  const freeModeResetBtn = document.getElementById('freeModeResetBtn');

  if (modeModal) modeModal.style.display = 'none';
  if (freeModeResetBtn) freeModeResetBtn.style.display = 'none';
  if (guideHeader) guideHeader.style.display = 'block';
  if (songTitleDisplay) songTitleDisplay.innerText = SONG_DB[songKey].title;
};

// ==========================================
// [4] 상단 악보 갱신 및 정답/오답 판정
// ==========================================
// ==========================================
// [4] 상단 오선지 악보 갱신 및 정답/오답 판정
// ==========================================
function updateGuideTarget() {
  const songNotes = SONG_DB[currentSongKey].notes;
  if (currentStep < songNotes.length) {
    window.currentGuideTargetPitch = songNotes[currentStep].pitch;
    drawSheetMusic(); // 글자 대신 오선지 캔버스 그리기 호출
  }
}

// 오선지(5선) 및 음표 렌더링 함수
function drawSheetMusic() {
  const canvas = document.getElementById('sheetCanvas');
  if (!canvas || !currentSongKey) return;
  const ctx = canvas.getContext('2d');
  const songNotes = SONG_DB[currentSongKey].notes;

  // 1. 배경 초기화
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 2. 오선지 5줄 그리기 (위에서부터 F5, D5, B4, G4, E4 위치)
  const startX = 15;
  const endX = canvas.width - 15;
  const bottomLineY = 75; // 가장 아래 첫째 줄(미, E4)의 Y좌표
  const lineGap = 10;     // 줄 간격 (반 칸은 5px)

  ctx.strokeStyle = '#adb5bd';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    const y = bottomLineY - i * lineGap;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  }

  // 3. 높은음자리표 그리기
  ctx.fillStyle = '#1b365d';
  ctx.font = '56px serif';
  ctx.fillText('𝄞', 20, 74);

  // 4. 계이름별 오선지 높이 단계 (E4 = 0 기준, 한 칸/줄 올라갈 때마다 +1)
  const pitchStepMap = {
    'C4': -2, 'D4': -1, 'E4': 0, 'F4': 1, 'G4': 2, 'A4': 3, 'B4': 4,
    'C5': 5,  'D5': 6,  'E5': 7, 'F5': 8, 'G5': 9, 'A5': 10, 'B5': 11
  };

  // 5. 현재 음표부터 앞으로 6개 음표 그리기
  const maxVisible = 6;
  const noteStartX = 95;
  const noteSpacing = 60;

  for (let i = currentStep; i < Math.min(currentStep + maxVisible, songNotes.length); i++) {
    const noteObj = songNotes[i];
    const isCurrent = (i === currentStep);
    const x = noteStartX + (i - currentStep) * noteSpacing;

    // 반음(#) 처리 및 Y좌표 계산
    const hasSharp = noteObj.pitch.includes('#');
    const basePitch = noteObj.pitch.replace('#', '');
    const step = pitchStepMap[basePitch] !== undefined ? pitchStepMap[basePitch] : 0;
    const y = bottomLineY - step * (lineGap / 2);

    // 현재 쳐야 할 첫 번째 음표 뒤에는 연한 노란색 강조 박스 표시
    if (isCurrent) {
      ctx.fillStyle = 'rgba(255, 212, 59, 0.35)';
      ctx.beginPath();
      ctx.roundRect(x - 22, 12, 44, 96, 8);
      ctx.fill();
    }

    const noteColor = isCurrent ? '#e03131' : '#212529'; // 현재 음표는 빨간색, 다음 음표는 검은색
    ctx.strokeStyle = noteColor;
    ctx.fillStyle = noteColor;

    // 덧줄 그리기 (가온 다 C4 또는 높은 라 A5일 경우)
    if (step <= -2) {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 13, bottomLineY + lineGap);
      ctx.lineTo(x + 13, bottomLineY + lineGap);
      ctx.stroke();
    } else if (step >= 10) {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 13, bottomLineY - 5 * lineGap);
      ctx.lineTo(x + 13, bottomLineY - 5 * lineGap);
      ctx.stroke();
    }

    // 올림표(♯) 표시
    if (hasSharp) {
      ctx.font = 'bold 14px Arial';
      ctx.fillText('♯', x - 18, y + 5);
    }

    // 음표 머리 (살짝 기울어진 타원)
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.3);
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 음표 기둥 (시 B4 미만이면 오른쪽 위로, 이상이면 왼쪽 아래로 그리기)
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (step < 4) {
      ctx.moveTo(x + 6.5, y);
      ctx.lineTo(x + 6.5, y - 26);
    } else {
      ctx.moveTo(x - 6.5, y);
      ctx.lineTo(x - 6.5, y + 26);
    }
    ctx.stroke();

    // 오선지 아래에 계이름(도, 레, 미...) 보조 텍스트 표시
    ctx.font = isCurrent ? 'bold 14px Arial' : '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(noteObj.label, x, 103);
    ctx.textAlign = 'start'; // 정렬 초기화
  }
}

// 오답 부저음 재생 (audio.js의 pianoAudioEngine 활용)
function playErrorSound() {
  if (typeof pianoAudioEngine === 'undefined') return;
  const context = pianoAudioEngine.init();
  if (!context) return;
  pianoAudioEngine.unlock();

  const osc = context.createOscillator();
  const gain = context.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(150, context.currentTime);

  gain.gain.setValueAtTime(0.25, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.25);

  osc.connect(gain);
  gain.connect(context.destination);

  osc.start();
  osc.stop(context.currentTime + 0.25);
}

// hands.js에서 건반이 눌릴 때 호출하는 정답 체크 함수
window.handleGuideNoteOn = function(pressedPitch) {
  if (window.currentMode !== 'GUIDE' || !currentSongKey) return true;

  const songNotes = SONG_DB[currentSongKey].notes;
  const targetPitch = songNotes[currentStep].pitch;

  if (pressedPitch === targetPitch) {
    // [정답!] 다음 음표로 이동하고 true 반환
    currentStep++;

    if (currentStep >= songNotes.length) {
      window.currentGuideTargetPitch = null;
      setTimeout(() => {
        alert(`🎉 '${SONG_DB[currentSongKey].title}' 연주를 완벽하게 마쳤습니다!`);
        window.openModeModal();
      }, 300);
    } else {
      updateGuideTarget();
    }
    return true;
  } else {
    // [오답!] 부저음 재생 + 0.3초간 빨간불 표시 후 false 반환
    playErrorSound();
    window.lastWrongNote = pressedPitch;
    clearTimeout(wrongNoteTimer);
    wrongNoteTimer = setTimeout(() => {
      window.lastWrongNote = null;
    }, 300);
    return false;
  }
};