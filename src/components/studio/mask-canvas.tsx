"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Brush, Eraser, Trash2, Undo2 } from "lucide-react";

/**
 * The inpaint mask editor: paint over the base image; white strokes mark the
 * region to fill. The visible canvas shows the base dimmed for context; the
 * exported mask is a clean black canvas with white strokes at the base's
 * aspect, emitted as a PNG data URL after every completed stroke (so the
 * composer always holds the mask as painted, not as of the first stroke).
 * Single-level undo snaps back to before the last stroke; Cmd/Ctrl+Z works
 * when the canvas is focused. Painting itself is pointer-driven: touchpads,
 * trackpads, and mice all drive pointer events, but there is no keyboard
 * path for freehand strokes (the honest alternative is not offering one
 * badly).
 */
export function MaskCanvas({
  baseAssetUrl,
  onChange,
}: {
  baseAssetUrl: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLImageElement | null>(null);
  const drawing = useRef(false);
  const stroked = useRef(false);
  const undoSnapshot = useRef<ImageData | null>(null);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [size, setSize] = useState(36);
  const [canUndo, setCanUndo] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!baseAssetUrl) {
      return;
    }
    const image = new Image();
    image.onload = () => {
      baseRef.current = image;
      repaint();
    };
    image.src = baseAssetUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseAssetUrl]);

  function repaint() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const image = baseRef.current;
    if (!canvas || !context) {
      return;
    }
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (image) {
      context.globalAlpha = 0.25;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      context.globalAlpha = 1;
    } else {
      context.fillStyle = "#222";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    stroked.current = false;
    undoSnapshot.current = null;
    setCanUndo(false);
    setDirty(false);
    onChange(null);
  }

  function paint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !drawing.current) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    context.globalCompositeOperation = "source-over";
    context.fillStyle = tool === "brush" ? "#fff" : "#000";
    context.beginPath();
    context.arc(x, y, size / 2, 0, Math.PI * 2);
    context.fill();
    stroked.current = true;
    if (!dirty) {
      setDirty(true);
    }
  }

  /** A stroke ended: publish the mask as it now stands. */
  function finishStroke() {
    if (!drawing.current) {
      return;
    }
    drawing.current = false;
    if (stroked.current) {
      onChange(exportMask());
    }
  }

  /** Restores the snapshot taken before the last stroke began. */
  function undo() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const snapshot = undoSnapshot.current;
    if (!canvas || !context || !snapshot) {
      return;
    }
    context.putImageData(snapshot, 0, 0);
    undoSnapshot.current = null;
    setCanUndo(false);
    onChange(stroked.current ? exportMask() : null);
  }

  /** Exports the clean mask: strokes over solid black, no base preview. */
  function exportMask(): string | null {
    const canvas = canvasRef.current;
    const image = baseRef.current;
    if (!canvas || !image) {
      return null;
    }
    const off = document.createElement("canvas");
    off.width = image.naturalWidth;
    off.height = image.naturalHeight;
    const context = off.getContext("2d");
    if (!context) {
      return null;
    }
    context.fillStyle = "#000";
    context.fillRect(0, 0, off.width, off.height);
    context.drawImage(canvas, 0, 0, off.width, off.height);
    // Remove the dimmed base preview: redraw strokes only? The canvas holds
    // strokes plus preview; strokes are white/black, the preview is dimmed
    // image. Threshold: keep near-white as white, everything else black.
    const data = context.getImageData(0, 0, off.width, off.height);
    for (let i = 0; i < data.data.length; i += 4) {
      const isStroke = data.data[i]! > 200 && data.data[i + 1]! > 200 && data.data[i + 2]! > 200;
      const value = isStroke ? 255 : 0;
      data.data[i] = value;
      data.data[i + 1] = value;
      data.data[i + 2] = value;
      data.data[i + 3] = 255;
    }
    context.putImageData(data, 0, 0);
    return off.toDataURL("image/png");
  }

  if (!baseAssetUrl) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
        Pick a base reference to paint a mask.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={tool === "brush" ? "default" : "outline"}
          className="h-8"
          onClick={() => setTool("brush")}
        >
          <Brush className="size-3.5" aria-hidden /> Brush
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tool === "eraser" ? "default" : "outline"}
          className="h-8"
          onClick={() => setTool("eraser")}
        >
          <Eraser className="size-3.5" aria-hidden /> Erase
        </Button>
        <Label className="ml-2 flex items-center gap-2 text-xs text-muted-foreground">
          size
          <input
            type="range"
            min={8}
            max={96}
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
            className="w-24 accent-[var(--primary)]"
          />
        </Label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          disabled={!canUndo}
          onClick={undo}
        >
          <Undo2 className="size-3.5" aria-hidden /> Undo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-8"
          onClick={() => {
            drawing.current = false;
            repaint();
          }}
        >
          <Trash2 className="size-3.5" aria-hidden /> Clear
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        tabIndex={0}
        role="img"
        aria-label="Inpaint mask: paint with the pointer to mark the region the model fills"
        className="w-full cursor-crosshair rounded-lg ring-1 ring-border/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        onPointerDown={(event) => {
          const canvas = canvasRef.current;
          const context = canvas?.getContext("2d");
          if (canvas && context) {
            undoSnapshot.current = context.getImageData(0, 0, canvas.width, canvas.height);
            setCanUndo(true);
          }
          drawing.current = true;
          paint(event);
        }}
        onPointerMove={paint}
        onPointerUp={finishStroke}
        onPointerLeave={finishStroke}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
            event.preventDefault();
            undo();
          }
        }}
      />
      <p className="text-xs text-muted-foreground">
        White marks the region the model fills; everything else stays untouched. Undo
        (or Cmd/Ctrl+Z while the canvas is focused) reverts the last stroke.
      </p>
    </div>
  );
}
