import asyncio
import io
import logging
import ssl
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

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

virtual_cam = None

@app.get("/", response_class=HTMLResponse)
async def index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global virtual_cam
    await websocket.accept()
    logger.info("📱 Phone connected via WebSocket! Receiving raw MJPEG frames...")
    
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
            
    except Exception as e:
        logger.info(f"📱 Phone disconnected: {e}")

@app.on_event("shutdown")
async def on_shutdown():
    global virtual_cam
    if virtual_cam is not None:
        virtual_cam.close()

if __name__ == "__main__":
    local_ip = generate_self_signed_cert()
    print("\n" + "=" * 60)
    print(f"✅ SERVER IS READY (RAW MJPEG WEBSOCKET MODE)!")
    print(f"📱 Open this URL on your phone: https://{local_ip}:8000")
    print("=" * 60 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000, ssl_keyfile="key.pem", ssl_certfile="cert.pem")
