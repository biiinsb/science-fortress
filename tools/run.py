#!/usr/bin/env python3
"""
run.py — 헤드리스 Chrome으로 페이지를 열고 결과만 뽑아 출력한다.

  py tools/run.py tests/physics.test.html      테스트 실행
  py tools/run.py tools/calibrate.html         맵 클리어 가능성 실증

Node가 설치되어 있지 않아도 브라우저 하나로 순수 로직을 검증할 수 있다.
물리·점수·진단 모듈이 DOM을 모르는 순수 함수인 덕분이다 (개발 계획서 4.1 원칙 1).
"""
import html
import pathlib
import re
import subprocess
import sys
import urllib.parse

CHROME = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]


sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def find_browser():
    for c in CHROME:
        if pathlib.Path(c).exists():
            return c
    sys.exit("Chrome이나 Edge를 찾을 수 없다.")


def strip(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    page = pathlib.Path(sys.argv[1]).resolve()
    if not page.exists():
        sys.exit(f"파일이 없다: {page}")

    url = "file:///" + urllib.parse.quote(str(page).replace("\\", "/"))
    out = subprocess.run(
        [
            find_browser(),
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--allow-file-access-from-files",  # file://에서 <script src>를 읽으려면 필요
            "--enable-logging=stderr",
            "--v=0",
            "--dump-dom",
            "--virtual-time-budget=60000",
            url,
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    dom, log = out.stdout or "", out.stderr or ""

    # --dump-dom은 <script> 본문도 그대로 실어 보낸다. 페이지가 결과 HTML을
    # 문자열로 조립하는 이상, 그 소스 안의 '<p class="fail">'가 진짜 실패로
    # 오인된다. 결과를 읽기 전에 스크립트를 걷어낸다.
    dom = re.sub(r"<script\b.*?</script>", "", dom, flags=re.S | re.I)

    for line in log.splitlines():
        if "CONSOLE" in line and ("Uncaught" in line or "Error" in line):
            print("JS 오류:", line.split("CONSOLE:")[-1].strip())

    m = re.search(r'<h1 id="summary".*?>(.*?)</h1>', dom, re.S)
    if not m:
        print("결과 요약을 찾지 못했다. 페이지가 끝까지 실행되지 않았다.")
        sys.exit(1)

    print(strip(m.group(1)))
    for f in re.findall(r'<p class="fail">(.*?)</p>', dom, re.S):
        print("  ", strip(f))
    for b in re.findall(r'<pre id="detail">(.*?)</pre>', dom, re.S):
        print(strip(b))

    sys.exit(1 if "FAIL" in strip(m.group(1)) else 0)


if __name__ == "__main__":
    main()
