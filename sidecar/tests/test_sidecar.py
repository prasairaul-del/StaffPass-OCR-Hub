import unittest

from sidecar.glmocr_adapter import GLMOCRAdapter
from sidecar.mock_adapter import MockAdapter


class TestOCRAdapter(unittest.TestCase):
    def test_structured_manual_review_response_does_not_fabricate_identity(self):
        adapter = GLMOCRAdapter()
        result = adapter._manual_review_required(
            "test_passport.jpg",
            "GLM-OCR inference failed; no identity data was inferred."
        )

        self.assertFalse(result["ok"])
        self.assertTrue(result["degraded"])
        self.assertEqual(result["engine"], "glm-ocr")
        self.assertEqual(result["warnings"], [
            "GLM-OCR inference failed; no identity data was inferred."
        ])

        data = result["data"]
        self.assertEqual(data["first_name"], "")
        self.assertEqual(data["last_name"], "")
        self.assertEqual(data["doc_type"], "PASSPORT")
        self.assertEqual(data["doc_number"], "")
        self.assertEqual(data["expiry_date"], "")
        self.assertEqual(data["confidence_score"], 0)
        self.assertEqual(data["phone_number"], "")
        self.assertEqual(data["review_status"], "Manual Review Required")

    def test_success_response_is_structured(self):
        adapter = GLMOCRAdapter()
        result = adapter._success_response({
            "first_name": "JOHN",
            "last_name": "SMITH",
            "doc_type": "PASSPORT",
            "doc_number": "A1234567",
            "expiry_date": "2030-12-31",
            "confidence_score": 98,
            "phone_number": "+971501234567",
        })

        self.assertTrue(result["ok"])
        self.assertFalse(result["degraded"])
        self.assertEqual(result["engine"], "glm-ocr")
        self.assertEqual(result["warnings"], [])
        self.assertEqual(result["data"]["first_name"], "JOHN")
        self.assertEqual(result["data"]["doc_type"], "PASSPORT")

    def test_mock_extraction(self):
        adapter = MockAdapter()
        adapter.load()
        result = adapter.extract_metadata("test_passport.jpg")
        self.assertEqual(result["first_name"], "JOHN")
        self.assertEqual(result["doc_type"], "PASSPORT")
        adapter.unload()
