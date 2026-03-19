import sys
import os

if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

import asyncio
import io
import logging
import ssl
import cv2
import numpy as np
from PIL import Image

from fastapi import FastAPI, WebSocket
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import pyvirtualcam

from create_certs import generate_self_signed_cert, get_local_ip

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("camera")

import sys
import os

if getattr(sys, 'frozen', False):
    base_dir = sys._MEIPASS
else:
    base_dir = os.path.dirname(os.path.abspath(__file__))

static_dir = os.path.join(base_dir, "static")

app = FastAPI()
app.mount("/static", StaticFiles(directory=static_dir), name="static")

virtual_cam = None
window_name = "Wireless Camera Preview (OBS)"

@app.get("/", response_class=HTMLResponse)
async def index():
    with open(os.path.join(static_dir, "index.html"), "r", encoding="utf-8") as f:
        return f.read()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global virtual_cam
    await websocket.accept()
    logger.info("📱 Phone connected via WebSocket! Receiving raw MJPEG frames...")
    
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, 1280, 720)
    
    try:
        while True:
            # Prawdziwe 1080p wysyłane jako surowy JPEG klatka po klatce
            data = await websocket.receive_bytes()
            
            # Błyskawiczne dekodowanie by uniknąć MINGW crashów z opencv
            img = Image.open(io.BytesIO(data))
            frame = np.array(img.convert('RGB'))
            
            height, width, _ = frame.shape
            
            # W locie dopasowujemy wirtualną kamerę do formatu S25 Ultra
            if virtual_cam is None or virtual_cam.width != width or virtual_cam.height != height:
                if virtual_cam is not None:
                    virtual_cam.close()
                try:
                    logger.info(f"🎥 Starting virtual camera with CRYSTAL CLEAR resolution {width}x{height}")
                    virtual_cam = pyvirtualcam.Camera(width=width, height=height, fps=30, fmt=pyvirtualcam.PixelFormat.RGB)
                except Exception as e:
                    logger.error(f"Failed to start virtual camera: {e}")
                    continue
            
            # Pchanie do OBS bez opóźnień
            virtual_cam.send(frame)
            
            # Native PC Preview Window
            bgr_frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            cv2.imshow(window_name, bgr_frame)
            cv2.waitKey(1)
            
    except Exception as e:
        logger.info(f"📱 Phone disconnected: {e}")
        cv2.destroyAllWindows()

@app.on_event("shutdown")
async def on_shutdown():
    global virtual_cam
    if virtual_cam is not None:
        virtual_cam.close()

def start_server():
    local_ip = generate_self_signed_cert()
    print("\n" + "=" * 60)
    print(f"✅ SERVER IS READY (RAW MJPEG WEBSOCKET MODE)!")
    print(f"📱 Open this URL on your phone: https://{local_ip}:8000")
    print("=" * 60 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000, ssl_keyfile="key.pem", ssl_certfile="cert.pem")

if __name__ == "__main__":
    start_server()
