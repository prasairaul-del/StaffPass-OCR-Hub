class BaseVLMAdapter:
    def load(self):
        pass

    def extract_metadata(self, file_path: str) -> dict:
        raise NotImplementedError()

    def unload(self):
        pass
