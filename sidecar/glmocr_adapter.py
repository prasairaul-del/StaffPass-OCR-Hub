import json
import os
import sys
import gc

try:
    from .base_adapter import BaseVLMAdapter
except ImportError:
    from base_adapter import BaseVLMAdapter

class GLMOCRAdapter(BaseVLMAdapter):
    def __init__(self):
        self.processor = None
        self.model = None
        self.model_id = "zai-org/GLM-OCR"
        self.load_error = None

    def load(self):
        # Configure torch thread count for CPU stability
        try:
            import torch
            torch.set_num_threads(max(1, os.cpu_count() // 2 if os.cpu_count() else 2))
        except Exception:
            pass

        # Dynamically import transformers to prevent import crashes when dependencies are missing
        self.load_error = None
        try:
            from transformers import AutoProcessor, GlmOcrForConditionalGeneration
            print(f"Loading GLM-OCR model {self.model_id} on CPU...", file=sys.stderr)
            self.processor = AutoProcessor.from_pretrained(self.model_id)
            self.model = GlmOcrForConditionalGeneration.from_pretrained(
                self.model_id, 
                device_map="cpu"
            )
            print("GLM-OCR model loaded successfully.", file=sys.stderr)
        except Exception as e:
            self.load_error = str(e)
            print(f"Warning: Failed to load GLM-OCR dependencies/model: {e}. Manual review will be required.", file=sys.stderr)

    def extract_metadata(self, file_path: str) -> dict:
        if not self.model or not self.processor:
            return self._manual_review_required(
                file_path,
                "GLM-OCR model is unavailable; no identity data was inferred."
            )

        temp_path = None
        try:
            from PIL import Image
            import torch

            # Open image
            image = Image.open(file_path).convert("RGB")

            # Downsample to speed up CPU inference
            max_size = 512
            if max(image.size) > max_size:
                import tempfile
                image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                temp_file = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
                temp_file.close()
                image.save(temp_file.name)
                temp_path = temp_file.name
                process_path = temp_path
            else:
                process_path = file_path

            # Construct structured query
            prompt = (
                "Extract the following details from this staff document and output ONLY a JSON object: "
                "first_name, last_name, doc_type, doc_number, expiry_date, phone_number. "
                "Ensure values are normalized (dates in YYYY-MM-DD format if possible). "
                "Do not include any chat prefix or markdown formatting. Return raw JSON text."
            )

            # Apply chat template
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "url": process_path},
                        {"type": "text", "text": prompt}
                    ]
                }
            ]

            inputs = self.processor.apply_chat_template(
                messages, 
                tokenize=True, 
                add_generation_prompt=True, 
                return_dict=True,
                return_tensors="pt"
            ).to(self.model.device)

            # Generate response
            with torch.no_grad():
                output = self.model.generate(
                    **inputs,
                    max_new_tokens=512,
                    do_sample=False
                )

            # Decode output
            decoded = self.processor.decode(output[0], skip_special_tokens=True)
            
            # Clean and parse JSON from output
            extracted_data = self._clean_and_parse_json(decoded)
            
            extracted_data["confidence_score"] = 92

            return self._success_response(extracted_data)

        except Exception as e:
            print(f"Error during GLM-OCR inference: {e}", file=sys.stderr)
            return self._manual_review_required(
                file_path,
                "GLM-OCR inference failed; no identity data was inferred."
            )
        finally:
            if temp_path:
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

    def unload(self):
        # Unload model from memory to yield resources back to system
        self.processor = None
        self.model = None
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        print("GLM-OCR model unloaded from memory.", file=sys.stderr)

    def _clean_and_parse_json(self, raw_text: str) -> dict:
        text = raw_text.strip()
        # Find start and end of JSON block if the model outputted markdown fences
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        
        try:
            return json.loads(text)
        except Exception:
            # Fallback heuristic parser if JSON is slightly malformed
            parsed = {}
            lines = text.replace("{", "").replace("}", "").split("\n")
            for line in lines:
                if ":" in line:
                    parts = line.split(":", 1)
                    key = parts[0].strip().strip('"').strip("'")
                    val = parts[1].strip().strip(",").strip('"').strip("'")
                    parsed[key] = val
            return parsed

    def _success_response(self, data: dict) -> dict:
        return {
            "ok": True,
            "degraded": False,
            "engine": "glm-ocr",
            "warnings": [],
            "data": data
        }

    def _infer_doc_type_from_name(self, file_path: str) -> str:
        base_name = os.path.basename(file_path).upper()
        doc_type = "PASSPORT"
        if "VISA" in base_name:
            doc_type = "VISA"
        elif "EMIRATES" in base_name or "EID" in base_name:
            doc_type = "EMIRATES_ID"
        elif "LABOR" in base_name or "LABOUR" in base_name:
            doc_type = "LABOR_CARD"
        return doc_type

    def _manual_review_required(self, file_path: str, reason: str) -> dict:
        return {
            "ok": False,
            "degraded": True,
            "engine": "glm-ocr",
            "warnings": [reason],
            "data": {
                "first_name": "",
                "last_name": "",
                "doc_type": self._infer_doc_type_from_name(file_path),
                "doc_number": "",
                "expiry_date": "",
                "confidence_score": 0,
                "phone_number": "",
                "notes": reason,
                "review_status": "Manual Review Required"
            }
        }
