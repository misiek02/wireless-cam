import os
import sys
import zipfile
import urllib.request
import subprocess
import threading

ADB_URL = "https://dl.google.com/android/repository/platform-tools-latest-windows.zip"

def get_base_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

def setup_adb():
    base_dir = get_base_dir()
    adb_dir = os.path.join(base_dir, "adb")
    adb_path = os.path.join(adb_dir, "adb.exe")
    
    if not os.path.exists(adb_path):
        os.makedirs(adb_dir, exist_ok=True)
        zip_path = os.path.join(adb_dir, "platform-tools.zip")
        print("Downloading ADB (Android Debug Bridge) for USB support...")
        try:
            urllib.request.urlretrieve(ADB_URL, zip_path)
            
            print("Extracting ADB...")
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                files_to_extract = [
                    "platform-tools/adb.exe",
                    "platform-tools/AdbWinApi.dll",
                    "platform-tools/AdbWinUsbApi.dll"
                ]
                for file in files_to_extract:
                    zip_ref.extract(file, adb_dir)
                    old_path = os.path.join(adb_dir, file)
                    new_path = os.path.join(adb_dir, os.path.basename(file))
                    if os.path.exists(new_path):
                        os.remove(new_path)
                    os.rename(old_path, new_path)
        except Exception as e:
            print(f"Failed to download/extract ADB: {e}")
        
        # Cleanup
        try:
            if os.path.exists(zip_path):
                os.remove(zip_path)
            platform_tools_dir = os.path.join(adb_dir, "platform-tools")
            if os.path.exists(platform_tools_dir):
                os.rmdir(platform_tools_dir)
        except Exception:
            pass
            
    return adb_path

def start_adb_reverse(port=8000):
    def _run():
        try:
            adb_path = setup_adb()
            if os.path.exists(adb_path):
                CREATE_NO_WINDOW = 0x08000000
                subprocess.run([adb_path, "start-server"], creationflags=CREATE_NO_WINDOW)
                subprocess.run([adb_path, "reverse", f"tcp:{port}", f"tcp:{port}"], creationflags=CREATE_NO_WINDOW)
                print(f"✅ ADB USB Tunnel established (Phone can use https://localhost:{port})")
        except Exception as e:
            print(f"ADB Reverse Error: {e}")
            
    t = threading.Thread(target=_run, daemon=True)
    t.start()
