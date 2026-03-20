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
let cropYOffset = 0.5; // Offset for vertical cropping (0 = top, 1 = bottom)

let canvas = document.createElement('canvas');
let ctx = canvas.getContext('2d', { willReadFrequently: true });

function toggleCrop() {
    isCropMode = !isCropMode;
    const btn = document.getElementById('crop-btn');
    const guide = document.getElementById('crop-guide');
    if (isCropMode) {
        btn.classList.add('active');
        guide.classList.add('visible');
    } else {
        btn.classList.remove('active');
        guide.classList.remove('visible');
    }
}

// TOUCH PANNING LOGIC
let startY = 0;
let initialYOffset = 0.5;

document.querySelector('.video-container').addEventListener('touchstart', (e) => {
    if (!isCropMode) return;
    startY = e.touches[0].clientY;
    initialYOffset = cropYOffset;
}, { passive: true });

document.querySelector('.video-container').addEventListener('touchmove', (e) => {
    if (!isCropMode) return;
    const deltaY = e.touches[0].clientY - startY;
    const screenHeight = window.innerHeight;
    
    // Smoothly update offset (1.0 sensitivity)
    // finger UP (deltaY < 0) -> offset decreases -> sensor shifts to TOP
    let newOffset = initialYOffset + (deltaY / screenHeight);
    
    // Clamp between 0 and 1
    newOffset = Math.max(0, Math.min(1, newOffset));
    cropYOffset = newOffset;
    
    // Update guide visually
    const guide = document.getElementById('crop-guide');
    const val = cropYOffset * 100; // 0% top, 100% bottom
    guide.style.top = `${val}%`;
    guide.style.transform = `translateY(-${val}%)`;
}, { passive: true });

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
            
            // Apply vertical crop offset
            let offsetY;
            if (isCropMode) {
                // If drawH > canvas.height, we have extra vertical data to choose from
                offsetY = (canvas.height - drawH) * cropYOffset;
            } else {
                offsetY = (canvas.height - drawH) / 2;
            }
            
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
