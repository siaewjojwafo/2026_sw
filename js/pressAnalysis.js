// 2026.06.12 이가인

class PressAnalyzer {

    constructor() {

        // 8.2 스타카토 판정
        this.shortPressThreshold = 250;

        // 8.4 미세 떨림 흡수
        this.hysteresisMargin = 15;
        this.baseReleaseMissFrames = 2;
        this.longPressReleaseMissFrames = 10;

        // 8.5 연주 스타일 로그
        this.playStyleData = [];

        this.keyStates = {};
        this.frameCounter = 0;
        this.lastKeyCount = 0;
    }

    getKeyState(keyID) {

        if (!this.keyStates[keyID]) {

            this.keyStates[keyID] = {

                noteOnActive: false,
                pressStartTime: 0,
                pressStartFrame: 0,
                currentTimestamp: 0,
                elapsedTime: 0,
                totalPressedDuration: 0,
                totalPressedFrames: 0,

                longPressActive: false,
                visualFeedbackProgress: 0,
                gradientColorValue: 0,

                gestureTypeLabel: null,
                finalNoteDuration: 0,

                missFrames: 0,
                hysteresisMargin: 0,
                dynamicReleaseThreshold: 0,
                isStableHolding: false
            };
        }

        return this.keyStates[keyID];
    }

    reset() {

        this.keyStates = {};
        this.playStyleData = [];
        this.frameCounter = 0;
        this.lastKeyCount = 0;
    }

    // 8.4 히스테리시스가 적용된 충돌 판정
    isFingerOnKey(fingerPoint, key, state) {

        const padding = key.touchPadding || 0;
        let margin = padding;

        if (state.noteOnActive && state.longPressActive) {

            margin += this.hysteresisMargin;
            state.hysteresisMargin = this.hysteresisMargin;
            state.dynamicReleaseThreshold = margin;
            state.isStableHolding = true;

        } else {

            state.hysteresisMargin = 0;
            state.dynamicReleaseThreshold = padding;
            state.isStableHolding = false;
        }

        return (
            fingerPoint.x > key.x - margin &&
            fingerPoint.x < key.x + key.width + margin &&
            fingerPoint.y > key.y - margin &&
            fingerPoint.y < key.y + key.height + margin
        );
    }

    getRawHits(pianoKeys, fingerPoints) {

        const hitSet = new Set();

        fingerPoints.forEach(finger => {

            let blackHit = null;

            pianoKeys
                .filter(key => key.keyType === "black")
                .forEach(key => {

                    if (this.isFingerOnKey(finger, key, this.getKeyState(key.keyID))) {
                        blackHit = key.keyID;
                    }

                });

            if (blackHit !== null) {

                hitSet.add(blackHit);

            } else {

                pianoKeys
                    .filter(key => key.keyType === "white")
                    .forEach(key => {

                        if (this.isFingerOnKey(finger, key, this.getKeyState(key.keyID))) {
                            hitSet.add(key.keyID);
                        }

                    });

            }

        });

        return hitSet;
    }

    // 8.1~8.5 프레임 단위 처리
    processFrame(pianoKeys, fingerPoints) {

        if (pianoKeys.length !== this.lastKeyCount) {

            this.keyStates = {};
            this.lastKeyCount = pianoKeys.length;
        }

        this.frameCounter++;

        const currentTime = performance.now();
        const rawHits = this.getRawHits(pianoKeys, fingerPoints);
        const stableHits = new Set();

        pianoKeys.forEach(key => {

            const state = this.getKeyState(key.keyID);
            const rawHit = rawHits.has(key.keyID);

            if (rawHit) {

                state.missFrames = 0;
                stableHits.add(key.keyID);

            } else if (state.noteOnActive) {

                const maxMiss = state.longPressActive
                    ? this.longPressReleaseMissFrames
                    : this.baseReleaseMissFrames;

                state.missFrames++;

                if (state.missFrames < maxMiss) {
                    stableHits.add(key.keyID);
                }

            }

        });

        pianoKeys.forEach(key => {

            const state = this.getKeyState(key.keyID);
            const isPressed = stableHits.has(key.keyID);

            if (isPressed && !state.noteOnActive) {
                this.onNoteOn(state, currentTime);
            } else if (!isPressed && state.noteOnActive) {
                this.onNoteOff(key, state, currentTime);
            } else if (isPressed && state.noteOnActive) {
                this.updateHold(state, currentTime);
            }

            key.pressed = isPressed;
            key.isPressed = isPressed;

        });

        return this.playStyleData;
    }

    // 8.1 NOTE_ON
    onNoteOn(state, currentTime) {

        state.noteOnActive = true;
        state.pressStartTime = currentTime;
        state.pressStartFrame = this.frameCounter;
        state.elapsedTime = 0;
        state.longPressActive = false;
        state.visualFeedbackProgress = 0;
        state.gradientColorValue = 0;
        state.gestureTypeLabel = null;
        state.missFrames = 0;
    }

    // 8.1 실시간 누름 시간 측정 + 8.2/8.3 상태 갱신
    updateHold(state, currentTime) {

        state.currentTimestamp = currentTime;
        state.elapsedTime = currentTime - state.pressStartTime;
        state.totalPressedDuration = state.elapsedTime;
        state.totalPressedFrames = this.frameCounter - state.pressStartFrame;

        if (!state.longPressActive && state.elapsedTime >= this.shortPressThreshold) {

            state.longPressActive = true;
            state.gestureTypeLabel = "Long";

        }

        if (state.longPressActive) {

            state.visualFeedbackProgress = Math.min(1, state.elapsedTime / 2000);
            state.gradientColorValue = state.visualFeedbackProgress;

        }

    }

    // 8.1 NOTE_OFF + 8.2 판정 + 8.5 출력
    onNoteOff(key, state, currentTime) {

        state.totalPressedDuration = currentTime - state.pressStartTime;
        state.finalNoteDuration = state.totalPressedDuration;
        state.totalPressedFrames = this.frameCounter - state.pressStartFrame;

        if (!state.gestureTypeLabel) {
            state.gestureTypeLabel = "Short";
        }

        const playStyleEntry = {

            keyID: key.keyID,
            midiNoteNumber: key.midiNoteNumber,
            pitch: key.pitch,
            finalNoteDuration: state.finalNoteDuration,
            totalPressedFrames: state.totalPressedFrames,
            gestureTypeLabel: state.gestureTypeLabel,
            staccatoScore: state.gestureTypeLabel === "Short" ? 1 : 0,
            tenutoScore: state.gestureTypeLabel === "Long" ? 1 : 0,
            timestamp: currentTime

        };

        this.playStyleData.push(playStyleEntry);

        console.log("[SRS 8.5] playStyleData:", playStyleEntry);

        state.noteOnActive = false;
        state.longPressActive = false;
        state.visualFeedbackProgress = 0;
        state.gradientColorValue = 0;
        state.isStableHolding = false;
        state.missFrames = 0;
    }

    // 8.3 장음 유지 시각 피드백 색상
    getVisualColor(key) {

        const state = this.getKeyState(key.keyID);

        if (!key.pressed) {
            return key.idleColor;
        }

        if (state.longPressActive) {

            const progress = state.visualFeedbackProgress;

            if (key.keyType === "white") {

                const r = Math.round(180 + (100 - 180) * progress);
                const g = Math.round(180 + (220 - 180) * progress);
                const b = Math.round(180 + (80 - 180) * progress);

                return `rgba(${r}, ${g}, ${b}, ${0.85 + progress * 0.1})`;

            }

            const r = Math.round(139 + (220 - 139) * progress);
            const g = Math.round(0 + 160 * progress);

            return `rgba(${r}, ${g}, 40, ${0.95})`;

        }

        return key.activeColor;
    }

    // 8.3 장음 진행 게이지
    drawLongPressGauge(ctx, key) {

        const state = this.getKeyState(key.keyID);

        if (!state.longPressActive) {
            return;
        }

        const barHeight = 6;
        const barY = key.y + key.height - barHeight - 6;
        const barWidth = key.width - 8;
        const barX = key.x + 4;

        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.fillRect(barX, barY, barWidth, barHeight);

        ctx.fillStyle = `rgba(0, 255, 120, ${0.55 + state.visualFeedbackProgress * 0.45})`;
        ctx.fillRect(barX, barY, barWidth * state.visualFeedbackProgress, barHeight);

    }

    getLatestPlayStyle() {

        if (this.playStyleData.length === 0) {
            return null;
        }

        return this.playStyleData[this.playStyleData.length - 1];
    }

    // 8.5 상위 모듈(학습 데이터 저장소·채점 엔진)용 전체 로그 반환
    getPlayStyleData() {
        return this.playStyleData;
    }

}
