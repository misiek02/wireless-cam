const translations = {
    en: { ready: "Ready", streaming: "Streaming", closeLight: "Tap to close 💡 (Set MAX brightness)", lang: "PL" },
    pl: { ready: "Gotowe", streaming: "Kamera Włączona", closeLight: "Dotknij by wyłączyć 💡 (Ustaw pod światło max jasność telefonu w górnym menu)", lang: "EN" }
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
    getCameras(); // Refresh lens labels
}

function updateUI() {
    langBtn.textContent = translations[currentLang].lang;
    statusText.textContent = isStreaming ? translations[currentLang].streaming : translations[currentLang].ready;
    document.getElementById('light-text').textContent = translations[currentLang].closeLight;
}

async function getCameras() {
    try {
        const dummyStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        dummyStream.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        cameraPills.innerHTML = '';
        
        videoDevices.forEach((device, index) => {
            const btn = document.createElement('div');
            btn.className = 'pill-btn';
            if (device.deviceId === activeDeviceId) btn.classList.add('active');
            
            let label = device.label || `Cam ${index + 1}`;
            if (label.toLowerCase().includes('front') || label.toLowerCase().includes('przód')) {
                label = currentLang === 'pl' ? "📷 Przód" : "📷 Front";
            } else if (label.toLowerCase().includes('back') || label.toLowerCase().includes('tył')) {
                label = currentLang === 'pl' ? `📷 Tył ${index}` : `📷 Back ${index}`;
            }

            btn.textContent = label;
            btn.onclick = () => {
                if (activeDeviceBtn) activeDeviceBtn.classList.remove('active');
                btn.classList.add('active');
                activeDeviceBtn = btn;
                startPreview(device.deviceId);
            };
            cameraPills.appendChild(btn);
            
            if (!activeDeviceId && index === 0) {
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
            video: { 
                deviceId: { exact: deviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }, 
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
        const delay = Math.max(5, (1000 / 30) - elapsed);
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
        statusText.textContent = "...";
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        
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
        try {
            if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {}
    } else {
        if (wakeLock) {
            wakeLock.release();
            wakeLock = null;
        }
    }
}

// Init
updateUI();
getCameras();
