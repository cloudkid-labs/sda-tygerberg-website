import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { cropGeometry, panAfterDrag } from '../src/lib/cms/crop.ts';

/*
 * The headshot crop (C-70): the preview and the canvas crop come from the same
 * numbers, so what the editor frames is what gets stored.
 */

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const ratio = (g) => g.sw / g.sh;

describe('the 4:5 crop', () => {
  test('always cuts exactly 4:5, inside the photo', () => {
    for (const [w, h] of [[4000, 3000], [1200, 1500], [3000, 4000], [1080, 1920]]) {
      for (const zoom of [1, 1.7, 3]) {
        for (const [panX, panY] of [[0, 0], [0.5, 0.3], [1, 1]]) {
          const g = cropGeometry({ naturalWidth: w, naturalHeight: h, zoom, panX, panY });
          near(ratio(g), 0.8);
          assert.ok(g.sx >= -1e-6 && g.sy >= -1e-6, 'starts inside');
          assert.ok(g.sx + g.sw <= w + 1e-6 && g.sy + g.sh <= h + 1e-6, 'ends inside');
        }
      }
    }
  });

  test('a landscape photo at zoom 1 can move sideways but not up or down', () => {
    const g = cropGeometry({ naturalWidth: 4000, naturalHeight: 3000, zoom: 1, panX: 0, panY: 0.3 });
    assert.ok(g.roomX > 0);
    assert.equal(g.roomY, 0);
    near(g.sh, 3000);
    near(g.sx, 0, 1e-6);
    near(cropGeometry({ naturalWidth: 4000, naturalHeight: 3000, zoom: 1, panX: 1, panY: 0 }).sx + g.sw, 4000);
  });

  test('a photo already 4:5 has no room until zoomed — the old slider did nothing here', () => {
    const flat = cropGeometry({ naturalWidth: 1200, naturalHeight: 1500, zoom: 1, panX: 0.5, panY: 0 });
    assert.equal(flat.roomX, 0);
    assert.equal(flat.roomY, 0);
    const zoomed = cropGeometry({ naturalWidth: 1200, naturalHeight: 1500, zoom: 2, panX: 0.5, panY: 0 });
    near(zoomed.sw, 600);
    near(zoomed.sx, 300);
    near(zoomed.sy, 0);
  });

  test('the preview box and the crop agree: the frame shows exactly the cropped part', () => {
    const w = 3000;
    const h = 4000;
    const g = cropGeometry({ naturalWidth: w, naturalHeight: h, zoom: 1.5, panX: 0.2, panY: 0.8 });
    // The frame is [0,100]%; the image's left edge sits at leftPct, its width widthPct.
    near(((0 - g.leftPct) / g.widthPct) * w, g.sx, 1e-6);
    near(((100 - g.topPct) / g.heightPct) * h, g.sy + g.sh, 1e-6);
  });

  test('dragging right moves the photo right (the frame left); no room, no change', () => {
    const g = cropGeometry({ naturalWidth: 4000, naturalHeight: 3000, zoom: 1, panX: 0.5, panY: 0.5 });
    const after = panAfterDrag(g, { x: 0.5, y: 0.5 }, 20, 20, 200);
    assert.ok(after.x < 0.5);
    assert.equal(after.y, 0.5, 'no vertical room');
    assert.deepEqual(panAfterDrag(g, { x: 0, y: 0.5 }, 500, 0, 200), { x: 0, y: 0.5 }, 'clamped');
  });
});
