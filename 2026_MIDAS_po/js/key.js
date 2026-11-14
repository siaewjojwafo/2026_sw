// [SRS 4.2 각 건반 객체화 및 속성 할당] - 2026.05.29 이채민

class PianoKey {
    constructor(keyID, midiNoteNumber, keyType, pitch, left, top, right, bottom, width, height, idleColor, activeColor) {
        this.keyID = keyID;                   // [SRS] 고유 ID
        this.midiNoteNumber = midiNoteNumber; // [SRS] 대응 음계 표준 MIDI 번호
        this.keyType = keyType;               // [SRS] 건반 유형 ("white" 또는 "black")
        this.pitch = pitch;                   // 음계 이름 (예: "C4", "C#4")
        
        // [SRS] keyRect 구조화 (상하좌우 경계면 좌표)
        this.keyRect = {
            left: left,
            top: top,
            right: right,
            bottom: bottom
        };

        // 하위 호환성 및 그리기 편의용 물리 속성
        this.x = left;
        this.y = top;
        this.width = width;
        this.height = height;

        // [SRS 4.3.1] 실시간 성능 및 상태 제어 변수
        this.zIndex = 2;                                   // 레이어 우선순위
        this.touchPadding = keyType === "black" ? 3 : 5;  // 충돌 판정 마진
        this.isPressed = false;                            // 타건 상태 (Boolean)
        
        // [SRS 4.1.1] 시각적 피드백 속성 분리
        this.idleColor = idleColor;                        // 평상시 건반 색상
        this.activeColor = activeColor;                    // 눌렸을 때 피드백 색상
        this.animationSpeed = 0.2;                         // 애니메이션 변화 속도
    }
}