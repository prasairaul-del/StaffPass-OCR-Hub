import base64
from pathlib import Path

MAX_PDF_BYTES = 25 * 1024 * 1024
MAX_RENDERED_PIXELS = 10_000_000
PREVIEW_DPI = 144


def _error_response(message: str) -> dict:
    return {
        "ok": False,
        "mimeType": "",
        "data": "",
        "width": 0,
        "height": 0,
        "warnings": [message],
    }


def render_first_page_pdf_preview(file_path: str) -> dict:
    try:
        import fitz
    except Exception as exc:
        return _error_response(f"PyMuPDF is unavailable: {exc}")

    if not file_path:
        return _error_response("A PDF file path is required.")

    path = Path(file_path)

    if path.suffix.lower() != ".pdf":
        return _error_response("Only PDF files are supported for preview.")

    if not path.exists():
        return _error_response("PDF file not found.")

    if path.stat().st_size > MAX_PDF_BYTES:
        return _error_response("PDF file is too large for inline preview.")

    doc = None
    try:
        doc = fitz.open(str(path))
        if doc.page_count < 1:
            return _error_response("PDF contains no pages.")

        page = doc.load_page(0)
        scale = PREVIEW_DPI / 72.0
        rendered_width = int(page.rect.width * scale)
        rendered_height = int(page.rect.height * scale)
        if rendered_width <= 0 or rendered_height <= 0:
            return _error_response("PDF first page has invalid dimensions.")
        if rendered_width * rendered_height > MAX_RENDERED_PIXELS:
            return _error_response("PDF first page is too large for inline preview.")

        pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        png_bytes = pixmap.tobytes("png")

        return {
            "ok": True,
            "mimeType": "image/png",
            "data": base64.b64encode(png_bytes).decode("ascii"),
            "width": pixmap.width,
            "height": pixmap.height,
            "warnings": [],
        }
    except Exception as exc:
        return _error_response(f"Failed to rasterize PDF: {exc}")
    finally:
        if doc is not None:
            doc.close()
