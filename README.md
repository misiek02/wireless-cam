# Wireless WebRTC Virtual Camera

Transform your smartphone into a high-quality, ultra-low latency virtual webcam for your Windows PC over the local network. 

## Features
- **Zero Latency**: Uses WebRTC for peer-to-peer real-time streaming.
- **High Quality**: Captures max resolution directly from your phone's camera.
- **Multi-Lens Support**: Choose between standard, ultrawide, or telephoto lenses dynamically (e.g. S25 Ultra).
- **OBS Integration**: Automatically feeds frames into `pyvirtualcam` to appear as a physical webcam in OBS, Discord, Zoom, etc.
- **i18n Support**: Native English UI with the option to switch to Polish.

## Setup Instructions

1. Install [OBS Studio](https://obsproject.com/) and make sure its virtual camera feature is working.
2. Clone this repository.
3. Set up the Python environment:
   ```bash
   python -m venv venv
   .\venv\Scripts\activate
   pip install -r requirements.txt
   ```
4. Run the streaming server:
   ```bash
   python server.py
   ```
5. On your phone, visit the HTTPS address printed in the console (e.g. `https://192.168.1.15:8000`).
6. Accept the self-signed certificate warning, choose your camera, and hit "Start Streaming".
7. Open OBS or Discord and select your "Virtual Camera" source.
