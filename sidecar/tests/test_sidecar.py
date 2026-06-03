import unittest

from sidecar.mock_adapter import MockAdapter


class TestOCRAdapter(unittest.TestCase):
    def test_mock_extraction(self):
        adapter = MockAdapter()
        adapter.load()
        result = adapter.extract_metadata("test_passport.jpg")
        self.assertEqual(result["first_name"], "JOHN")
        self.assertEqual(result["doc_type"], "PASSPORT")
        adapter.unload()
