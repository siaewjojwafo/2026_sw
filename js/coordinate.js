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
    const fingerIndexes = [4, 8, 12, 16, 20];

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
                x: smoothed.x,
                y: smoothed.y,
                z: smoothed.z
            });

        });

    });

    return fingerList;
}
