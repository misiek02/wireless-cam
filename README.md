# Wireless WebRTC Virtual Camera

Transform your smartphone into a high-quality, ultra-low latency virtual webcam for your Windows PC over the local network. 

## Features
- **Zero Latency**: Uses WebRTC for peer-to-peer real-time streaming.
- **High Quality**: Captures max resolution directly from your phone's camera.
- **Multi-Lens Support**: Choose between standard, ultrawide, or telephoto lenses dynamically (e.g. S25 Ultra).
- **OBS Integration**: Automatically feeds frames into `pyvirtualcam` to appear as a physical webcam in OBS, Discord, Zoom, etc.
- **i18n Support**: Native English UI with the option to switch to Polish.

## Setup Instructions

### Prerequisites
- **Windows**: Install [OBS Studio](https://obsproject.com/) and make sure its virtual camera feature works.
- **Linux (Ubuntu/Debian)**: Install `v4l2loopback` driver to create virtual cameras.
  ```bash
  sudo apt update
  sudo apt install v4l2loopback-dkms
  sudo modprobe v4l2loopback devices=1 video_nr=20 card_label="OBS Virtual Camera" exclusive_caps=1
  ```

### Installation

1. Clone this repository.
2. Set up the Python environment:

**Windows (PowerShell)**:
```powershell
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

**Linux (Bash)**:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Running the Server
Run the streaming server:
```bash
python server.py
```
*(On Linux you might need to use `python3 server.py`)*

1. On your phone, visit the HTTPS address printed in the console (e.g. `https://192.168.1.15:8000`).
2. Accept the self-signed certificate warning, choose your camera, and hit "Start Streaming".
3. Open OBS, Discord, or Teams and select your "Virtual Camera" source.

