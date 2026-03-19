import argparse
import asyncio
import json
import logging
import os
import ssl
import cv2
import numpy as np

from fastapi import FastAPI, Request, Body
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
import pyvirtualcam

# Prepare certificates
from create_certs import generate_self_signed_cert, get_local_ip

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("camera")

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

pcs = set()
virtual_cam = None

async def process_track(track):
    global virtual_cam
    logger.info("Track %s received", track.kind)
    
    try:
        while True:
            frame = await track.recv()
            
            # Convert frame to numpy array (RGB)
            img = frame.to_ndarray(format="rgb24")
            height, width, _ = img.shape
            
            # Initialize virtual camera if not already done or if resolution changed
            if virtual_cam is None or virtual_cam.width != width or virtual_cam.height != height:
                if virtual_cam is not None:
                    virtual_cam.close()
                try:
                    logger.info(f"Starting virtual camera with resolution {width}x{height}")
                    virtual_cam = pyvirtualcam.Camera(width=width, height=height, fps=30, fmt=pyvirtualcam.PixelFormat.RGB)
                except Exception as e:
                    logger.error(f"Failed to start virtual camera: {e}")
                    # Usually means OBS Virtual Cam is not installed or available.
                    continue
            
            # Send frame to virtual camera
            virtual_cam.send(img)
            virtual_cam.sleep_until_next_frame()
            
    except Exception as e:
        logger.info(f"Track ended: {e}")

@app.get("/", response_class=HTMLResponse)
async def index():
    # Load index.html from static folder
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.post("/offer")
async def offer(params: dict = Body(...)):
    offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])

    pc = RTCPeerConnection()
    pcs.add(pc)

    @pc.on("connectionstatechange")
    async def on_connectionstatechange():
        logger.info("Connection state is %s", pc.connectionState)
        if pc.connectionState == "failed":
            await pc.close()
            pcs.discard(pc)

    @pc.on("track")
    def on_track(track):
        if track.kind == "video":
            asyncio.ensure_future(process_track(track))

    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}

@app.on_event("shutdown")
async def on_shutdown():
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)
    pcs.clear()
    global virtual_cam
    if virtual_cam is not None:
        virtual_cam.close()

if __name__ == "__main__":
    local_ip = generate_self_signed_cert()
    
    print("\n" + "=" * 60)
    print(f"✅ SERVER IS READY!")
    print(f"📱 Open this URL on your phone: https://{local_ip}:8000")
    print("=" * 60 + "\n")
    
    uvicorn.run("server:app", host="0.0.0.0", port=8000, ssl_keyfile="key.pem", ssl_certfile="cert.pem")
