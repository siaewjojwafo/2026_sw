// [SRS 4.4 사용자 맞춤형 UI 인터페이스] - 2026.05.31 이채민
const pianoKeys = [];
const KEY_BOTTOM_RATIO = 0.95;

// [SRS 4.4] 글로벌 상태 관리 변수 선언
let currentOctave = 1;       // 현재 옥타브 설정 (1 또는 2)
let showLabels = true;       // 라벨 표시 여부 (true 또는 false)
let lastCanvasWidth = 1000;  // 화면 크기 백업용
let lastCanvasHeight = 700;  // 화면 크기 백업용

// 건반 생성 함수
function createPianoKeys(canvasWidth, canvasHeight){
    pianoKeys.length = 0;
    lastCanvasWidth = canvasWidth;
    lastCanvasHeight = canvasHeight;

    // 1옥타브(8개) vs 2옥타브(15개) 데이터 정의
    let whiteNotes = [];
    let midiNumbers = [];
    let blackKeysData = [];

    // 06.07 YHW 수정
    if (currentOctave === 1) {
        whiteNotes = ["C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4"];
        midiNumbers = [72, 71, 69, 67, 65, 64, 62, 60];

        blackKeysData = [
            { note: "A#4", midi: 70, pos: 5 },
            { note: "G#4", midi: 68, pos: 4 },
            { note: "F#4", midi: 66, pos: 3 },
            { note: "D#4", midi: 63, pos: 1 },
            { note: "C#4", midi: 61, pos: 0 }
        ];
    } else {
          whiteNotes = [
              "C6", "B5", "A5", "G5", "F5", "E5", "D5", "C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4"
          ];
          midiNumbers = [
              84, 83, 81, 79, 77, 76, 74, 72, 71, 69, 67, 65, 64, 62, 60
          ];
          blackKeysData = [
              { note: "A#5", midi: 82, pos: 12 },
              { note: "G#5", midi: 80, pos: 11 },
              { note: "F#5", midi: 78, pos: 10 },
              { note: "D#5", midi: 75, pos: 8 },
              { note: "C#5", midi: 73, pos: 7 },
              { note: "A#4", midi: 70, pos: 5 },
              { note: "G#4", midi: 68, pos: 4 },
              { note: "F#4", midi: 66, pos: 3 },
              { note: "D#4", midi: 63, pos: 1 },
              { note: "C#4", midi: 61, pos: 0 }
          ];
    }

    const whiteKeyCount = whiteNotes.length;
    const whiteKeyWidth = canvasWidth / whiteKeyCount; // 선택된 개수에 따라 폭 자동 조절
    const whiteKeyHeight = (currentOctave === 1) ? 320 : 220 // 06.07 YHW 수정

    const blackKeyHeightRatio = 0.6;
    const blackKeyWidth = whiteKeyWidth * 0.6;
    const blackKeyHeight = whiteKeyHeight * blackKeyHeightRatio;

    // 1. 흰 건반 생성
    for(let i = 0; i < whiteKeyCount; i++){
        // 2026.06.07 YHW 수정
        const left = (whiteKeyCount - 1 - i) * whiteKeyWidth;
        const blackBottom = canvasHeight * KEY_BOTTOM_RATIO;
        const blackTop = blackBottom - blackKeyHeight;
        const bottom = blackBottom;
        const top = bottom - whiteKeyHeight;
        const right = left + whiteKeyWidth;

        pianoKeys.push({
            keyID: i,
            midiNoteNumber: midiNumbers[i],
            pitch: whiteNotes[i],
            keyType: "white",
            keyRect: { left: left, top: top, right: right, bottom: bottom },
            x: left,
            y: top,
            width: whiteKeyWidth,
            height: whiteKeyHeight,
            zIndex: 2,                                  
            touchPadding: 5,                            
            isPressed: false,
            idleColor: "rgba(255, 255, 255, 0.65)",
            activeColor: "rgba(180, 180, 180, 0.85)"
        });
    }

    // 2. 검은 건반 생성
    blackKeysData.forEach((key, index) => {
        // 2026.06.07 YHW 수정
        const mirroredPos = whiteKeyCount - 2 - key.pos;
        const left = (mirroredPos + 1) * whiteKeyWidth - blackKeyWidth / 2;
        const whiteTop = canvasHeight * KEY_BOTTOM_RATIO;
        const right = left + blackKeyWidth;
        const bottom = canvasHeight * KEY_BOTTOM_RATIO;
        const top = bottom - blackKeyHeight;

        pianoKeys.push({
            keyID: whiteKeyCount + index,
            midiNoteNumber: key.midi,
            pitch: key.note,
            keyType: "black",
            keyRect: { left: left, top: top, right: right, bottom: bottom },
            x: left,
            y: top,
            width: blackKeyWidth,
            height: blackKeyHeight,
            zIndex: 2,                                  
            touchPadding: 3,                            
            isPressed: false,                           
            idleColor: "rgba(0, 0, 0, 0.65)",
            activeColor: "rgba(139, 0, 0, 0.95)"
        });
    });

    window.keyCount = pianoKeys.length;
}

// [SRS 4.4 INTERFACE FUNCTIONS] HTML 조작과 연결될 환경 변경 함수들
function changeOctaveRange(octave) {
    currentOctave = octave;
    // 옥타브가 바뀌면 기존 화면 크기를 기반으로 건반을 새로 동적 생성합니다.
    createPianoKeys(lastCanvasWidth, lastCanvasHeight);
    console.log(`[SRS 4.4] 건반 개수 조절 완료: ${octave}옥타브`);
}

function toggleLabels(isChecked) {
    showLabels = isChecked;
    console.log(`[SRS 4.4] 건반 라벨 표시 설정 변경: ${isChecked}`);
}