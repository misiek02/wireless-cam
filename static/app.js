const videoEl = document.getElementById('preview');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const startBtn = document.getElementById('start-btn');
const cameraPills = document.getElementById('camera-pills');

let ws = null;
let currentStream = null;
let isStreaming = false;
let activeDeviceId = null;
let activeDeviceBtn = null;
let isCropMode = false;

let canvas = document.createElement('canvas');
let ctx = canvas.getContext('2d', { willReadFrequently: true });

function toggleCrop() {
    isCropMode = !isCropMode;
    const btn = document.getElementById('crop-btn');
    if (isCropMode) btn.classList.add('active');
    else btn.classList.remove('active');
}

function updateUI() {
    statusText.textContent = isStreaming ? "Streaming" : "Ready";
}

async function getCameras() {
    try {
        const dummyStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        dummyStream.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        cameraPills.innerHTML = '';
        
        let hasFront = false;
        let frontCount = 1;
        let backCount = 1;

        videoDevices.forEach((device) => {
            const isFront = device.label.toLowerCase().includes('front') || device.label.toLowerCase().includes('przód');
            if (isFront && hasFront) return; // Only take 1 front camera
            if (isFront) hasFront = true;

            const btn = document.createElement('div');
            btn.className = 'pill-btn';
            
            if (isFront) {
                btn.textContent = `Front 1`;
            } else {
                btn.textContent = `Back ${backCount}`;
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
            
            if (!activeDeviceId && backCount === 2 && !isFront) {
                // Auto-select first back camera if possible
                btn.classList.add('active');
                activeDeviceBtn = btn;
                startPreview(device.deviceId);
            } else if (!activeDeviceId && videoDevices.length === 1) {
                btn.classList.add('active');
                activeDeviceBtn = btn;
                startPreview(device.deviceId);
            }
        });
        
        // Fallback auto-start if nothing selected
        if (!activeDeviceId && videoDevices.length > 0) {
            cameraPills.children[0].classList.add('active');
            activeDeviceBtn = cameraPills.children[0];
            startPreview(videoDevices[0].deviceId);
        }
        
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
            
            // "Fill" mode if horizontally cropping portrait, otherwise "Fit" mode for letterbox
            const scale = isCropMode ? Math.max(canvas.width / vw, canvas.height / vh) : Math.min(canvas.width / vw, canvas.height / vh);
            
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

// Init
updateUI();
getCameras();
