const monitorWidth = window.innerWidth;
const monitorHeight = window.innerHeight;

const isMirrorMode = false;  // 좌우 반전 보정 적용

let roiTopLeft = { x: 0.05, y: 0.05 };
let roiBottomRight = { x: 0.95, y: 0.95 };

const smoothingFactor = 0.35;
const pressThreshold = 0.03;

const previousCoordinates = {};


// 카메라-모니터 좌표계 정규화
function normalizeToMonitorCoordinates(
    landmarkX,
    landmarkY,
    monitorWidth,
    monitorHeight
){
    return {
        x: landmarkX * monitorWidth,
        y: landmarkY * monitorHeight
    };
}


// 미러링 로직
function applyMirroring(landmarkX, isMirrorMode){
    if(isMirrorMode){
        return 1 - landmarkX;
    }

    return landmarkX;
}


// 동적 보정 및 영역설정
function isInsideROI(
    roiTopLeft,
    roiBottomRight,
    userHandPosition
){
    return (
        userHandPosition.x >= roiTopLeft.x &&
        userHandPosition.x <= roiBottomRight.x &&
        userHandPosition.y >= roiTopLeft.y &&
        userHandPosition.y <= roiBottomRight.y
    );
}


// 좌표 재범위화
function remapToROI(
    landmarkX,
    landmarkY,
    roiTopLeft,
    roiBottomRight
){
    const roiWidth = roiBottomRight.x - roiTopLeft.x;
    const roiHeight = roiBottomRight.y - roiTopLeft.y;

    const normalizedX = (landmarkX - roiTopLeft.x) / roiWidth;
    const normalizedY = (landmarkY - roiTopLeft.y) / roiHeight;

    return {
        x: Math.max(0, Math.min(1, normalizedX)),
        y: Math.max(0, Math.min(1, normalizedY))
    };
}


// 노이즈 제거 및 스무딩 필터
function applySmoothingFilter(
    rawCoordinate,
    previousCoordinate,
    smoothingFactor
){
    if(!previousCoordinate){ // 첫 프레임은 현재 좌표 그대로 반환
        return rawCoordinate;
    }

    return {
        x:
            previousCoordinate.x +
            (rawCoordinate.x - previousCoordinate.x) * smoothingFactor,
            // 현재값 쪽으로 조금만 이동
        y:
            previousCoordinate.y +
            (rawCoordinate.y - previousCoordinate.y) * smoothingFactor,

        z:
            previousCoordinate.z !== undefined && rawCoordinate.z !== undefined
                ? previousCoordinate.z +
                  (rawCoordinate.z - previousCoordinate.z) * smoothingFactor
                : rawCoordinate.z
    };
}


// z축 깊이 기반 타건 감지
function detectPressByDepth(
    landmarkZ,
    previousZ,
    pressThreshold
){
    if(previousZ === undefined){ // 이전 Z 값 없으면 비교 불가
        return false;
    }

    const currentZVelocity = landmarkZ - previousZ;

    return currentZVelocity < -pressThreshold;
}



// 종횡비 왜곡 보정(카메라 화면 비율 모니터 비율 다를때 좌표 왜곡 줄이는)
function correctAspectRatio(
    landmarkX,
    landmarkY,
    cameraAspectRatio,
    monitorAspectRatio
){
    let correctedX = landmarkX;
    let correctedY = landmarkY;
    let scaleFactor = 1;

    if(cameraAspectRatio > monitorAspectRatio){
        scaleFactor = monitorAspectRatio / cameraAspectRatio;
        correctedX = 0.5 + (landmarkX - 0.5) * scaleFactor;
    }
    else if(cameraAspectRatio < monitorAspectRatio){
        scaleFactor = cameraAspectRatio / monitorAspectRatio;
        correctedY = 0.5 + (landmarkY - 0.5) * scaleFactor;
    }

    return {
        x: correctedX,
        y: correctedY,
        scaleFactor: scaleFactor
    };
}


// 다중 손가락 독립 좌표 추적
function trackMultipleFingers(
    multiHandLandmarks,
    monitorWidth,
    monitorHeight
){
    const fingerList = [];
    const fingerIndexes = [4, 8, 12, 16, 20]; // 26.06.20 윤혜원 수정

    multiHandLandmarks.forEach((handLandmarks, handIndex) => {

        fingerIndexes.forEach((fingerIndex) => {

            let landmarkX = handLandmarks[fingerIndex].x;
            let landmarkY = handLandmarks[fingerIndex].y;
            let landmarkZ = handLandmarks[fingerIndex].z;

            landmarkX = applyMirroring(
                landmarkX,
                isMirrorMode
            );

            const aspectResult = correctAspectRatio(
                landmarkX,
                landmarkY,
                canvasElement.width / canvasElement.height,
                monitorWidth / monitorHeight
            );

            const insideROI = isInsideROI(
                roiTopLeft,
                roiBottomRight,
                {
                    x: aspectResult.x,
                    y: aspectResult.y
                }
            );

            if(!insideROI){
                return;
            }

            const roiCoordinate = remapToROI(
                aspectResult.x,
                aspectResult.y,
                roiTopLeft,
                roiBottomRight
            );

            const monitorCoordinate = normalizeToMonitorCoordinates(
                roiCoordinate.x,
                roiCoordinate.y,
                monitorWidth,
                monitorHeight
            );

            const trackId = `${handIndex}_${fingerIndex}`;
            const previous = previousCoordinates[trackId];

            const smoothed = applySmoothingFilter(
                {
                    x: monitorCoordinate.x,
                    y: monitorCoordinate.y,
                    z: landmarkZ
                },
                previous,
                smoothingFactor
            );

            previousCoordinates[trackId] = smoothed;

            fingerList.push({
                handId: handIndex,
                fingerIndex: fingerIndex,
                fingerId: trackId, // 2026.06.10 CES 추가
                x: smoothed.x,
                y: smoothed.y,
                z: smoothed.z
            });

        });

    });

    return fingerList;
}


// 2026.06.10 CES 추가(시작)
const fingerSelectionState = {};
let collisionFrameIndex = 0;
const boundaryMargin = 12;


// 프레임 번호를 순차적으로 관리
function nextCollisionFrameIndex(){
    collisionFrameIndex += 1;
    return collisionFrameIndex;
}


// 손가락별 이전 선택 상태를 반환
function getFingerState(fingerId){

    if(!fingerSelectionState[fingerId]){

        fingerSelectionState[fingerId] = {
            previousX: null,
            previousY: null,
            currentX: null,
            currentY: null,
            deltaX: 0,
            deltaY: 0,
            movementDirection: "stationary",
            previousSelectedKey: null,
            frameIndex: -1
        };

    }

    return fingerSelectionState[fingerId];

}


// 손가락의 이전/현재 좌표와 이동량을 갱신
function updateFingerState(
    fingerId,
    fingerTipX,
    fingerTipY,
    frameIndex
){
    const state = getFingerState(fingerId);

    state.previousX = state.currentX;
    state.previousY = state.currentY;
    state.currentX = fingerTipX;
    state.currentY = fingerTipY;
    state.frameIndex = frameIndex;

    if(state.previousX === null || state.previousY === null){
        state.deltaX = 0;
        state.deltaY = 0;
        state.movementDirection = "stationary";
        return state;
    }

    state.deltaX = state.currentX - state.previousX;
    state.deltaY = state.currentY - state.previousY;
    state.movementDirection = getMovementDirection(
        state.deltaX,
        state.deltaY
    );

    return state;
}


// 손가락의 주 이동 방향을 계산
function getMovementDirection(deltaX, deltaY){
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const movementThreshold = 2;

    if(absX < movementThreshold && absY < movementThreshold){
        return "stationary";
    }

    if(absX >= absY){
        return deltaX >= 0 ? "right" : "left";
    }

    return deltaY >= 0 ? "down" : "up";
}


// 좌표가 건반 영역 내부에 있는지 확인
function isPointInsideKeyRect(
    fingerTipX,
    fingerTipY,
    keyRect
){
    return (
        fingerTipX >= keyRect.left &&
        fingerTipX <= keyRect.right &&
        fingerTipY >= keyRect.top &&
        fingerTipY <= keyRect.bottom
    );
}


// 보정 마진을 포함한 건반 영역 내부 여부를 확인
function isPointInsideExpandedKeyRect(
    fingerTipX,
    fingerTipY,
    keyRect,
    padding
){
    return (
        fingerTipX >= keyRect.left - padding &&
        fingerTipX <= keyRect.right + padding &&
        fingerTipY >= keyRect.top - padding &&
        fingerTipY <= keyRect.bottom + padding
    );
}


// 좌표가 건반 경계 근처인지 판별
function isNearKeyBoundary(
    fingerTipX,
    fingerTipY,
    keyRect,
    boundaryMargin
){
    const nearLeft = Math.abs(fingerTipX - keyRect.left) <= boundaryMargin;
    const nearRight = Math.abs(fingerTipX - keyRect.right) <= boundaryMargin;
    const nearTop = Math.abs(fingerTipY - keyRect.top) <= boundaryMargin;
    const nearBottom = Math.abs(fingerTipY - keyRect.bottom) <= boundaryMargin;

    return (

        isPointInsideExpandedKeyRect(
            fingerTipX,
            fingerTipY,
            keyRect,
            boundaryMargin
        ) &&
        (nearLeft || nearRight || nearTop || nearBottom)

    );
}


// zIndex 기준으로 건반 우선순위를 정렬
function sortKeysForCollision(keys){

    return keys.slice().sort((a, b) => {

        const aPriority = a.keyType === "black" ? 1 : 0;
        const bPriority = b.keyType === "black" ? 1 : 0;

        if (bPriority !== aPriority) {
           return bPriority - aPriority;
        }

        if ((b.zIndex || 0) !== (a.zIndex || 0)) {
            return (b.zIndex || 0) - (a.zIndex || 0);
        }

        return a.keyID - b.keyID;

    });

}


// 손가락 좌표에 대한 1차 후보 건반을 찾는
function findCandidateKey(
    fingerTipX,
    fingerTipY,
    keys
){
    const sortedKeys = sortKeysForCollision(keys);

    for(const key of sortedKeys){
        const padding = key.keyType === "black" ? 3 : 5;

        if(
            isPointInsideExpandedKeyRect(
                fingerTipX,
                fingerTipY,
                key.keyRect,
                padding
            )
        ){
            return key;
        }
    }

    return null;
}


// 실제 건반 영역 내부에 포함되는 건반을 찾는
function findExactContainingKey(
    fingerTipX,
    fingerTipY,
    keys
){
    const sortedKeys = sortKeysForCollision(keys);

    for(const key of sortedKeys){
        if(
            isPointInsideKeyRect(
                fingerTipX,
                fingerTipY,
                key.keyRect
            )
        ){
            return key;
        }
    }

    return null;
}


// 경계 영역에서 이전 선택 건반을 우선 보정
function applyBoundaryCompensation(
    fingerTipX,
    fingerTipY,
    previousSelectedKey,
    currentCandidateKey,
    boundaryMargin,
    keys
){
    if(!currentCandidateKey){
        return null;
    }

    if(!previousSelectedKey){
        return currentCandidateKey;
    }

    if(previousSelectedKey.keyID === currentCandidateKey.keyID){
        return currentCandidateKey;
    }

    const refreshedPreviousKey = keys.find(
        key => key.keyID === previousSelectedKey.keyID
    );

    if(!refreshedPreviousKey){
        return currentCandidateKey;
    }

    const isNearCurrentBoundary = isNearKeyBoundary(
        fingerTipX,
        fingerTipY,
        currentCandidateKey.keyRect,
        boundaryMargin
    );

    const isStillNearPrevious = isPointInsideExpandedKeyRect(
        fingerTipX,
        fingerTipY,
        refreshedPreviousKey.keyRect,
        boundaryMargin
    );

    if(isNearCurrentBoundary && isStillNearPrevious){
        return refreshedPreviousKey;
    }

    return currentCandidateKey;
}


// 이동량을 기준으로 선택 건반을 안정화
function stabilizeSelectionByMovement(
    fingerState,
    selectedKey,
    keys
){
    if(!selectedKey){
        return null;
    }

    if(!fingerState.previousSelectedKey){
        return selectedKey;
    }

    if(selectedKey.keyID === fingerState.previousSelectedKey.keyID){
        return selectedKey;
    }

    const previousKey = keys.find(
        key => key.keyID === fingerState.previousSelectedKey.keyID
    );

    if(!previousKey){
        return selectedKey;
    }

    const movementIsSmall =
        Math.abs(fingerState.deltaX) < 4 &&
        Math.abs(fingerState.deltaY) < 4;

    const stillInsidePrevious = isPointInsideExpandedKeyRect(
        fingerState.currentX,
        fingerState.currentY,
        previousKey.keyRect,
        6
    );

    if(movementIsSmall && stillInsidePrevious){
        return previousKey;
    }

    return selectedKey;
}


// 손가락 흐름을 반영해 최종 선택 건반을 결정
function selectKeyByFingerFlow(
    fingerTipX,
    fingerTipY,
    fingerId,
    frameIndex,
    keys
){
    const fingerState = updateFingerState(
        fingerId,
        fingerTipX,
        fingerTipY,
        frameIndex
    );

    const exactContainingKey = findExactContainingKey(
        fingerTipX,
        fingerTipY,
        keys
    );

    const currentCandidateKey =
        exactContainingKey ||
        findCandidateKey(
            fingerTipX,
            fingerTipY,
            keys
        );

    let selectedKey = applyBoundaryCompensation(
        fingerTipX,
        fingerTipY,
        fingerState.previousSelectedKey,
        currentCandidateKey,
        boundaryMargin,
        keys
    );

    selectedKey = stabilizeSelectionByMovement(
        fingerState,
        selectedKey,
        keys
    );

    fingerState.previousSelectedKey = selectedKey || null;

    return {
        fingerState,
        currentCandidateKey,
        selectedKey
    };
}


// 여러 손가락의 충돌 판정 결과를 한 번에 처리
function processFingerKeySelections(
    fingerList,
    pianoKeys,
    frameIndex
){
    const collisionResults = [];
    const simultaneousFingerCount = fingerList.length;

    fingerList.forEach(finger => {

        const canvasPoint = monitorToCanvas(
            finger.x,
            finger.y
        );

        const selectionResult = selectKeyByFingerFlow(
            canvasPoint.x,
            canvasPoint.y,
            finger.fingerId,
            frameIndex,
            pianoKeys
        );

        const selectedKey = selectionResult.selectedKey;

        if(selectedKey){
            selectedKey.pressed = true;
            selectedKey.isPressed = true;
        }

        collisionResults.push({
            fingerId: finger.fingerId,
            fingerIndex: finger.fingerIndex,
            handId: finger.handId,
            frameIndex: frameIndex,
            fingerTipX: canvasPoint.x,
            fingerTipY: canvasPoint.y,
            previousX: selectionResult.fingerState.previousX,
            previousY: selectionResult.fingerState.previousY,
            currentX: selectionResult.fingerState.currentX,
            currentY: selectionResult.fingerState.currentY,
            deltaX: selectionResult.fingerState.deltaX,
            deltaY: selectionResult.fingerState.deltaY,
            movementDirection: selectionResult.fingerState.movementDirection,
            previousSelectedKey: selectionResult.fingerState.previousSelectedKey,
            currentCandidateKey:
                selectionResult.currentCandidateKey
                    ? selectionResult.currentCandidateKey.keyID
                    : null,
            selectedKey:
                selectedKey
                    ? selectedKey.keyID
                    : null,
            selectedPitch:
                selectedKey
                    ? selectedKey.pitch
                    : null,
            collisionState:
                selectedKey
                    ? "selected"
                    : "none",
            simultaneousFingerCount: simultaneousFingerCount
        });

    });

    return collisionResults;
} // 2026.06.10 CES 추가(끝)