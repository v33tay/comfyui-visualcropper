from .nodes import VisualCropper


NODE_CLASS_MAPPINGS = {
    "VisualCropper": VisualCropper,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "VisualCropper": "Load Image (Visual Crop)",
}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
