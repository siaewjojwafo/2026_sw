//22312282윤나영05.30
class TrackingManager {

    constructor() {

        // 2.1.1

        this.max_num_hands = 2;

        this.min_detection_confidence = 0.5;

        // 2.1.3

        this.MissingFrameCount = 0;

        this.ThresholdFrame = 30;

        this.trackedHands = {};

        // 2.2

        this.LandmarkModel = "Full";

        this.min_tracking_confidence = 0.5;

        // 2.2.2

        this.Alpha = 0.7;

        this.previousLandmarks = [];

        // 2.2.4

        this.previousTip = null;

        // 2.2.5

        this.lastFrameTime = performance.now();

        this.FramePerSecond = 0;

        this.FrameLatency = 0;

    }

    // ======================
    // 2.1.1 손 존재 감지
    // ======================

    detectHands(results){

        if(
            !results.multiHandLandmarks ||
            results.multiHandLandmarks.length === 0
        ){

            this.MissingFrameCount++;

            if(
                this.MissingFrameCount >
                this.ThresholdFrame
            ){

                this.resetTracking();

            }

            return false;
        }

        this.MissingFrameCount = 0;

        return true;
    }

    // ======================
    // 2.1.2 좌우 손 구분
    // ======================

    detectHandedness(results){

        if(!results.multiHandedness){

            return;
        }

        results.multiHandedness.forEach(

            (hand,index)=>{

                const label =
                    hand.label;

                const confidence =
                    hand.score;

                const handID =
                    `${label}_${index}`;

                this.trackedHands[handID] = {

                    label,
                    confidence

                };

            }

        );

    }

    // ======================
    // 2.1.3 초기화
    // ======================

    resetTracking(){

        this.trackedHands = {};

        this.previousLandmarks = [];

        this.previousTip = null;

        console.log(
            "Tracking Reset"
        );
    }

    // ======================
    // 2.2.2 필터링
    // ======================

    smoothLandmarks(landmarks){

        return landmarks.map(

            (point,index)=>{

                if(
                    !this.previousLandmarks[index]
                ){

                    this.previousLandmarks[index] = {

                        x:point.x,
                        y:point.y,
                        z:point.z

                    };

                }

                const filteredX =

                    this.Alpha * point.x +

                    (1-this.Alpha)
                    * this.previousLandmarks[index].x;

                const filteredY =

                    this.Alpha * point.y +

                    (1-this.Alpha)
                    * this.previousLandmarks[index].y;

                const filteredZ =

                    this.Alpha * point.z +

                    (1-this.Alpha)
                    * this.previousLandmarks[index].z;

                this.previousLandmarks[index] = {

                    x:filteredX,
                    y:filteredY,
                    z:filteredZ

                };

                return this.previousLandmarks[index];

            }

        );

    }

    // ======================
    // 2.2.3 Presence 검사
    // ======================

    checkPresence(point){

        return (

            point.x >= 0 &&
            point.x <= 1 &&

            point.y >= 0 &&
            point.y <= 1

        );

    }

    // ======================
    // 2.2.4 관절 각도
    // ======================

    calculateAngle(a,b,c){

        const ab = {

            x:a.x-b.x,
            y:a.y-b.y

        };

        const cb = {

            x:c.x-b.x,
            y:c.y-b.y

        };

        const dot =

            ab.x * cb.x +
            ab.y * cb.y;

        const mag1 = Math.sqrt(

            ab.x*ab.x +
            ab.y*ab.y

        );

        const mag2 = Math.sqrt(

            cb.x*cb.x +
            cb.y*cb.y

        );

        return Math.acos(

            dot /
            (mag1 * mag2)

        ) * 180 / Math.PI;

    }

    // ======================
    // 2.2.4 속도 계산
    // ======================

    calculateVelocity(tip){

        if(!this.previousTip){

            this.previousTip = tip;

            return 0;
        }

        const dx =

            tip.x -
            this.previousTip.x;

        const dy =

            tip.y -
            this.previousTip.y;

        const distance =

            Math.sqrt(
                dx*dx +
                dy*dy
            );

        const velocity =

            distance /
            (this.FrameLatency / 1000);

        this.previousTip = tip;

        return velocity;
    }

    // ======================
    // 2.2.5 FPS
    // ======================

    updatePerformance(){

        const currentTime =

            performance.now();

        this.FrameLatency =

            currentTime -
            this.lastFrameTime;

        this.FramePerSecond =

            1000 /
            this.FrameLatency;

        this.lastFrameTime =

            currentTime;

    }

}