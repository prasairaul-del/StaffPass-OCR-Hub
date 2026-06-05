import sys
import os

def main():
    model_id = "zai-org/GLM-OCR"
    print(f"Pre-downloading GLM-OCR model files ({model_id}) for local cache...", flush=True)
    
    try:
        # Check dependencies
        print("Verifying python dependencies...", flush=True)
        from transformers import AutoProcessor, GlmOcrForConditionalGeneration
        
        # Download processor
        print("Downloading processor configuration...", flush=True)
        AutoProcessor.from_pretrained(model_id)
        
        # Download model weights
        print("Downloading model weights (~2GB, this may take a few minutes)...", flush=True)
        GlmOcrForConditionalGeneration.from_pretrained(model_id)
        
        print("\nSuccess: GLM-OCR model and processor successfully cached locally!", flush=True)
        
    except ImportError as ie:
        print(f"\nError: Missing dependencies. Please run 'pip install -r requirements.txt' in the sidecar directory first.\nDetail: {ie}", file=sys.stderr, flush=True)
        sys.exit(1)
    except Exception as e:
        print(f"\nError caching model: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
