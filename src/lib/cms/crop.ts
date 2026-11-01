/**
 * The headshot crop (C-70): a 4:5 frame over the photo, zoomed and panned by
 * the editor. Everything is in fractions, so the preview (percent of the
 * frame) and the canvas crop (pixels of the source) use the same numbers.
 *
 * `zoom` 1 = the photo just covers the frame; up to 3. `panX`/`panY` 0..1
 * place the frame within the room the zoom leaves: 0 = left/top edge,
 * 1 = right/bottom edge. Where there is no room on an axis, pan does nothing.
 */
export type CropInput = { naturalWidth: number; naturalHeight: number; zoom: number; panX: number; panY: number };

export type CropGeometry = {
  /** The image's box as a percent of the frame — for the preview. */
  widthPct: number;
  heightPct: number;
  leftPct: number;
  topPct: number;
  /** Room to pan on each axis, as a fraction of the image (0 = none). */
  roomX: number;
  roomY: number;
  /** The part of the source that lands in the frame, in source pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

export const FRAME_ASPECT = 4 / 5;
export const MAX_ZOOM = 3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function cropGeometry({ naturalWidth: w, naturalHeight: h, zoom, panX, panY }: CropInput): CropGeometry {
  const z = clamp(zoom, 1, MAX_ZOOM);
  // > 1: the photo is wider than the frame, so at zoom 1 its height fits.
  const r = w / h / FRAME_ASPECT;
  const widthPct = (r >= 1 ? r : 1) * z * 100;
  const heightPct = (r >= 1 ? 1 : 1 / r) * z * 100;
  // Half the visible window, as a fraction of the image, on each axis.
  const halfX = 50 / widthPct;
  const halfY = 50 / heightPct;
  const roomX = Math.max(0, 1 - 2 * halfX);
  const roomY = Math.max(0, 1 - 2 * halfY);
  const cx = halfX + clamp(panX, 0, 1) * roomX;
  const cy = halfY + clamp(panY, 0, 1) * roomY;
  return {
    widthPct,
    heightPct,
    leftPct: 50 - cx * widthPct,
    topPct: 50 - cy * heightPct,
    roomX,
    roomY,
    sx: (cx - halfX) * w,
    sy: (cy - halfY) * h,
    sw: 2 * halfX * w,
    sh: 2 * halfY * h,
  };
}

/**
 * Pan after dragging the photo by (dx, dy) screen pixels in a frame `frameWidth`
 * pixels wide. Dragging right moves the photo right, so the frame moves left.
 */
export function panAfterDrag(
  g: CropGeometry,
  pan: { x: number; y: number },
  dx: number,
  dy: number,
  frameWidth: number,
): { x: number; y: number } {
  const frameHeight = frameWidth / FRAME_ASPECT;
  const imgW = (frameWidth * g.widthPct) / 100;
  const imgH = (frameHeight * g.heightPct) / 100;
  return {
    x: g.roomX > 0 ? clamp(pan.x - dx / imgW / g.roomX, 0, 1) : pan.x,
    y: g.roomY > 0 ? clamp(pan.y - dy / imgH / g.roomY, 0, 1) : pan.y,
  };
}
