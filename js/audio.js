class PianoAudioEngine {
    constructor(){
        // [7.1.2 실시간 오디오 출력 처리] Web Audio API 실행 환경과 저지연 출력 지표
        this.audioContext = null;
        this.audioEngineType = "WebAudio";
        this.sampleRate = 44100;
        this.bufferSize = 256;
        this.outputLatency = 0;

        // [7.1.1 음원 파일 매핑 및 관리] 건반-음원 매핑, 디코딩 캐시, 재생 중인 음원 풀
        this.keyMap = new Map();
        this.audioCache = new Map();
        this.activeAudioPool = new Map();

        // [7.2.1 중복 입력 및 떨림 보정] 건반별 마지막 Trigger 시각을 저장
        this.lastTriggeredTimestamp = new Map();

        // [7.1.1, 7.1.3, 7.4] 캐시/동시 입력/채널/리소스 상태 값
        this.preloadState = false;
        this.cacheSize = 0;
        this.activeNoteCount = 0;
        this.simultaneousInputLimit = 10;
        this.channelIndex = 0;

        // [7.2.1, 7.2.2, 7.3.1, 7.4] 입력 안정화, 릴리즈, 음량 민감도, 리소스 제한 설정
        this.debounceTime = 70;
        this.cooldownTime = 70;
        this.releaseThreshold = 0.05;
        this.fadeOutDuration = 0.12;
        this.sensitivity = 1.4;
        this.maxLoadedSounds = 32;
        this.cpuUsageThreshold = 0.75;
        this.memoryUsage = 0;

        // [7.3.2 음 재생 상태 시각화] 재생 중인 건반에 적용할 강조 색상과 애니메이션 시간
        this.highlightColor = "rgba(255, 215, 0, 0.92)";
        this.animationDuration = 120;
    }

    // [7.1.2 실시간 오디오 출력 처리]
    // 브라우저의 Web Audio API 컨텍스트를 저지연(interactive) 모드로 초기화
    init(){
        if(this.audioContext){
            return this.audioContext;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;

        if(!AudioContextClass){
            console.warn("Web Audio API를 지원하지 않아 음 재생을 사용할 수 없습니다.");
            return null;
        }

        this.audioContext = new AudioContextClass({ latencyHint: "interactive" });
        this.sampleRate = this.audioContext.sampleRate;
        this.outputLatency = this.audioContext.outputLatency || 0;

        return this.audioContext;
    }

    // [7.1.2 실시간 오디오 출력 처리]
    // 브라우저 자동재생 정책으로 정지된 AudioContext를 사용자 입력 후 재개
    unlock(){
        const context = this.init();

        if(context && context.state === "suspended"){
            context.resume();
        }
    }

    // [7.1.1 음원 파일 매핑 및 관리]
    // 현재 화면에 생성된 피아노 건반마다 noteName/audioFilePath를 매핑하고 음원 파일을 메모리에 캐싱
    preload(keys){
        this.init();
        this.keyMap.clear();

        keys.forEach(key => {
            const audioFilePath = this.getAudioFilePath(key.pitch);

            // [7] 재생 Trigger에 필요한 입력/상태 필드를 건반 객체에도 명시
            key.noteName = key.pitch;
            key.audioFilePath = audioFilePath;
            key.preloadState = true;
            key.cacheSize = this.cacheSize;
            key.pressState = false;
            key.velocityValue = 0;
            key.volumeLevel = 0;
            key.releaseState = true;
            key.activeKeyState = false;
            key.highlightColor = this.highlightColor;
            key.animationDuration = this.animationDuration;

            this.keyMap.set(key.keyID, {
                keyId: key.keyID,
                noteName: key.pitch,
                midiNoteNumber: key.midiNoteNumber,
                audioFilePath: audioFilePath,
                preloadState: true
            });

            if(!this.audioCache.has(key.pitch)){
                const cachedSound = {
                    audioFilePath: audioFilePath,
                    frequency: this.midiToFrequency(key.midiNoteNumber),
                    preloadState: false,
                    audioBuffer: null
                };

                this.audioCache.set(key.pitch, cachedSound);
                this.loadAudioBuffer(key.pitch, cachedSound);
            }
        });

        // [7.4 오디오 성능 최적화 및 리소스 관리] 현재 캐시 크기와 메모리 사용 지표를 갱신
        this.cacheSize = this.audioCache.size;
        this.preloadState = true;
        this.memoryUsage = this.cacheSize;
    }

    // [7.1.1 음원 파일 매핑 및 관리]
    // C# 같은 반음 표기를 파일명에 안전한 Cs 형태로 변환하여 wav 경로를 만듦.
    getAudioFilePath(noteName){
        return `./piano_audio/${noteName.replace("#", "s")}.wav`;
    }

    // [7.1.1 음원 파일 매핑 및 관리]
    // wav 파일을 fetch/decodeAudioData로 미리 디코딩해 오디오 버퍼 캐시에 저장
    loadAudioBuffer(noteName, cachedSound){
        const context = this.init();

        if(!context){
            return;
        }

        fetch(cachedSound.audioFilePath)
            .then(response => {
                if(!response.ok){
                    throw new Error(`${cachedSound.audioFilePath} 로드 실패`);
                }

                return response.arrayBuffer();
            })
            .then(arrayBuffer => context.decodeAudioData(arrayBuffer))
            .then(audioBuffer => {
                cachedSound.audioBuffer = audioBuffer;
                cachedSound.preloadState = true;
                this.cacheSize = Array.from(this.audioCache.values())
                    .filter(sound => sound.preloadState).length;
                this.preloadState = this.cacheSize > 0;
                this.memoryUsage = this.cacheSize;
            })
            .catch(error => {
                // [7.1.2 실시간 오디오 출력 처리] 파일 로드 실패 시에도 즉시 재생이 가능하도록 합성음 경로를 유지
                cachedSound.preloadState = false;
                console.warn(`[SRS 7.1.1] ${noteName} 음원 파일 대신 합성음을 사용합니다.`, error);
            });
    }

    // [7.1.1 음원 파일 매핑 및 관리]
    // 파일 로드 실패 시 대체 합성음을 만들 수 있도록 MIDI 번호를 주파수로 변환
    midiToFrequency(midiNoteNumber){
        return 440 * Math.pow(2, (midiNoteNumber - 69) / 12);
    }

    // [7.3.1 입력 강도 기반 음량 조절]
    // 손가락 y좌표 변화량(deltaY)을 fingerVelocity로 변환하고 최종 velocityValue/volumeLevel 계산에 사용
    calculateVelocity(finger, previousFinger){
        if(!previousFinger){
            return 0.55;
        }

        const deltaY = Math.abs(finger.y - previousFinger.y);
        const fingerVelocity = Math.min(1, deltaY / 45);
        const velocityValue = Math.max(0.25, Math.min(1, fingerVelocity * this.sensitivity));

        finger.fingerVelocity = fingerVelocity;
        finger.deltaY = deltaY;
        finger.velocityValue = velocityValue;

        return velocityValue;
    }

    // 하나의 건반 입력을 실제 소리로 변환
    // - pressState/velocityValue를 반영
    // - cooldownTime으로 손 떨림 중복 Trigger를 제한
    // - activeAudioPool을 통해 여러 건반을 동시에 재생
    playKey(key, velocityValue = 0.6){
        const context = this.init();

        if(!context){
            return;
        }

        this.unlock();

        const now = performance.now();
        const lastTriggered = this.lastTriggeredTimestamp.get(key.keyID) || 0;
        const existingVoice = this.activeAudioPool.get(key.keyID);

        // [7] 외부에서 추적 가능한 재생 입력/상태 필드를 최신 값으로 갱신
        key.keyId = key.keyID;
        key.noteName = key.pitch;
        key.pressState = true;
        key.velocityValue = velocityValue;
        key.volumeLevel = Math.max(0.05, Math.min(1, velocityValue));
        key.activeKeyState = true;
        key.releaseState = false;
        key.audioEngineType = this.audioEngineType;
        key.sampleRate = this.sampleRate;
        key.bufferSize = this.bufferSize;
        key.outputLatency = this.outputLatency;
        key.activeNoteCount = this.activeAudioPool.size;
        key.simultaneousInputLimit = this.simultaneousInputLimit;
        key.channelIndex = existingVoice ? existingVoice.channelIndex : this.channelIndex;
        key.debounceTime = this.debounceTime;
        key.cooldownTime = this.cooldownTime;
        key.lastTriggeredTimestamp = now;

        // [7.3.1] 이미 재생 중인 동일 건반은 새 음을 만들지 않고 볼륨만 갱신
        if(existingVoice && !existingVoice.releasing){
            existingVoice.gain.gain.setTargetAtTime(key.volumeLevel, context.currentTime, 0.015);
            return;
        }

        if(existingVoice && existingVoice.releasing){
            this.activeAudioPool.delete(key.keyID);
        }

        // [7.2.1] 같은 건반이 너무 짧은 시간 안에 반복 Trigger되는 현상을 방지
        if(now - lastTriggered < this.cooldownTime){
            return;
        }

        // [7.1.3, 7.4] 동시 재생 가능한 최대 채널 수를 제한해 CPU/메모리 부하를 제어
        if(this.activeAudioPool.size >= this.simultaneousInputLimit){
            return;
        }

        const cachedSound = this.audioCache.get(key.pitch) || {
            frequency: this.midiToFrequency(key.midiNoteNumber),
            audioFilePath: this.getAudioFilePath(key.pitch)
        };

        const gain = context.createGain();

        // [7.1.2] 캐시된 wav가 있으면 BufferSource, 없으면 Oscillator 합성음으로 저지연 출력
        const source = cachedSound.audioBuffer
            ? context.createBufferSource()
            : context.createOscillator();

        if(cachedSound.audioBuffer){
            source.buffer = cachedSound.audioBuffer;
        }
        else{
            source.type = "sine";
            source.frequency.setValueAtTime(cachedSound.frequency, context.currentTime);
        }

        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(key.volumeLevel, context.currentTime + 0.01);

        source.connect(gain);
        gain.connect(context.destination);
        source.start();

        const voice = {
            source: source,
            gain: gain,
            startedAt: context.currentTime,
            keyId: key.keyID,
            noteName: key.pitch,
            velocityValue: velocityValue,
            channelIndex: this.channelIndex++
        };

        this.activeAudioPool.set(key.keyID, voice);
        this.lastTriggeredTimestamp.set(key.keyID, now);
        this.activeNoteCount = this.activeAudioPool.size;
        key.activeAudioPool = this.activeAudioPool.size;
    }

    // [7.2.2 음 재생 종료 처리]
    // 손가락이 건반에서 벗어나거나 release 이벤트가 감지되면 Fade-out 후 음원을 정지/해제
    releaseKey(key){
        const context = this.audioContext;
        const voice = this.activeAudioPool.get(key.keyID);

        key.pressState = false;
        key.releaseState = true;
        key.releaseThreshold = this.releaseThreshold;
        key.fadeOutDuration = this.fadeOutDuration;
        key.activeKeyState = false;
        key.volumeLevel = 0;

        if(!context || !voice || voice.releasing){
            return;
        }

        voice.releasing = true;

        const releaseAt = context.currentTime + this.fadeOutDuration;

        voice.gain.gain.cancelScheduledValues(context.currentTime);
        voice.gain.gain.setTargetAtTime(0.0001, context.currentTime, this.fadeOutDuration / 3);
        voice.source.stop(releaseAt);
        voice.source.onended = () => {
            // [7.4] 종료된 음원은 activeAudioPool에서 제거해 리소스를 반환
            if(this.activeAudioPool.get(key.keyID) === voice){
                this.activeAudioPool.delete(key.keyID);
            }
            this.activeNoteCount = this.activeAudioPool.size;
            key.activeAudioPool = this.activeAudioPool.size;
        };
    }

    // [7.1.3, 7.2.2, 7.3.2]
    // 한 프레임에서 감지된 모든 눌림 상태를 기준으로 재생/종료와 건반 하이라이트를 동기화
    syncPressedKeys(pressedKeyStates){
        pianoKeys.forEach(key => {
            const nextState = pressedKeyStates.get(key.keyID);

            if(nextState){
                this.playKey(key, nextState.velocityValue);
                key.pressed = true;
                key.activeColor = key.keyType === "black" ? "rgba(255, 180, 0, 0.95)" : this.highlightColor;
            }
            else{
                key.pressed = false;
                this.releaseKey(key);
                key.activeColor = key.keyType === "black" ? "rgba(139, 0, 0, 0.95)" : "rgba(180, 180, 180, 0.85)";
            }
        });
    }

    // [7.2.2, 7.4]
    // 추적 초기화/화면 전환 등 전체 음원을 즉시 정리해야 할 때 사용
    releaseAll(){
        pianoKeys.forEach(key => this.releaseKey(key));
    }
}

// [7 음 재생] hand tracking 코드에서 공유할 전역 오디오 엔진 인스턴스
const pianoAudioEngine = new PianoAudioEngine();

// [7.1.2 실시간 오디오 출력 처리]
// 최초 사용자 제스처에서 AudioContext를 unlock하여 이후 입력 지연을 줄임
["pointerdown", "touchstart", "click", "keydown"].forEach(eventName => {
    window.addEventListener(eventName, () => pianoAudioEngine.unlock(), { once: true });
});
