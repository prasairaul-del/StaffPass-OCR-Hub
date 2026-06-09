try:
    from .base_adapter import BaseVLMAdapter
except ImportError:
    from base_adapter import BaseVLMAdapter


class MockAdapter(BaseVLMAdapter):
    def load(self):
        pass

    def extract_metadata(self, file_path: str) -> dict:
        return {
            "ok": True,
            "degraded": False,
            "engine": "mock",
            "warnings": [],
            "data": {
                "first_name": "JOHN",
                "last_name": "SMITH",
                "doc_type": "PASSPORT",
                "doc_number": "A1234567",
                "expiry_date": "2030-12-31",
                "confidence_score": 98,
                "phone_number": "+971501234567",
            }
        }

    def unload(self):
        pass
