// --- i18n Dictionary ---
const translations = {
    en: {
        app_title: "Wireless Virtual Camera",
        app_header: "Wireless Camera",
        app_desc: "Stream directly to your PC",
        status_disconnected: "Disconnected",
        status_connected: "Streaming",
        label_camera: "Select Camera:",
        option_loading: "Loading cameras...",
        label_resolution: "Resolution:",
        res_max: "Max Available",
        btn_start: "Start Streaming",
        btn_stop: "Stop Streaming",
        footer_text: "Ensure you have OBS Virtual Camera installed on your PC.",
        err_no_cam: "Camera access denied or no cameras found.",
        cam_front: "Front",
        cam_back: "Back",
        btn_light: "💡 Screen Light"
    },
    pl: {
        app_title: "Bezprzewodowa Kamera",
        app_header: "Kamera Bezprzewodowa",
        app_desc: "Streamuj bezpośrednio na swój PC",
        status_disconnected: "Rozłączono",
        status_connected: "Streamowanie",
        label_camera: "Wybierz kamerę:",
        option_loading: "Ładowanie kamer...",
        label_resolution: "Rozdzielczość:",
        res_max: "Maksymalna dostępna",
        btn_start: "Rozpocznij Stream",
        btn_stop: "Zatrzymaj Stream",
        footer_text: "Upewnij się, że masz zainstalowany sterownik OBS Virtual Camera (lub dodatek) na PC.",
        err_no_cam: "Odmowa dostępu do kamery lub brak kamer.",
        cam_front: "Przód",
        cam_back: "Tył",
        btn_light: "💡 Doświetlenie Twarzy"
    }
};

let currentLang = 'en';

function setLanguage(lang) {
    currentLang = lang;
    document.getElementById('lang-en').classList.toggle('active', lang === 'en');
    document.getElementById('lang-pl').classList.toggle('active', lang === 'pl');
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });
    
    document.title = translations[currentLang].app_title;

    if (isStreaming) {
        document.querySelector('#start-btn span').textContent = translations[lang].btn_stop;
        statusText.textContent = translations[lang].status_connected;
    } else {
        document.querySelector('#start-btn span').textContent = translations[lang].btn_start;
        statusText.textContent = translations[lang].status_disconnected;
    }

    if (cameraSelect.options.length > 0 && cameraSelect.options[0].value !== "") {
        Array.from(cameraSelect.options).forEach(opt => {
            if (opt.text.toLowerCase().includes('front') || opt.text.toLowerCase().includes('przód')) {
                opt.text = opt.text.replace(/ \(.*\)/, '') + ` (${translations[lang].cam_front})`;
            } else if (opt.text.toLowerCase().includes('back') || opt.text.toLowerCase().includes('tył')) {
                opt.text = opt.text.replace(/ \(.*\)/, '') + ` (${translations[lang].cam_back})`;
            }
        });
    }
}

document.getElementById('lang-en').addEventListener('click', () => setLanguage('en'));
document.getElementById('lang-pl').addEventListener('click', () => setLanguage('pl'));

// --- Stream & Socket Logic ---
let ws = null;
let currentStream = null;
let isStreaming = false;

const videoEl = document.getElementById('preview');
const cameraSelect = document.getElementById('camera-select');
const resSelect = document.getElementById('resolution-select');
const startBtn = document.getElementById('start-btn');
const startBtnText = startBtn.querySelector('span');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');

let canvas = document.createElement('canvas');
let ctx = canvas.getContext('2d', { willReadFrequently: true });

async function getCameras() {
    try {
        const dummyStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        dummyStream.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        cameraSelect.innerHTML = '';
        
        if (videoDevices.length === 0) {
            cameraSelect.innerHTML = `<option value="">${translations[currentLang].err_no_cam}</option>`;
            return;
        }

        videoDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            let label = device.label || `Camera ${cameraSelect.length + 1}`;
            
            if (label.toLowerCase().includes('front')) label += ` (${translations[currentLang].cam_front})`;
            else if (label.toLowerCase().includes('back')) label += ` (${translations[currentLang].cam_back})`;
            
            option.text = label;
            cameraSelect.appendChild(option);
        });

        cameraSelect.disabled = false;
        startBtn.disabled = false;
        
        startPreview();
    } catch (err) {
        console.error('Error accessing media devices.', err);
        cameraSelect.innerHTML = `<option value="">${translations[currentLang].err_no_cam}</option>`;
    }
}

async function startPreview() {
    if (cameraSelect.value === "") return;
    
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    const deviceId = cameraSelect.value;
    const res = resSelect.value;
    
    let videoConstraints = { deviceId: { exact: deviceId } };
    
    if (res === "1080") {
        videoConstraints.width = { ideal: 1920 };
        videoConstraints.height = { ideal: 1080 };
    } else if (res === "720") {
        videoConstraints.width = { ideal: 1280 };
        videoConstraints.height = { ideal: 720 };
    } else {
        videoConstraints.width = { ideal: 4096 };
        videoConstraints.height = { ideal: 2160 };
    }

    try {
        currentStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
        videoEl.srcObject = currentStream;
    } catch (err) {
        console.error('Error starting preview.', err);
    }
}

cameraSelect.addEventListener('change', startPreview);
resSelect.addEventListener('change', startPreview);

function getBlob() {
    // 85% quality JPEG. Keeps extreme sharpness while drastically reducing network footprint.
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85)); 
}

async function sendFramesLoop() {
    while (isStreaming && ws && ws.readyState === WebSocket.OPEN) {
        const start = performance.now();
        
        if (videoEl.videoWidth > 0) {
            // Drop frames if network buffer builds up (> 50KB) - guarantees ZERO latency!
            if (ws.bufferedAmount < 1024 * 50) { 
                // Always export 1920x1080. This protects Zoom/OBS from blurring rotated streams.
                if (canvas.width !== 1920) canvas.width = 1920;
                if (canvas.height !== 1080) canvas.height = 1080;
                
                const vw = videoEl.videoWidth;
                const vh = videoEl.videoHeight;
                const scale = Math.min(canvas.width / vw, canvas.height / vh);
                const drawW = vw * scale;
                const drawH = vh * scale;
                const offsetX = (canvas.width - drawW) / 2;
                const offsetY = (canvas.height - drawH) / 2;
                
                // Draw black bars for padding if rotated vertically (portrait)
                ctx.fillStyle = "black";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(videoEl, offsetX, offsetY, drawW, drawH);
                
                const blob = await getBlob();
                
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(blob);
                }
            } else {
                // Console log excluded to prevent spam, frame skipped naturally.
            }
        }
        
        const elapsed = performance.now() - start;
        const targetInterval = 1000 / 24; // 24 FPS target (cinematic/video-call standard)
        const delay = Math.max(5, targetInterval - elapsed);
        
        await new Promise(r => setTimeout(r, delay));
    }
}

async function toggleStream() {
    if (isStreaming) {
        stopStream();
    } else {
        if (!currentStream) await startPreview();
        isStreaming = true;
        startBtn.className = 'primary-btn streaming pulse';
        startBtnText.textContent = translations[currentLang].btn_stop;
        statusText.textContent = "Connecting...";
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        
        ws.onopen = () => {
            statusBadge.className = 'status-badge connected';
            statusText.textContent = translations[currentLang].status_connected;
            sendFramesLoop();
        };
        
        ws.onclose = () => {
            stopStream();
        };
    }
}

function stopStream() {
    isStreaming = false;
    startBtn.className = 'primary-btn pulse';
    startBtnText.textContent = translations[currentLang].btn_start;
    
    statusBadge.className = 'status-badge';
    statusText.textContent = translations[currentLang].status_disconnected;

    if (ws) {
        ws.close();
        ws = null;
    }
}

// Init
setLanguage('en');
getCameras();

let isLightOn = false;
let wakeLock = null;

async function toggleLight() {
    isLightOn = !isLightOn;
    document.getElementById('screen-light-overlay').style.display = isLightOn ? 'flex' : 'none';
    
    if (isLightOn) {
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (err) {
            console.error('Wake Lock error:', err);
        }
    } else {
        if (wakeLock) {
            wakeLock.release().then(() => { wakeLock = null; });
        }
    }
}
