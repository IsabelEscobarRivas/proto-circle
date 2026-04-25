#!/usr/bin/env python3
"""Export sparc-deck to PDF: HTML (Chrome) preferred, PPTX+LibreOffice fallback."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

# Same output roots as build_sparc_deck.py
PREFERRED_OUT_DIR = "/mnt/user-data/outputs"
PDF_NAME = "sparc-deck.pdf"


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def out_dir() -> Path:
    preferred = Path(PREFERRED_OUT_DIR)
    try:
        preferred.mkdir(parents=True, exist_ok=True)
        test = preferred / ".write_test"
        test.write_text("x")
        test.unlink()
        return preferred
    except OSError:
        return repo_root() / "user-data" / "outputs"


def chrome_candidates() -> list[Path]:
    home = Path.home()
    return [
        Path(
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        ),
        Path("/Applications/Chromium.app/Contents/MacOS/Chromium"),
        home
        / "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        Path("/usr/bin/google-chrome-stable"),
        Path("/usr/bin/google-chrome"),
        Path("/usr/bin/chromium"),
        Path("/usr/bin/chromium-browser"),
    ]


def soffice_candidates() -> list[Path]:
    return [
        Path(
            "/Applications/LibreOffice.app/Contents/MacOS/soffice"
        ),
        Path("/usr/bin/soffice"),
        Path("/usr/bin/libreoffice"),
    ]


def export_via_chrome_html(html: Path, pdf: Path) -> bool:
    chrome = next((c for c in chrome_candidates() if c.is_file()), None)
    if not chrome:
        return False
    file_url = html.resolve().as_uri()
    # Headless print-to-pdf; margins come from @page in HTML
    try:
        subprocess.run(
            [
                str(chrome),
                "--headless=new",
                "--disable-gpu",
                f"--print-to-pdf={pdf.resolve()}",
                file_url,
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (subprocess.CalledProcessError, FileNotFoundError, OSError) as e:
        print(f"Chrome export failed: {e}", file=sys.stderr)
        if pdf.is_file():
            pdf.unlink()
        return False
    return pdf.is_file() and pdf.stat().st_size > 0


def export_via_lo_pptx(pptx: Path, pdf: Path) -> bool:
    soffice = next((s for s in soffice_candidates() if s.is_file()), None)
    if not soffice:
        return False
    out = pdf.parent
    try:
        subprocess.run(
            [
                str(soffice),
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(out),
                str(pptx.resolve()),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (subprocess.CalledProcessError, FileNotFoundError, OSError) as e:
        print(f"LibreOffice export failed: {e}", file=sys.stderr)
        return False
    # LibreOffice names output after source stem
    lo_pdf = out / f"{pptx.stem}.pdf"
    if not lo_pdf.is_file():
        return False
    shutil.move(str(lo_pdf), str(pdf))
    return pdf.is_file()


def main() -> None:
    root = repo_root()
    html = root / "user-data" / "outputs" / "sparc-deck.html"
    pptx = root / "user-data" / "outputs" / "sparc-deck.pptx"
    destination = out_dir() / PDF_NAME
    destination.parent.mkdir(parents=True, exist_ok=True)

    if not html.is_file():
        print(f"Missing {html}", file=sys.stderr)
        sys.exit(1)

    if export_via_chrome_html(html, destination):
        print(f"Wrote {destination} (from HTML via Chrome).")
        return

    if pptx.is_file() and export_via_lo_pptx(pptx, destination):
        print(f"Wrote {destination} (from PPTX via LibreOffice).")
        return

    print(
        "Could not build PDF. Install one of:\n"
        "  • Google Chrome (or Chromium) — used to print the HTML deck, or\n"
        "  • LibreOffice — used to convert sparc-deck.pptx to PDF.\n"
        "Then re-run: python3 scripts/export_sparc_deck_pdf.py",
        file=sys.stderr,
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
