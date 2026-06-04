import json
import sys
import os
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from mock_adapter import MockAdapter
    from glmocr_adapter import GLMOCRAdapter
else:
    from .mock_adapter import MockAdapter
    from .glmocr_adapter import GLMOCRAdapter


def main():
    engine = os.environ.get("OCR_ENGINE", "mock").lower()
    if engine == "glm-ocr":
        adapter = GLMOCRAdapter()
    else:
        adapter = MockAdapter()

    try:
        for line in sys.stdin:
            if not line.strip():
                continue
            try:
                cmd = json.loads(line)
                action = cmd.get("action")
                if action == "ocr":
                    file_path = cmd.get("file_path")
                    # Load model on demand to minimize idle RAM footprint
                    adapter.load()
                    try:
                        data = adapter.extract_metadata(file_path)
                        print(json.dumps({"status": "success", "data": data}))
                    finally:
                        # Ensure we unload memory immediately after processing
                        adapter.unload()
                elif action == "exit":
                    break
                else:
                    print(json.dumps({"status": "error", "message": "Unsupported action"}))
            except Exception as error:
                print(json.dumps({"status": "error", "message": str(error)}))
            finally:
                sys.stdout.flush()
    finally:
        pass


if __name__ == "__main__":
    main()
