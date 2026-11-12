(() => {
    const style = document.createElement("style");
    style.textContent = `
        #pedal-popup {
            position: fixed;
            inset: 0;
            margin: auto;
            box-sizing: border-box;
            width: min(560px, calc(100% - 32px));
            max-height: calc(100% - 32px);
            overflow: auto;
            overscroll-behavior: contain;
            padding: 32px 24px;
            border: 1px solid rgba(255, 255, 255, 0.6);
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.8);
            color: #000;
            text-align: center;
            font-family: Pretendard, -apple-system, BlinkMacSystemFont,
                "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif;
            word-break: keep-all;
            line-height: 1.8;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
        }
        #pedal-popup::backdrop { background: rgba(0, 0, 0, 0.15); }
        #pedal-popup h2 { margin: 0 0 20px; font-size: 22px; text-wrap: balance; }
        #pedal-popup p { margin: 10px 0; font-size: 16px; }
        #pedal-popup button {
            margin-top: 20px;
            min-height: 44px;
            padding: 8px 28px;
            border: 1px solid #000;
            border-radius: 8px;
            background: transparent;
            color: #000;
            font: inherit;
            cursor: pointer;
            touch-action: manipulation;
        }
        #pedal-popup button:hover { background: rgba(255, 255, 255, 0.5); }
        #pedal-popup button:focus-visible { outline: 3px solid #000; outline-offset: 4px; }
    `;
    document.head.appendChild(style);

    const popup = document.createElement("dialog");
    popup.id = "pedal-popup";
    popup.setAttribute("aria-labelledby", "pedal-popup-title");
    popup.setAttribute("aria-describedby", "pedal-popup-description");
    popup.innerHTML = `
        <h2 id="pedal-popup-title">페달 단축키 안내</h2>
        <div id="pedal-popup-description">
            <p>소프트 페달(왼쪽 페달) 기능은 q,</p>
            <p>소스테누토 페달(가운데 페달) 기능은 w,</p>
            <p>포르테 페달(오른쪽 페달) 기능은 e 키를 누르면 사용 가능합니다.</p>
        </div>
        <button type="button" autofocus>닫기</button>
    `;
    popup.querySelector("button").addEventListener("click", () => popup.close());
    document.body.appendChild(popup);
    popup.showModal();
})();
