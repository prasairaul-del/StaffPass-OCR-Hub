import base64
import tempfile
import unittest
from pathlib import Path

import fitz

from sidecar.pdf_preview import render_first_page_pdf_preview
import sidecar.pdf_preview as pdf_preview


class TestPdfPreview(unittest.TestCase):
    def _create_pdf(self, directory: Path, name: str = "sample.pdf") -> Path:
        pdf_path = directory / name
        doc = fitz.open()
        page = doc.new_page(width=180, height=120)
        page.insert_text((18, 60), "StaffPass OCR Hub", fontsize=14)
        doc.save(str(pdf_path))
        doc.close()
        return pdf_path

    def test_valid_pdf_renders_first_page_png(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path = self._create_pdf(Path(temp_dir))

            result = render_first_page_pdf_preview(str(pdf_path))

            self.assertTrue(result["ok"])
            self.assertEqual(result["mimeType"], "image/png")
            self.assertEqual(result["warnings"], [])
            self.assertGreater(result["width"], 0)
            self.assertGreater(result["height"], 0)

            png_bytes = base64.b64decode(result["data"])
            self.assertTrue(png_bytes.startswith(b"\x89PNG\r\n\x1a\n"))

    def test_non_pdf_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = Path(temp_dir) / "preview.txt"
            file_path.write_text("not a pdf", encoding="utf-8")

            result = render_first_page_pdf_preview(str(file_path))

            self.assertFalse(result["ok"])
            self.assertEqual(result["mimeType"], "")
            self.assertEqual(result["data"], "")
            self.assertEqual(result["width"], 0)
            self.assertEqual(result["height"], 0)
            self.assertEqual(result["warnings"], ["Only PDF files are supported for preview."])

    def test_missing_and_corrupt_pdf_fail_explicitly(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            missing_path = Path(temp_dir) / "missing.pdf"
            missing_result = render_first_page_pdf_preview(str(missing_path))
            self.assertFalse(missing_result["ok"])
            self.assertEqual(missing_result["warnings"], ["PDF file not found."])

            corrupt_path = Path(temp_dir) / "corrupt.pdf"
            corrupt_path.write_bytes(b"%PDF-1.7\nthis is not a valid pdf")

            corrupt_result = render_first_page_pdf_preview(str(corrupt_path))
            self.assertFalse(corrupt_result["ok"])
            self.assertEqual(corrupt_result["mimeType"], "")
            self.assertEqual(corrupt_result["data"], "")
            self.assertEqual(corrupt_result["width"], 0)
            self.assertEqual(corrupt_result["height"], 0)
            self.assertTrue(
                corrupt_result["warnings"][0].startswith("Failed to rasterize PDF:")
            )

    def test_pdf_preview_limits_large_files_and_pages(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            large_path = temp_path / "large.pdf"
            large_path.write_bytes(b"%PDF-1.7\n")
            original_max_bytes = pdf_preview.MAX_PDF_BYTES
            original_max_pixels = pdf_preview.MAX_RENDERED_PIXELS

            try:
                pdf_preview.MAX_PDF_BYTES = 4
                large_result = render_first_page_pdf_preview(str(large_path))
                self.assertFalse(large_result["ok"])
                self.assertEqual(
                    large_result["warnings"],
                    ["PDF file is too large for inline preview."],
                )

                pdf_preview.MAX_PDF_BYTES = original_max_bytes
                pdf_preview.MAX_RENDERED_PIXELS = 10
                oversized_page = self._create_pdf(temp_path, "oversized-page.pdf")
                page_result = render_first_page_pdf_preview(str(oversized_page))
                self.assertFalse(page_result["ok"])
                self.assertEqual(
                    page_result["warnings"],
                    ["PDF first page is too large for inline preview."],
                )
            finally:
                pdf_preview.MAX_PDF_BYTES = original_max_bytes
                pdf_preview.MAX_RENDERED_PIXELS = original_max_pixels
