(() => {
    const canvas = document.querySelector(".output_canvas");
    if (!canvas) return;

    const stage = document.createElement("div");
    stage.style.position = "relative";
    canvas.before(stage);
    stage.appendChild(canvas);
    canvas.style.display = "block";

    const guide = document.createElement("div");
    guide.id = "hand-guide";
    guide.hidden = true;
    Object.assign(guide.style, {
        position: "absolute", inset: "0", pointerEvents: "none"
    });

    const outline = `M 65 300
        L 62 266 Q 35 238 30 208
        L 12 130 Q 9 112 23 109 Q 36 107 40 124 L 56 175
        L 47 76 Q 46 58 60 57 Q 74 56 76 73 L 87 160
        L 87 40 Q 87 22 102 22 Q 117 22 117 40 L 119 156
        L 130 63 Q 132 45 146 47 Q 161 49 158 67 L 151 186
        L 181 154 Q 194 139 205 150 Q 216 160 204 175
        L 172 220 Q 160 246 147 263 L 145 300 Z`;

    guide.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700"
             width="100%" height="100%" role="img" aria-labelledby="hand-guide-title">
            <title id="hand-guide-title">건반 위에 왼손과 오른손을 올리는 위치 예시</title>
            <g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"
               stroke-linejoin="round" stroke-dasharray="none"
               style="filter: drop-shadow(0 1px 2px #000)">
                <path data-hand="left" transform="translate(135 580) scale(1.35 -1.35)" d="${outline}" />
                <path data-hand="right" transform="translate(865 580) scale(-1.35 -1.35)" d="${outline}" />
            </g>
            <g fill="#fff" text-anchor="middle"
               style='font: 20px Pretendard, "Malgun Gothic", sans-serif; filter: drop-shadow(0 1px 2px #000)'>
                <text x="500" y="135">예시처럼 건반 위에 양손을 올려 주세요</text>
                <text x="275" y="590">왼손</text>
                <text x="725" y="590">오른손</text>
            </g>
        </svg>
    `;
    stage.appendChild(guide);

    let hideTimer;
    document.getElementById("pedal-popup").addEventListener("close", () => {
        clearTimeout(hideTimer);
        guide.hidden = false;
        hideTimer = setTimeout(() => { guide.hidden = true; }, 5000);
    });
})();