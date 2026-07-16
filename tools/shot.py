#!/usr/bin/env python3
"""화면을 헤드리스 Chrome으로 열어 PNG로 저장한다. 시각 확인용."""
import pathlib
import subprocess
import sys
import urllib.parse

CHROME = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]


def browser():
    for c in CHROME:
        if pathlib.Path(c).exists():
            return c
    sys.exit("Chrome을 찾을 수 없다.")


arg = sys.argv[1]
frag = ""
if "#" in arg:
    arg, frag = arg.split("#", 1)
page = pathlib.Path(arg).resolve()
out = sys.argv[2] if len(sys.argv) > 2 else "shot.png"
size = sys.argv[3] if len(sys.argv) > 3 else "1000,900"
url = "file:///" + urllib.parse.quote(str(page).replace("\\", "/"))
if frag:
    url += "#" + frag
subprocess.run([
    browser(), "--headless", "--disable-gpu", "--no-sandbox",
    "--allow-file-access-from-files", "--hide-scrollbars",
    "--force-device-scale-factor=1", "--window-size=" + size,
    "--virtual-time-budget=4000",
    "--screenshot=" + str(pathlib.Path(out).resolve()), url,
], check=False)
print("saved", out)
