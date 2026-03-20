import sys
import os

if sys.stdout is None:
    sys.stdout = open("camera_error.log", "a", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open("camera_error.log", "a", encoding="utf-8")

import tkinter as tk
import multiprocessing
import socket
import server

def run_uvicorn():
    server.start_server()

def get_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class App:
    def __init__(self, root):
        self.root = root
        self.root.title("Wireless Camera")
        self.root.geometry("320x360")
        self.root.configure(bg="#0a0a0c")
        
        self.server_process = None
        url = f"https://{get_ip()}:8000"
        
        self.lbl_ip = tk.Label(root, text=url, font=("Arial", 16, "bold"), bg="#0a0a0c", fg="#ffffff")
        self.lbl_ip.pack(pady=15)
        
        try:
            import qrcode
            from PIL import ImageTk
            qr = qrcode.QRCode(version=1, box_size=5, border=1)
            qr.add_data(url)
            qr.make(fit=True)
            img = qr.make_image(fill_color="white", back_color="#0a0a0c")
            self.qr_photo = ImageTk.PhotoImage(img)
            self.lbl_qr = tk.Label(root, image=self.qr_photo, bg="#0a0a0c")
            self.lbl_qr.pack(pady=5)
        except Exception as e:
            pass
        
        self.btn_toggle = tk.Button(root, text="START", font=("Arial", 12, "bold"), bg="#1e1e1e", fg="white", 
                                    activebackground="#2a2a2c", activeforeground="white",
                                    command=self.toggle_server, width=12, relief="solid", bd=1)
        self.btn_toggle.pack(pady=15)
        
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

    def toggle_server(self):
        if self.server_process is None or not self.server_process.is_alive():
            self.start_server()
        else:
            self.stop_server()

    def start_server(self):
        self.server_process = multiprocessing.Process(target=run_uvicorn)
        self.server_process.start()
        self.btn_toggle.config(text="STOP", bg="#ff3b3b")

    def stop_server(self):
        if self.server_process and self.server_process.is_alive():
            self.server_process.terminate()
            self.server_process.join()
        self.server_process = None
        self.btn_toggle.config(text="START", bg="#1e1e1e")

    def on_closing(self):
        self.stop_server()
        self.root.destroy()

if __name__ == "__main__":
    multiprocessing.freeze_support()
    root = tk.Tk()
    app = App(root)
    root.mainloop()
