import os

import numpy as np
import torch
from PIL import Image, ImageOps

import folder_paths


ASPECT_RATIOS = [
    "Free",
    "1:1",
    "4:3",
    "3:2",
    "16:9",
    "5:4",
    "21:9",
]


class VisualCropper:
    @classmethod
    def INPUT_TYPES(cls):
        input_directory = folder_paths.get_input_directory()
        images = [
            filename
            for filename in os.listdir(input_directory)
            if os.path.isfile(os.path.join(input_directory, filename))
        ]
        images = folder_paths.filter_files_content_types(images, ["image"])
        return {
            "required": {
                "image": (sorted(images), {"image_upload": True}),
                "aspect_ratio": (ASPECT_RATIOS,),
                "vertical": ("BOOLEAN", {"default": False}),
                "crop_x": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "crop_y": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "crop_width": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "crop_height": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "load_and_crop"
    CATEGORY = "image"

    def load_and_crop(
        self,
        image,
        aspect_ratio,
        vertical,
        crop_x,
        crop_y,
        crop_width,
        crop_height,
    ):
        image_path = folder_paths.get_annotated_filepath(image)
        if not os.path.isfile(image_path):
            raise FileNotFoundError(f"Input image does not exist: {image_path}")

        with Image.open(image_path) as source:
            source = ImageOps.exif_transpose(source)
            has_alpha = "A" in source.getbands() or "transparency" in source.info
            rgba = source.convert("RGBA")

        image_width, image_height = rgba.size
        if image_width == 0 or image_height == 0:
            raise ValueError("The selected image has no pixels.")

        if crop_width <= 0.0 or crop_height <= 0.0:
            selection_width, selection_height = self._default_selection(
                image_width, image_height, aspect_ratio, vertical
            )
            left = (image_width - selection_width) // 2
            top = (image_height - selection_height) // 2
            right = left + selection_width
            bottom = top + selection_height
        else:
            left = int(round(crop_x * image_width))
            top = int(round(crop_y * image_height))
            right = int(round((crop_x + crop_width) * image_width))
            bottom = int(round((crop_y + crop_height) * image_height))
            left = min(max(left, 0), image_width - 1)
            top = min(max(top, 0), image_height - 1)
            right = min(max(right, left + 1), image_width)
            bottom = min(max(bottom, top + 1), image_height)

        cropped = rgba.crop((left, top, right, bottom))
        pixels = np.asarray(cropped, dtype=np.float32) / 255.0
        output_image = torch.from_numpy(pixels[:, :, :3].copy()).unsqueeze(0)

        if has_alpha:
            alpha = torch.from_numpy(pixels[:, :, 3].copy())
            output_mask = (1.0 - alpha).unsqueeze(0)
        else:
            output_mask = torch.zeros(
                (1, cropped.height, cropped.width), dtype=torch.float32
            )

        return (output_image, output_mask)

    @staticmethod
    def _default_selection(image_width, image_height, aspect_ratio, vertical=False):
        if aspect_ratio == "Free":
            return image_width, image_height

        try:
            ratio_width, ratio_height = map(int, aspect_ratio.split(":"))
        except (AttributeError, ValueError):
            raise ValueError(f"Unsupported aspect ratio: {aspect_ratio}")

        ratio = ratio_width / ratio_height
        if vertical:
            ratio = 1 / ratio
        if image_width / image_height > ratio:
            selection_height = image_height
            selection_width = max(1, round(selection_height * ratio))
        else:
            selection_width = image_width
            selection_height = max(1, round(selection_width / ratio))

        return min(selection_width, image_width), min(selection_height, image_height)
