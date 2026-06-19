// ==========================================
// [1] 초기화 및 전역 변수 설정
// ==========================================
const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');

const tracker = new TrackingManager(); // 윤나영 5.30 추가
const pressAnalyzer = new PressAnalyzer();   // 이가인 06.12 추가
window.pressAnalyzer = pressAnalyzer;

// 손가락별 이전 좌표를 저장하여 입력 강도(velocity)를 계산 (hand4+7)
const previousFingerPositions = {};

// 피아노 생성
createPianoKeys(canvasElement.width, canvasElement.height);

// 오디오 엔진 음원 프리로드 실행 (hand4+7)
if (typeof pianoAudioEngine !== 'undefined' && pianoAudioEngine.preload) {
    pianoAudioEngine.preload(pianoKeys);
}

// ==========================================
// [2] 좌표 변환 및 ROI 영역 함수
// ==========================================
// [★ 쏠림 및 오차 완벽 교정] 미러링 렌더링 축과 일치하도록 대칭 좌표계 적용
function monitorToCanvas(x, y){
    const mWidth = typeof monitorWidth !== 'undefined' ? monitorWidth : canvasElement.width;
    const mHeight = typeof monitorHeight !== 'undefined' ? monitorHeight : canvasElement.height;

    const cx = (x / mWidth) * canvasElement.width;
    const cy = (y / mHeight) * canvasElement.height;

    // 보는 사람 기준으로 오른쪽으로 쏠리는 오차를 대칭축 변환(width - cx)으로 정확하게 잡아냅니다.
    return {
        x: canvasElement.width - cx,
        y: cy
    };
}

// ROI 영역 시각화
function drawROI(){
    if (typeof roiTopLeft === 'undefined' || typeof roiBottomRight === 'undefined') return;
    const x = roiTopLeft.x * canvasElement.width;
    const y = roiTopLeft.y * canvasElement.height;
    const width = (roiBottomRight.x - roiTopLeft.x) * canvasElement.width;
    const height = (roiBottomRight.y - roiTopLeft.y) * canvasElement.height;

    canvasCtx.strokeStyle = "rgba(255,255,0,0.9)";
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeRect(x, y, width, height);
}

// ==========================================
// [3] 심층 타건 감지 및 오디오 데이터 누적 (hand4+7 코어 로직)
// ==========================================
function processFingerKeySelections(fingerList, pianoKeys, frameIndex, pressedKeyStates) {
    const results = [];
    const currentTime = performance.now();

    fingerList.forEach(finger => {
        const canvasPoint = monitorToCanvas(finger.x, finger.y);
        let selectedKey = null;

        // 1. hand7 속도(Velocity) 계산
        const fingerTrackId = `${finger.handId}_${finger.fingerIndex}`;
        const previousFinger = previousFingerPositions[fingerTrackId];
        let velocityValue = 0.55;

        if (typeof pianoAudioEngine !== 'undefined' && pianoAudioEngine.calculateVelocity) {
            velocityValue = pianoAudioEngine.calculateVelocity(finger, previousFinger);
        }

        previousFingerPositions[fingerTrackId] = { x: finger.x, y: finger.y, z: finger.z };

        // 2. 흑건(black) 우선 판정
        const blackKeys = pianoKeys.filter(key => key.keyType === "black");
        for (const key of blackKeys) {
            if (canvasPoint.x > key.x && canvasPoint.x < key.x + key.width &&
                canvasPoint.y > key.y && canvasPoint.y < key.y + key.height) {
                selectedKey = key;
                break;
            }
        }

        // 3. 흑건이 안 눌렸을 때만 백건(white) 판정
        if (!selectedKey) {
            const whiteKeys = pianoKeys.filter(key => key.keyType === "white");
            for (const key of whiteKeys) {
                if (canvasPoint.x > key.x && canvasPoint.x < key.x + key.width &&
                    canvasPoint.y > key.y && canvasPoint.y < key.y + key.height) {
                    selectedKey = key;
                    break;
                }
            }
        }

        let collisionState = "none";
        // 4. 선택된 건반이 존재할 경우 처리
        // 26.06.20 윤혜원 수정
        if (selectedKey) {
            collisionState = "selected";
            selectedKey.pressed = true;
            selectedKey.activeColor = selectedKey.keyType === "black" ? "rgba(255, 180, 0, 0.95)" : "rgba(255, 215, 0, 0.92)";

            // hand4 고유 타건 심층 감지 데이터 업데이트
            const fingerID = `${finger.handId}_${finger.fingerIndex}`;
            if (!tracker.previousFingerData[fingerID]) tracker.previousFingerData[fingerID] = {};
            const fingerState = tracker.previousFingerData[fingerID];
            // 26.06.20 윤혜원 수정
            const deltaY = fingerState.previousY === undefined ? 0 : finger.y - fingerState.previousY;
            const deltaTime = fingerState.lastTime ? (currentTime - fingerState.lastTime) / 1000 : 0.016;

            const pressDetected = tracker.detectPressByDepth(finger.z, fingerState.previousZ, tracker.pressThreshold);
            const zVelocity = tracker.calculateZVelocity(finger.z, fingerState.previousZ, deltaTime);
            const inflectionResult = tracker.detectYInflectionPoint(finger.y, fingerState.previousY, fingerState.previousVelocity || 0, deltaTime);
            // 26.06.20 yhw 수정
            console.log(deltaY);
            const validPress = finger.fingerIndex === 4 ? deltaY > 1 : deltaY > 3;

            if (pressDetected && Math.abs(zVelocity) > tracker.velocityThreshold && inflectionResult.inflection) {
                tracker.generateNoteEvent(selectedKey.keyID, selectedKey.pitch, true, Math.abs(zVelocity));
                fingerState.isPressed = true;
            }
            if (!pressDetected && fingerState.isPressed) {
                tracker.generateNoteEvent(selectedKey.keyID, selectedKey.pitch, false, 0);
                fingerState.isPressed = false;
            }

            fingerState.previousZ = finger.z;
            fingerState.previousY = finger.y;
            fingerState.previousVelocity = inflectionResult.yVelocity;
            fingerState.lastTime = currentTime;

            // hand7 오디오 엔진 전송용 Map 데이터 누적
            const previousPressedState = pressedKeyStates.get(selectedKey.keyID);
            const nextVelocity = previousPressedState ? Math.max(previousPressedState.velocityValue, velocityValue) : velocityValue;

            // 26.06.20 윤혜원 수정
            if (validPress) {
                pressedKeyStates.set(selectedKey.keyID, {
                    keyId: selectedKey.keyID,
                    noteName: selectedKey.pitch,
                    pressState: true,
                    velocityValue: nextVelocity
                });
            }
        }

        results.push({
            fingerTipX: canvasPoint.x,
            fingerTipY: canvasPoint.y,
            collisionState: collisionState
        });
    });

    return results;
}

// ==========================================
// [4] 손 인식 결과 처리 메인 루프 (onResults)
// ==========================================
function onResults(results){
    tracker.updatePerformance();
    tracker.detectHands(results);
    tracker.detectHandedness(results);

    // 캔버스 초기화 및 미러링
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    const pressedKeyStates = new Map();

    // 건반 상태 초기화 (공통)
    pianoKeys.forEach(key => {
        key.pressed = false;
    });

    let allHands = [];

    if(results.multiHandLandmarks){
        results.multiHandLandmarks.forEach((landmarks, index)=>{
            const filteredLandmarks = landmarks;
            allHands.push(filteredLandmarks);

            // 손가락 각도 등 연산 (hand8 유지)
            const velocity = tracker.calculateVelocity(filteredLandmarks[8]);
            const indexAngle = tracker.calculateAngle(filteredLandmarks[5], filteredLandmarks[6], filteredLandmarks[8]);

            let label = results.multiHandedness[index].label;
            label = (label === "Left") ? "Right" : "Left"; // 미러링 반전

            const handID = `${label}_${index}`;
            const palmX = (filteredLandmarks[0].x + filteredLandmarks[5].x + filteredLandmarks[9].x + filteredLandmarks[13].x + filteredLandmarks[17].x) / 5;
            const palmY = (filteredLandmarks[0].y + filteredLandmarks[5].y + filteredLandmarks[9].y + filteredLandmarks[13].y + filteredLandmarks[17].y) / 5;

            canvasCtx.fillStyle = "yellow";
            canvasCtx.font = "20px Arial";
            const textX = canvasElement.width - (palmX * canvasElement.width);
            const textY = palmY * canvasElement.height;
            canvasCtx.fillText(handID, textX, textY);
        });

        // 손가락 위치 추출 및 캔버스 좌표 변환
        const fingerList = trackMultipleFingers(results.multiHandLandmarks, monitorWidth, monitorHeight);
        const canvasFingerPoints = fingerList.map(finger => monitorToCanvas(finger.x, finger.y));

        // hand4+7: 심층 물리 충돌 및 오디오 로직 처리
        let frameIndex = 0;
        if (typeof nextCollisionFrameIndex !== 'undefined') frameIndex = nextCollisionFrameIndex();

        const collisionResults = processFingerKeySelections(fingerList, pianoKeys, frameIndex, pressedKeyStates);



        // hand8: PressAnalyzer 프레임 처리 (06.12 이가인 로직)
        pressAnalyzer.processFrame(pianoKeys, canvasFingerPoints);

        // 오디오 엔진 동기화 (hand4+7)
        if (typeof pianoAudioEngine !== 'undefined' && pianoAudioEngine.syncPressedKeys) {
            pianoAudioEngine.syncPressedKeys(pressedKeyStates);
        }

        // 핑거팁 시각화 렌더링
        collisionResults.forEach(result => {
            canvasCtx.beginPath();
            canvasCtx.arc(result.fingerTipX, result.fingerTipY, 8, 0, Math.PI * 2);
            canvasCtx.fillStyle = result.collisionState === "selected" ? "cyan" : "rgba(0,255,255,0.35)";
            canvasCtx.fill();
        });

        window.latestCollisionResults = collisionResults;
    } else {
        // 손이 화면에 없을 때 PressAnalyzer 상태 초기화
        pressAnalyzer.processFrame(pianoKeys, []);
    }

    const isShowLabels = typeof showLabels !== 'undefined' ? showLabels : true;

    // ==========================================
    // [5] 건반 렌더링 (PressAnalyzer + 기존 Color 융합)
    // ==========================================
    // 흰 건반 렌더링
    pianoKeys.filter(key => key.keyType === "white").forEach(key => {
        // pressAnalyzer 색상 우선 적용, 없으면 기존 타건 색상
        canvasCtx.fillStyle = pressAnalyzer.getVisualColor(key) || (key.pressed ? key.activeColor : key.idleColor);
        canvasCtx.fillRect(key.x, key.y, key.width, key.height);

        if (typeof pressAnalyzer.drawLongPressGauge === 'function') {
            pressAnalyzer.drawLongPressGauge(canvasCtx, key);
        }

        canvasCtx.strokeStyle = "rgba(255,255,255,0.25)";
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeRect(key.x, key.y, key.width, key.height);

        if (isShowLabels) {
            canvasCtx.fillStyle = "black";
            canvasCtx.font = "18px Arial";
            const labelY = (currentOctave === 1) ? key.y + key.height -250 : key.y + key.height -180;
            canvasCtx.fillText(key.pitch, key.x + (key.width / 2) - 10, labelY);
        }
    });

    // 검은 건반 렌더링
    pianoKeys.filter(key => key.keyType === "black").forEach(key => {
        canvasCtx.fillStyle = pressAnalyzer.getVisualColor(key) || (key.pressed ? key.activeColor : key.idleColor);
        canvasCtx.fillRect(key.x, key.y, key.width, key.height);

        if (typeof pressAnalyzer.drawLongPressGauge === 'function') {
            pressAnalyzer.drawLongPressGauge(canvasCtx, key);
        }

        if (isShowLabels) {
            canvasCtx.fillStyle = "white";
            canvasCtx.font = "14px Arial";
            canvasCtx.fillText(key.pitch, key.x + (key.width / 2) - 14, key.y + key.height - 20);
        }
    });

    // ROI 표시
    drawROI();

    // 랜드마크 스켈레톤 라인 덧그리기
    canvasCtx.save();
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);

    allHands.forEach(landmarks => {
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color:"#00FF00", lineWidth:4 });
        drawLandmarks(canvasCtx, landmarks, { color:"#FF0000", fillColor:"#00FF00", radius:5 });
    });
    canvasCtx.restore();

    // 성능 지표 및 Press Analyzer 통계 출력 (hand8)
    canvasCtx.fillStyle = "yellow";
    canvasCtx.font = "20px Arial";
    canvasCtx.fillText(`FPS : ${tracker.FramePerSecond.toFixed(1)}`, 20, 40);
    canvasCtx.fillText(`Latency : ${tracker.FrameLatency.toFixed(1)} ms`, 20, 70);

    const latestStyle = pressAnalyzer.getLatestPlayStyle ? pressAnalyzer.getLatestPlayStyle() : null;
    if (latestStyle) {
        const styleLabel = latestStyle.gestureTypeLabel === "Short" ? "Staccato" : "Long Press";
        canvasCtx.fillText(`Last: ${latestStyle.pitch} ${styleLabel} (${latestStyle.finalNoteDuration.toFixed(0)}ms)`, 20, 100);
    }
}

// ==========================================
// [6] MediaPipe Hands 초기화 및 실행
// ==========================================
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 1000,
    height: 700
});
camera.start();