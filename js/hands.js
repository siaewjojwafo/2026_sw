const videoElement =
    document.getElementsByClassName('input_video')[0];

const canvasElement =
    document.getElementsByClassName('output_canvas')[0];

const canvasCtx =
    canvasElement.getContext('2d');

const tracker =
    new TrackingManager(); //윤나영 5.30추가


// 피아노 생성

createPianoKeys(
    canvasElement.width,
    canvasElement.height
);


// 모니터 좌표 -> 캔버스 좌표 변환

function monitorToCanvas(x, y){

     const cx = (x / monitorWidth) * canvasElement.width;
        const cy = (y / monitorHeight) * canvasElement.height;

        return {
            x: canvasElement.width - cx,
            y: cy
        };
}


// ROI 영역 시각화

function drawROI(){

    const x = roiTopLeft.x * canvasElement.width;
    const y = roiTopLeft.y * canvasElement.height;

    const width =
        (roiBottomRight.x - roiTopLeft.x) * canvasElement.width;

    const height =
        (roiBottomRight.y - roiTopLeft.y) * canvasElement.height;

    canvasCtx.strokeStyle = "rgba(255,255,0,0.9)";
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeRect(x, y, width, height);

}


// 손 인식 결과 처리

function onResults(results){

    tracker.updatePerformance(); //윤나영 5.30추가

    tracker.detectHands(results); //윤나영 5.30추가

    tracker.detectHandedness(results); //윤나영 5.30추가

    canvasCtx.save();

    canvasCtx.clearRect(
        0,
        0,
        canvasElement.width,
        canvasElement.height
    );

    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();


    pianoKeys.forEach(key => {

        key.pressed = false;

    });

    // 손가락 위치 계산

    let allHands = [];

    if(results.multiHandLandmarks){

        results.multiHandLandmarks.forEach((landmarks,index)=>{

            const filteredLandmarks = landmarks;

            allHands.push(filteredLandmarks);

            const velocity =
                tracker.calculateVelocity(
                    filteredLandmarks[8]
                );

            const indexAngle =
                tracker.calculateAngle(
                    filteredLandmarks[5],
                    filteredLandmarks[6],
                    filteredLandmarks[8]
                );

            console.log(
                "Index Angle:",
                indexAngle
            );

            let label =
                results.multiHandedness[index].label;

            if(label === "Left"){
                label = "Right";
            }
            else{
                label = "Left";
            }

            const handID =
                `${label}_${index}`;

            const palmX = (
                filteredLandmarks[0].x +
                filteredLandmarks[5].x +
                filteredLandmarks[9].x +
                filteredLandmarks[13].x +
                filteredLandmarks[17].x
            ) / 5;

            const palmY = (
                filteredLandmarks[0].y +
                filteredLandmarks[5].y +
                filteredLandmarks[9].y +
                filteredLandmarks[13].y +
                filteredLandmarks[17].y
            ) / 5;

            canvasCtx.fillStyle = "yellow";
            canvasCtx.font = "20px Arial";

            const textX = canvasElement.width - (palmX * canvasElement.width);
            const textY = palmY * canvasElement.height;

            canvasCtx.fillText(handID, textX, textY);

        });

        const fingerList = trackMultipleFingers(
            results.multiHandLandmarks,
            monitorWidth,
            monitorHeight
        );



        // 건반 수정 부분

        fingerList.forEach(finger => {

            const canvasPoint = monitorToCanvas(
                finger.x,
                finger.y
            );

            let blackKeyPressed = false;

            pianoKeys
                .filter(key => key.keyType === "black")
                .forEach(key => {

                    if (
                        canvasPoint.x > key.x &&
                        canvasPoint.x < key.x + key.width &&
                        canvasPoint.y > key.y &&
                        canvasPoint.y < key.y + key.height
                    ) {

                        key.pressed = true;
                        blackKeyPressed = true;

                        // ===== SRS 6 시작 =====

                            const fingerID =
                                `${finger.handId}_${finger.fingerIndex}`;

                            if(!tracker.previousFingerData[fingerID]){
                                tracker.previousFingerData[fingerID] = {};
                            }

                            const fingerState =
                                tracker.previousFingerData[fingerID];

                            const currentTime =
                                performance.now();

                            const deltaTime =
                                fingerState.lastTime
                                ?
                                (currentTime - fingerState.lastTime) / 1000
                                :
                                0.016;

                            const pressDetected =
                                tracker.detectPressByDepth(
                                    finger.z,
                                    fingerState.previousZ,
                                    tracker.pressThreshold
                                );

                            const zVelocity =
                                tracker.calculateZVelocity(
                                    finger.z,
                                    fingerState.previousZ,
                                    deltaTime
                                );

                            const landmarks =
                                results.multiHandLandmarks[
                                    finger.handId
                                ];

                            const distanceRatio =
                                tracker.calculateDistanceRatio(
                                    landmarks[8],
                                    landmarks[6]
                                );

                            const inflectionResult =
                                tracker.detectYInflectionPoint(
                                    finger.y,
                                    fingerState.previousY,
                                    fingerState.previousVelocity || 0,
                                    deltaTime
                                );

                            if(
                                pressDetected &&
                                Math.abs(zVelocity) >
                                tracker.velocityThreshold &&
                                inflectionResult.inflection
                            ){

                                tracker.generateNoteEvent(
                                    key.keyID,
                                    key.pitch,
                                    true,
                                    Math.abs(zVelocity)
                                );

                                fingerState.isPressed = true;

                            }

                            if(
                                !pressDetected &&
                                fingerState.isPressed
                            ){

                                tracker.generateNoteEvent(
                                    key.keyID,
                                    key.pitch,
                                    false,
                                    0
                                );

                                fingerState.isPressed = false;
                            }

                            fingerState.previousZ =
                                finger.z;

                            fingerState.previousY =
                                finger.y;

                            fingerState.previousVelocity =
                                inflectionResult.yVelocity;

                            fingerState.lastTime =
                                currentTime;

                            // ===== SRS 6 끝 =====


                    }

                });

            if (!blackKeyPressed) {

                pianoKeys
                    .filter(key => key.keyType === "white")
                    .forEach(key => {

                        if (
                            canvasPoint.x > key.x &&
                            canvasPoint.x < key.x + key.width &&
                            canvasPoint.y > key.y &&
                            canvasPoint.y < key.y + key.height
                        ) {

                            key.pressed = true;

                            // ===== SRS 6 시작 =====

                                const fingerID =
                                    `${finger.handId}_${finger.fingerIndex}`;

                                if(!tracker.previousFingerData[fingerID]){
                                    tracker.previousFingerData[fingerID] = {};
                                }

                                const fingerState =
                                    tracker.previousFingerData[fingerID];

                                const currentTime =
                                    performance.now();

                                const deltaTime =
                                    fingerState.lastTime
                                    ?
                                    (currentTime - fingerState.lastTime) / 1000
                                    :
                                    0.016;

                                const pressDetected =
                                    tracker.detectPressByDepth(
                                        finger.z,
                                        fingerState.previousZ,
                                        tracker.pressThreshold
                                    );

                                const zVelocity =
                                    tracker.calculateZVelocity(
                                        finger.z,
                                        fingerState.previousZ,
                                        deltaTime
                                    );

                                const landmarks =
                                    results.multiHandLandmarks[
                                        finger.handId
                                    ];

                                const distanceRatio =
                                    tracker.calculateDistanceRatio(
                                        landmarks[8],
                                        landmarks[6]
                                    );

                                const inflectionResult =
                                    tracker.detectYInflectionPoint(
                                        finger.y,
                                        fingerState.previousY,
                                        fingerState.previousVelocity || 0,
                                        deltaTime
                                    );

                                if(
                                    pressDetected &&
                                    Math.abs(zVelocity) >
                                    tracker.velocityThreshold &&
                                    inflectionResult.inflection
                                ){

                                    tracker.generateNoteEvent(
                                        key.keyID,
                                        key.pitch,
                                        true,
                                        Math.abs(zVelocity)
                                    );

                                }

                                fingerState.previousZ =
                                    finger.z;

                                fingerState.previousY =
                                    finger.y;

                                fingerState.previousVelocity =
                                    inflectionResult.yVelocity;

                                fingerState.lastTime =
                                    currentTime;

                                // ===== SRS 6 끝 =====


                        }

                    });

            }

            canvasCtx.beginPath();

            canvasCtx.arc(
                canvasPoint.x,
                canvasPoint.y,
                8,
                0,
                Math.PI * 2
            );

            canvasCtx.fillStyle = "cyan";
            canvasCtx.fill();

        });

    }

    // 흰 건반 렌더링

    pianoKeys
        .filter(key => key.keyType === "white")
        .forEach(key => {

            canvasCtx.fillStyle = key.pressed ? key.activeColor : key.idleColor;

            canvasCtx.fillRect(

                key.x,
                key.y,

                key.width,
                key.height

            );


            canvasCtx.strokeStyle = "rgba(255,255,255,0.25)";

            canvasCtx.lineWidth = 2;

            canvasCtx.strokeRect(

                key.x,
                key.y,

                key.width,
                key.height

            );


            canvasCtx.fillStyle = "black";

            canvasCtx.font = "18px Arial";
            canvasCtx.strokeStyle = "rgba(255,255,255,0.25)";
            canvasCtx.lineWidth = 2;
            canvasCtx.strokeRect(key.x, key.y, key.width, key.height);

            // [SRS 4.4 적용] showLabels가 true일 때만 음계 글씨를 캔버스에 출력합니다.
            if (showLabels) {
                canvasCtx.fillStyle = "black";
                canvasCtx.font = "18px Arial";
                canvasCtx.fillText(
                    key.pitch,
                    key.x + (key.width / 2) - 10,
                    key.y + key.height - 180
                );
            }
        });

    // 검은 건반 렌더링 (하드코딩 제거 및 객체 속성 색상 적용 완료)
    pianoKeys
        .filter(key => key.keyType === "black")
        .forEach(key => {

            canvasCtx.fillStyle = key.pressed ? key.activeColor : key.idleColor;

            canvasCtx.fillRect(

                key.x,
                key.y,

                key.width,
                key.height
            );
            // 2. [SRS 4.4 ] 검은 건반에도 라벨 표시

            if (showLabels) {
                canvasCtx.fillStyle = "white";
                canvasCtx.font = "14px Arial";

                canvasCtx.fillText(
                    key.pitch,
                    key.x + (key.width / 2) - 14,
                    key.y + key.height - 20
                );
            }

        });

    // ROI 표시

    drawROI();
    // 손 랜드마크 덧그리기 (안전한 스택 관리를 위해 내부 save/restore 추가)
    canvasCtx.save();
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);

    allHands.forEach(landmarks => {

        drawConnectors(

            canvasCtx,
            landmarks,
            HAND_CONNECTIONS,

            {
                color:"#00FF00",
                lineWidth:4
            }

        );

        drawLandmarks(

            canvasCtx,
            landmarks,

            {
                color:"#FF0000",
                fillColor:"#00FF00",
                radius:5
            }

        );

    });
    canvasCtx.restore(); // 뼈대 미러링 상태 복구

    canvasCtx.restore();

    canvasCtx.fillStyle = "yellow";

    canvasCtx.font = "20px Arial";

    canvasCtx.fillText(

        `FPS : ${tracker.FramePerSecond.toFixed(1)}`,

        20,
        40

    );

    canvasCtx.fillText(

        `Latency : ${tracker.FrameLatency.toFixed(1)} ms`,

        20,
        70

    );

}

// MediaPipe Hands

const hands = new Hands({

    locateFile: (file) => {

        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;

    }

});


hands.setOptions({

    maxNumHands:2,

    modelComplexity:1,

    minDetectionConfidence:0.5,

    minTrackingConfidence:0.5

});


hands.onResults(onResults);

// 카메라

const camera = new Camera(videoElement, {

    onFrame: async () => {

        await hands.send({

            image: videoElement

        });

    },

    width:1000,
    height:700

});


camera.start();