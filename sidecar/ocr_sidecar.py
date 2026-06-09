import json
import sys
import os
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from mock_adapter import MockAdapter
    from glmocr_adapter import GLMOCRAdapter
    from pdf_preview import render_first_page_pdf_preview
else:
    from .mock_adapter import MockAdapter
    from .glmocr_adapter import GLMOCRAdapter
    from .pdf_preview import render_first_page_pdf_preview


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
                    if not file_path or not os.path.exists(file_path):
                        print(json.dumps({"error": "Missing or invalid file_path"}))
                        continue
                    # Load model on demand to minimize idle RAM footprint
                    adapter.load()
                    try:
                        data = adapter.extract_metadata(file_path)
                        print(json.dumps({"status": "success", "data": data}))
                    finally:
                        # Ensure we unload memory immediately after processing
                        adapter.unload()
                elif action == "preview":
                    file_path = cmd.get("file_path")
                    if not file_path or not os.path.exists(file_path):
                        print(json.dumps({"error": "Missing or invalid file_path"}))
                        continue
                    try:
                        result = render_first_page_pdf_preview(file_path)
                        print(json.dumps({"status": "success", "data": result}))
                    except Exception as error:
                        print(json.dumps({"status": "error", "message": str(error)}))
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
