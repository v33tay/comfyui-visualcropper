# ComfyUI Visual Cropper

`Load Image (Visual Crop)` is a ComfyUI custom node that loads an image, previews it in the node, and outputs a user-selected crop.

## Installation

1. Copy this repository into `ComfyUI/custom_nodes/comfyui-visualcropper`.
2. Restart ComfyUI.
3. Add **Load Image (Visual Crop)** from the **image** category.

## Usage

- Select or upload an image using the image field.
- Choose an aspect ratio, or use **Free** for an unconstrained selection. Enable **vertical** to swap a preset's orientation.
- Choosing a ratio fits a centered selection to the image. The area outside the crop box is dimmed. Drag outside the selection to draw a new crop, drag inside it to move the box, or drag an edge/corner handle to resize it.
- The node returns the cropped `IMAGE` and its `MASK`. Images with transparency produce an inverted alpha mask, matching ComfyUI's `Load Image` convention; opaque images produce an all-zero mask.

The crop rectangle is stored as normalized coordinates in the workflow, so it remains valid if the source image dimensions change.
