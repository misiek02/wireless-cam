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
        btn_light: "💡 Screen Light",
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
        btn_light: "💡 Doświetlenie Twarzy",
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

    // Update dynamic texts
    if (isStreaming) {
        document.querySelector('#start-btn span').textContent = translations[lang].btn_stop;
        statusText.textContent = translations[lang].status_connected;
    } else {
        document.querySelector('#start-btn span').textContent = translations[lang].btn_start;
        statusText.textContent = translations[lang].status_disconnected;
    }

    // Refresh option labels if already loaded
    if (cameraSelect.options.length > 0 && cameraSelect.options[0].value !== "") {
        // A hacky quick way: Re-enumerate labels to ensure translation of front/back
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


// --- WebRTC Logic ---
let pc = null;
let currentStream = null;
let isStreaming = false;

const videoEl = document.getElementById('preview');
const cameraSelect = document.getElementById('camera-select');
const resSelect = document.getElementById('resolution-select');
const startBtn = document.getElementById('start-btn');
const startBtnText = startBtn.querySelector('span');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');

async function getCameras() {
    try {
        // Request initial permission to enumerate properly
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
            
            // Try to append Front/Back label safely
            if (label.toLowerCase().includes('front')) label += ` (${translations[currentLang].cam_front})`;
            else if (label.toLowerCase().includes('back')) label += ` (${translations[currentLang].cam_back})`;
            
            option.text = label;
            cameraSelect.appendChild(option);
        });

        cameraSelect.disabled = false;
        startBtn.disabled = false;
        
        // Auto preview first camera (or whatever is selected)
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
        // Max res usually fallback to hardware limit
        videoConstraints.width = { ideal: 4096 };
        videoConstraints.height = { ideal: 2160 };
    }

    try {
        currentStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
        videoEl.srcObject = currentStream;
        
        // If we switched while streaming, update WebRTC sender
        if (isStreaming && pc) {
            const videoTrack = currentStream.getVideoTracks()[0];
            const senders = pc.getSenders();
            const sender = senders.find(s => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(videoTrack);
            }
        }
    } catch (err) {
        console.error('Error starting preview.', err);
    }
}

cameraSelect.addEventListener('change', startPreview);
resSelect.addEventListener('change', startPreview);

async function startWebRTC() {
    pc = new RTCPeerConnection();

    currentStream.getTracks().forEach(track => {
        pc.addTrack(track, currentStream);
    });

    pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'connected') {
            statusBadge.className = 'status-badge connected';
            statusText.textContent = translations[currentLang].status_connected;
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            stopStream();
        }
    });

    const offer = await pc.createOffer();
    
    // Force maximum bandwidth (15Mbps) instead of typical low WebRTC limits
    offer.sdp = offer.sdp.replace(/b=AS:.*\r\n/g, "");
    offer.sdp = offer.sdp.replace(/a=mid:video\r\n/g, "a=mid:video\r\nb=AS:15000\r\n");

    await pc.setLocalDescription(offer);

    try {
        const response = await fetch('/offer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sdp: pc.localDescription.sdp,
                type: pc.localDescription.type
            })
        });

        const answer = await response.json();
        await pc.setRemoteDescription(answer);

        // Modify sender parameters to prevent dynamic down-scaling
        const senders = pc.getSenders();
        const sender = senders.find(s => s.track && s.track.kind === 'video');
        if (sender && sender.getParameters) {
            const params = sender.getParameters();
            if (!params.encodings) params.encodings = [{}];
            params.encodings.forEach(enc => {
                enc.maxBitrate = 15000000; // 15 Mbps
                // Optional: You can enforce no scale down
                // enc.scaleResolutionDownBy = 1;
            });
            await sender.setParameters(params);
        }
    } catch (err) {
        console.error("Connection failed", err);
        stopStream();
    }
}

function stopStream() {
    isStreaming = false;
    startBtn.className = 'primary-btn pulse';
    startBtnText.textContent = translations[currentLang].btn_start;
    
    statusBadge.className = 'status-badge';
    statusText.textContent = translations[currentLang].status_disconnected;

    if (pc) {
        pc.close();
        pc = null;
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
        
        await startWebRTC();
    }
}

// Init
setLanguage('en');
getCameras();

let isLightOn = false;
let wakeLock = null;

async function toggleLight() {
    isLightOn = !isLightOn;
    document.body.classList.toggle('screen-light-active', isLightOn);
    
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
