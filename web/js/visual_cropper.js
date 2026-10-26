const { app } = window.comfyAPI.app;
const { api } = window.comfyAPI.api;

const PREVIEW_HEIGHT = 220;
const RATIOS = {
	"1:1": 1,
	"4:3": 4 / 3,
	"3:2": 3 / 2,
	"16:9": 16 / 9,
	"5:4": 5 / 4,
	"21:9": 21 / 9,
};

app.registerExtension({
	name: "comfyui.visualcropper",
	async nodeCreated(node) {
		if (node.comfyClass !== "VisualCropper") return;

		const canvas = document.createElement("canvas");
		canvas.className = "visual-cropper-canvas";
		canvas.style.cssText =
			"display:block;width:100%;height:100%;object-fit:contain;background:#181818;cursor:crosshair;touch-action:none";
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Could not create the crop preview canvas.");

		let sourceImage = null;
		let dragMode = null;
		let dragStart = null;
		let selectionAtDragStart = null;
		let imageRequestId = 0;

		const getWidget = (name) => node.widgets?.find((widget) => widget.name === name);
		const hideDefaultImagePreview = () => {
			const widget = getWidget("$$canvas-image-preview");
			if (widget && widget.type !== "hidden") {
				widget.type = "hidden";
				widget.computeSize = () => [0, -4];
			}
			if (node.imgs?.length) {
				node.imgs = [];
			}
		};
		const getAspectRatio = () => {
			const ratio = RATIOS[getWidget("aspect_ratio")?.value];
			return ratio && getWidget("vertical")?.value ? 1 / ratio : ratio;
		};
		const readSelection = () => ({
			x: getWidget("crop_x")?.value ?? 0,
			y: getWidget("crop_y")?.value ?? 0,
			width: getWidget("crop_width")?.value ?? 0,
			height: getWidget("crop_height")?.value ?? 0,
		});
		const writeSelection = (selection) => {
			for (const [name, value] of Object.entries({
				crop_x: selection.x,
				crop_y: selection.y,
				crop_width: selection.width,
				crop_height: selection.height,
			})) {
				const widget = getWidget(name);
				if (widget) widget.value = value;
			}
			drawPreview();
		};

		const imageRect = () => {
			const scale = Math.min(canvas.width / sourceImage.width, canvas.height / sourceImage.height);
			const width = sourceImage.width * scale;
			const height = sourceImage.height * scale;
			return {
				x: (canvas.width - width) / 2,
				y: (canvas.height - height) / 2,
				width,
				height,
			};
		};

		const resizeCanvas = () => {
			const pixelRatio = window.devicePixelRatio || 1;
			const bounds = canvas.getBoundingClientRect();
			const cssWidth = canvas.clientWidth || bounds.width || node.size[0];
			const cssHeight =
				canvas.clientHeight || bounds.height || previewWidget.getHeight();
			const width = Math.max(1, Math.round(cssWidth * pixelRatio));
			const height = Math.max(1, Math.round(cssHeight * pixelRatio));
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
				drawPreview();
			}
		};

		const fitSelection = () => {
			if (!sourceImage) return;
			const image = getWidget("image")?.value;
			const ratio = getAspectRatio();
			if (!image || !ratio) {
				writeSelection({ x: 0, y: 0, width: 1, height: 1 });
				return;
			}

			const imageRatio = sourceImage.width / sourceImage.height;
			const width = Math.min(1, imageRatio > ratio ? ratio / imageRatio : 1);
			const height = Math.min(1, imageRatio > ratio ? 1 : imageRatio / ratio);
			writeSelection({
				x: (1 - width) / 2,
				y: (1 - height) / 2,
				width,
				height,
			});
		};

		const drawPreview = () => {
			hideDefaultImagePreview();
			if (!sourceImage || !context) return;
			const scale = Math.min(canvas.width / sourceImage.width, canvas.height / sourceImage.height);
			const width = sourceImage.width * scale;
			const height = sourceImage.height * scale;
			const rect = {
				x: (canvas.width - width) / 2,
				y: (canvas.height - height) / 2,
				width,
				height,
			};
			context.clearRect(0, 0, canvas.width, canvas.height);
			context.fillStyle = "#181818";
			context.fillRect(0, 0, canvas.width, canvas.height);

			const selection = readSelection();
			if (selection.width <= 0 || selection.height <= 0) return;
			const selected = {
				x: rect.x + selection.x * rect.width,
				y: rect.y + selection.y * rect.height,
				width: selection.width * rect.width,
				height: selection.height * rect.height,
			};
			context.drawImage(sourceImage, rect.x, rect.y, rect.width, rect.height);
			context.fillStyle = "rgba(0, 0, 0, 0.6)";
			context.fillRect(rect.x, rect.y, rect.width, rect.height);
			context.save();
			context.beginPath();
			context.rect(selected.x, selected.y, selected.width, selected.height);
			context.clip();
			context.drawImage(sourceImage, rect.x, rect.y, rect.width, rect.height);
			context.restore();
			context.strokeStyle = "#31a8ff";
			context.lineWidth = Math.max(1, canvas.width / 400);
			context.strokeRect(selected.x, selected.y, selected.width, selected.height);
			const handleSize = Math.max(4, canvas.width / 70);
			context.fillStyle = "#ffffff";
			for (const x of [selected.x, selected.x + selected.width]) {
				for (const y of [selected.y, selected.y + selected.height]) {
					context.fillRect(
						x - handleSize / 2,
						y - handleSize / 2,
						handleSize,
						handleSize,
					);
				}
			}
		};

		const loadImage = (fitSelectionOnLoad = true) => {
			const requestId = ++imageRequestId;
			const filename = getWidget("image")?.value;
			if (!filename) {
				sourceImage = null;
				context.clearRect(0, 0, canvas.width, canvas.height);
				return;
			}
			const preview = new Image();
			preview.onload = () => {
				if (requestId !== imageRequestId) return;
				sourceImage = preview;
				hideDefaultImagePreview();
				resizeCanvas();
				if (fitSelectionOnLoad) fitSelection();
				else drawPreview();
			};
			preview.onerror = () => {
				if (requestId !== imageRequestId) return;
				sourceImage = null;
				context.clearRect(0, 0, canvas.width, canvas.height);
				console.error(`Could not load crop preview for "${filename}".`);
			};
			preview.src = api.apiURL(
				`/view?filename=${encodeURIComponent(filename)}&type=input`,
			);
		};

		const pointFromEvent = (event) => {
			const bounds = canvas.getBoundingClientRect();
			const rect = imageRect();
			return {
				x: Math.max(
					rect.x,
					Math.min(
						rect.x + rect.width,
						(event.clientX - bounds.left) * (canvas.width / bounds.width),
					),
				),
				y: Math.max(
					rect.y,
					Math.min(
						rect.y + rect.height,
						(event.clientY - bounds.top) * (canvas.height / bounds.height),
					),
				),
			};
		};

		const constrainedSelection = (start, end) => {
			const rect = imageRect();
			const ratio = getAspectRatio();
			const directionX = end.x < start.x ? -1 : 1;
			const directionY = end.y < start.y ? -1 : 1;
			let width = Math.abs(end.x - start.x);
			let height = Math.abs(end.y - start.y);

			if (ratio) {
				if (width / Math.max(height, 1) > ratio) width = height * ratio;
				else height = width / ratio;
			}
			width = Math.min(width, directionX > 0 ? rect.x + rect.width - start.x : start.x - rect.x);
			height = Math.min(height, directionY > 0 ? rect.y + rect.height - start.y : start.y - rect.y);
			if (ratio && width / Math.max(height, 1) > ratio) width = height * ratio;
			else if (ratio) height = width / ratio;

			const left = directionX > 0 ? start.x : start.x - width;
			const top = directionY > 0 ? start.y : start.y - height;
			return {
				x: Math.max(0, Math.min(1, (left - rect.x) / rect.width)),
				y: Math.max(0, Math.min(1, (top - rect.y) / rect.height)),
				width: Math.max(0, Math.min(1, width / rect.width)),
				height: Math.max(0, Math.min(1, height / rect.height)),
			};
		};

		const selectionRect = (selection, rect = imageRect()) => ({
			left: rect.x + selection.x * rect.width,
			top: rect.y + selection.y * rect.height,
			right: rect.x + (selection.x + selection.width) * rect.width,
			bottom: rect.y + (selection.y + selection.height) * rect.height,
		});

		const getResizeHandle = (point, selected) => {
			const tolerance = Math.max(7, canvas.width / 35);
			const distanceLeft = Math.abs(point.x - selected.left);
			const distanceRight = Math.abs(point.x - selected.right);
			const distanceTop = Math.abs(point.y - selected.top);
			const distanceBottom = Math.abs(point.y - selected.bottom);
			const nearLeft = distanceLeft <= distanceRight && distanceLeft <= tolerance;
			const nearRight = distanceRight < distanceLeft && distanceRight <= tolerance;
			const nearTop = distanceTop <= distanceBottom && distanceTop <= tolerance;
			const nearBottom = distanceBottom < distanceTop && distanceBottom <= tolerance;
			const withinHorizontal =
				point.x >= selected.left - tolerance && point.x <= selected.right + tolerance;
			const withinVertical =
				point.y >= selected.top - tolerance && point.y <= selected.bottom + tolerance;

			if (withinHorizontal && withinVertical) {
				const horizontal = nearLeft ? "w" : nearRight ? "e" : "";
				const vertical = nearTop ? "n" : nearBottom ? "s" : "";
				if (horizontal || vertical) return `${vertical}${horizontal}`;
			}
			return null;
		};

		const resizedSelection = (point, handle) => {
			const rect = imageRect();
			const selected = selectionRect(selectionAtDragStart, rect);
			const ratio = getAspectRatio();
			let { left, top, right, bottom } = selected;

			if (!ratio) {
				if (handle.includes("w")) left = Math.min(point.x, right - 2);
				if (handle.includes("e")) right = Math.max(point.x, left + 2);
				if (handle.includes("n")) top = Math.min(point.y, bottom - 2);
				if (handle.includes("s")) bottom = Math.max(point.y, top + 2);
			} else {
				let width;
				let height;
				if (handle.includes("e") || handle.includes("w")) {
					const anchorX = handle.includes("e") ? left : right;
					const centerY = (top + bottom) / 2;
					const availableWidth =
						handle.includes("e") ? rect.x + rect.width - anchorX : anchorX - rect.x;
					const availableHeight =
						2 * Math.min(centerY - rect.y, rect.y + rect.height - centerY) * ratio;
					width = Math.max(
						Math.min(2, availableWidth, availableHeight),
						Math.min(Math.abs(point.x - anchorX), availableWidth, availableHeight),
					);
					height = width / ratio;
					left = handle.includes("e") ? anchorX : anchorX - width;
					right = left + width;
					top = centerY - height / 2;
					bottom = centerY + height / 2;
				} else if (handle.includes("n") || handle.includes("s")) {
					const anchorY = handle.includes("s") ? top : bottom;
					const centerX = (left + right) / 2;
					const availableHeight =
						handle.includes("s") ? rect.y + rect.height - anchorY : anchorY - rect.y;
					const availableWidth =
						2 * Math.min(centerX - rect.x, rect.x + rect.width - centerX) / ratio;
					height = Math.max(
						Math.min(2, availableHeight, availableWidth),
						Math.min(Math.abs(point.y - anchorY), availableHeight, availableWidth),
					);
					width = height * ratio;
					top = handle.includes("s") ? anchorY : anchorY - height;
					bottom = top + height;
					left = centerX - width / 2;
					right = centerX + width / 2;
				} else {
					const anchorX = handle.includes("e") ? left : right;
					const anchorY = handle.includes("s") ? top : bottom;
					const signX = handle.includes("e") ? 1 : -1;
					const signY = handle.includes("s") ? 1 : -1;
					const maxWidth = signX > 0
						? rect.x + rect.width - anchorX
						: anchorX - rect.x;
					const maxHeight = signY > 0
						? rect.y + rect.height - anchorY
						: anchorY - rect.y;
					width = Math.max(
						Math.abs(point.x - anchorX),
						Math.abs(point.y - anchorY) * ratio,
					);
					width = Math.max(
						Math.min(2, maxWidth, maxHeight * ratio),
						Math.min(width, maxWidth, maxHeight * ratio),
					);
					height = width / ratio;
					left = signX > 0 ? anchorX : anchorX - width;
					right = left + width;
					top = signY > 0 ? anchorY : anchorY - height;
					bottom = top + height;
				}
			}

			return {
				x: (left - rect.x) / rect.width,
				y: (top - rect.y) / rect.height,
				width: (right - left) / rect.width,
				height: (bottom - top) / rect.height,
			};
		};

		canvas.addEventListener("pointerdown", (event) => {
			if (!sourceImage) return;
			const point = pointFromEvent(event);
			const rect = imageRect();
			const selection = readSelection();
			const selected = selectionRect(selection, rect);
			const inside =
				point.x >= selected.left &&
				point.x <= selected.right &&
				point.y >= selected.top &&
				point.y <= selected.bottom;
			canvas.setPointerCapture(event.pointerId);
			dragMode = getResizeHandle(point, selected) ?? (inside ? "move" : "select");
			dragStart = point;
			selectionAtDragStart = selection;
		});
		canvas.addEventListener("pointermove", (event) => {
			if (!sourceImage) return;
			const point = pointFromEvent(event);
			if (!dragMode || !dragStart || !selectionAtDragStart) {
				const selected = selectionRect(readSelection());
				const handle = getResizeHandle(point, selected);
				const inside =
					point.x >= selected.left &&
					point.x <= selected.right &&
					point.y >= selected.top &&
					point.y <= selected.bottom;
				canvas.style.cursor = handle
					? handle.length === 2
						? handle === "nw" || handle === "se"
							? "nwse-resize"
							: "nesw-resize"
						: handle === "e" || handle === "w" ? "ew-resize" : "ns-resize"
					: inside
						? "move"
						: "crosshair";
				return;
			}

			if (dragMode === "move") {
				const rect = imageRect();
				const width = selectionAtDragStart.width;
				const height = selectionAtDragStart.height;
				const deltaX = (point.x - dragStart.x) / rect.width;
				const deltaY = (point.y - dragStart.y) / rect.height;
				writeSelection({
					...selectionAtDragStart,
					x: Math.max(0, Math.min(1 - width, selectionAtDragStart.x + deltaX)),
					y: Math.max(0, Math.min(1 - height, selectionAtDragStart.y + deltaY)),
				});
				return;
			}

			if (dragMode !== "select") {
				writeSelection(resizedSelection(point, dragMode));
				return;
			}

			writeSelection(constrainedSelection(dragStart, point));
		});
		const stopDragging = () => {
			dragMode = null;
			dragStart = null;
			selectionAtDragStart = null;
		};
		canvas.addEventListener("pointerup", stopDragging);
		canvas.addEventListener("pointercancel", stopDragging);

		const previewWidget = node.addDOMWidget("crop_preview", "crop-preview", canvas, {
			getHeight: () => PREVIEW_HEIGHT,
			getWidth: () => node.size[0],
			serialize: false,
		});

		for (const name of ["crop_x", "crop_y", "crop_width", "crop_height"]) {
			const widget = getWidget(name);
			if (widget) {
				widget.type = "hidden";
				widget.computeSize = () => [0, -4];
			}
		}

		const imageWidget = getWidget("image");
		if (imageWidget) {
			const originalCallback = imageWidget.callback;
			imageWidget.callback = (...args) => {
				originalCallback?.(...args);
				hideDefaultImagePreview();
				loadImage();
			};
		}
		const originalOnConfigure = node.onConfigure;
		node.onConfigure = (...args) => {
			originalOnConfigure?.apply(node, args);
			hideDefaultImagePreview();
			loadImage(false);
		};
		for (const name of ["aspect_ratio", "vertical"]) {
			const widget = getWidget(name);
			if (!widget) continue;
			const originalCallback = widget.callback;
			widget.callback = (...args) => {
				originalCallback?.(...args);
				fitSelection();
			};
		}

		const minimumSize = node.computeSize();
		const minimumNonPreviewHeight = minimumSize[1] - PREVIEW_HEIGHT;
		node.setSize([
			Math.max(node.size[0], minimumSize[0]),
			Math.max(node.size[1], minimumSize[1]),
		]);
		previewWidget.getHeight = () =>
			Math.max(PREVIEW_HEIGHT, node.size[1] - minimumNonPreviewHeight);
		previewWidget.computeSize = () => [minimumSize[0], previewWidget.getHeight()];
		node.computeSize = () => [...minimumSize];

		const resizeObserver = new ResizeObserver(resizeCanvas);
		resizeObserver.observe(canvas);
		const originalOnResize = node.onResize;
		node.onResize = function (...args) {
			const result = originalOnResize?.apply(this, args);
			resizeCanvas();
			return result;
		};
		const originalOnDrawBackground = node.onDrawBackground;
		node.onDrawBackground = function (...args) {
			hideDefaultImagePreview();
			return originalOnDrawBackground?.apply(this, args);
		};
		loadImage();
	},
});
