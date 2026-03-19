const translations = {
    en: { ready: "Ready", streaming: "Streaming", lang: "PL", l_temp: "Color Temp (Kelvin)", l_bright: "Color Brightness", l_close: "Turn Off Light" },
    pl: { ready: "Gotowe", streaming: "Kamera Włączona", lang: "EN", l_temp: "Barwa Światła (Zimna-Ciepła)", l_bright: "Jasność Szarości", l_close: "Wyłącz Lampę" }
};
let currentLang = 'en';

const videoEl = document.getElementById('preview');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const startBtn = document.getElementById('start-btn');
const cameraPills = document.getElementById('camera-pills');
const langBtn = document.getElementById('lang-btn');

let ws = null;
let currentStream = null;
let isStreaming = false;
let activeDeviceId = null;
let activeDeviceBtn = null;

let canvas = document.createElement('canvas');
let ctx = canvas.getContext('2d', { willReadFrequently: true });

function toggleLang() {
    currentLang = currentLang === 'en' ? 'pl' : 'en';
    updateUI();
    getCameras();
}

function updateUI() {
    langBtn.textContent = translations[currentLang].lang;
    statusText.textContent = isStreaming ? translations[currentLang].streaming : translations[currentLang].ready;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLang][key]) el.textContent = translations[currentLang][key];
    });
}

function colorTemperatureToRGB(kelvin) {
    let temp = kelvin / 100;
    let red, green, blue;
    if (temp <= 66) {
        red = 255;
        green = temp;
        green = 99.4708025861 * Math.log(green) - 161.1195681661;
        if (temp <= 19) blue = 0;
        else {
            blue = temp - 10;
            blue = 138.5177312231 * Math.log(blue) - 305.0447927307;
        }
    } else {
        red = temp - 60;
        red = 329.698727446 * Math.pow(red, -0.1332047592);
        green = temp - 60;
        green = 288.1221695283 * Math.pow(green, -0.0755148492);
        blue = 255;
    }
    return {
        r: Math.max(0, Math.min(255, red)),
        g: Math.max(0, Math.min(255, green)),
        b: Math.max(0, Math.min(255, blue))
    };
}

function updateLight() {
    const bValue = parseInt(document.getElementById('light-brightness').value) / 100;
    const tValue = parseInt(document.getElementById('light-temp').value);
    
    const rgb = colorTemperatureToRGB(tValue);
    const r = Math.round(rgb.r * bValue);
    const g = Math.round(rgb.g * bValue);
    const b = Math.round(rgb.b * bValue);
    
    const overlay = document.getElementById('screen-light-overlay');
    overlay.style.setProperty('background-color', `rgb(${r}, ${g}, ${b})`, 'important');
}

async function getCameras() {
    try {
        const dummyStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        dummyStream.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        cameraPills.innerHTML = '';
        
        let hasFront = false;
        let backCount = 1;

        videoDevices.forEach((device) => {
            const isFront = device.label.toLowerCase().includes('front') || device.label.toLowerCase().includes('przód');
            if (isFront && hasFront) return; // Only 1 front camera button
            if (isFront) hasFront = true;

            const btn = document.createElement('div');
            btn.className = 'pill-btn';
            
            if (isFront) {
                btn.textContent = currentLang === 'pl' ? "📷 Przód" : "📷 Front";
            } else {
                btn.textContent = currentLang === 'pl' ? `📷 Tył ${backCount}` : `📷 Back ${backCount}`;
                backCount++;
            }

            if (device.deviceId === activeDeviceId) btn.classList.add('active');

            btn.onclick = () => {
                if (activeDeviceBtn) activeDeviceBtn.classList.remove('active');
                btn.classList.add('active');
                activeDeviceBtn = btn;
                startPreview(device.deviceId);
            };
            cameraPills.appendChild(btn);
            
            if (!activeDeviceId && (!isFront || videoDevices.length === 1)) {
                btn.classList.add('active');
                activeDeviceBtn = btn;
                startPreview(device.deviceId);
            }
        });
        
    } catch (err) {
        console.error(err);
    }
}

async function startPreview(deviceId) {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    activeDeviceId = deviceId;
    try {
        currentStream = await navigator.mediaDevices.getUserMedia({ 
            video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }, 
            audio: false 
        });
        videoEl.srcObject = currentStream;
    } catch (err) {}
}

function getBlob() {
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85)); 
}

async function sendFramesLoop() {
    while (isStreaming && ws && ws.readyState === WebSocket.OPEN) {
        const start = performance.now();
        if (videoEl.videoWidth > 0 && ws.bufferedAmount < 1024 * 50) { 
            if (canvas.width !== 1920) canvas.width = 1920;
            if (canvas.height !== 1080) canvas.height = 1080;
            
            const vw = videoEl.videoWidth;
            const vh = videoEl.videoHeight;
            const scale = Math.min(canvas.width / vw, canvas.height / vh);
            const drawW = vw * scale;
            const drawH = vh * scale;
            const offsetX = (canvas.width - drawW) / 2;
            const offsetY = (canvas.height - drawH) / 2;
            
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(videoEl, offsetX, offsetY, drawW, drawH);
            
            const blob = await getBlob();
            if (ws.readyState === WebSocket.OPEN) ws.send(blob);
        }
        const elapsed = performance.now() - start;
        const delay = Math.max(5, (1000 / 24) - elapsed);
        await new Promise(r => setTimeout(r, delay));
    }
}

async function toggleStream() {
    if (isStreaming) {
        isStreaming = false;
        startBtn.classList.remove('streaming');
        statusBadge.classList.remove('connected');
        if (ws) ws.close();
        ws = null;
        updateUI();
    } else {
        if (!currentStream && activeDeviceId) await startPreview(activeDeviceId);
        isStreaming = true;
        startBtn.classList.add('streaming');
        ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`);
        ws.onopen = () => {
            statusBadge.classList.add('connected');
            updateUI();
            sendFramesLoop();
        };
        ws.onclose = () => { if (isStreaming) toggleStream(); };
    }
}

let isLightOn = false;
let wakeLock = null;

async function toggleLight() {
    isLightOn = !isLightOn;
    document.getElementById('screen-light-overlay').style.display = isLightOn ? 'flex' : 'none';
    
    if (isLightOn) {
        updateLight(); // Set initial color
        try {
            if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {}
    } else {
        if (wakeLock) { wakeLock.release(); wakeLock = null; }
    }
}

// Init
updateUI();
getCameras();
