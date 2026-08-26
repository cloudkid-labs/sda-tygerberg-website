import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import {
  embedPageUrl,
  parseLatestFromEmbedHtml,
  uploadsPlaylistFor,
} from '../src/lib/latestVideo.ts';

/**
 * Builds an embed page the way YouTube serves it: the player response is a
 * JSON document escaped into a JSON string inside the page's config. The
 * double JSON.stringify is the point — it produces exactly the `\"`-escaped
 * shape the parser must undo, so these fixtures exercise the real decoding
 * path rather than a convenient one.
 */
function embedPage(playerResponse) {
  const escaped = JSON.stringify(JSON.stringify(playerResponse));
  return `<html><script>var cfg = {"PLAYER_VARS":{"embedded_player_response":${escaped}}};</script></html>`;
}

function pageWithFirstEntry(videoId, titleRuns) {
  return embedPage({
    previewPlayabilityStatus: { status: 'OK' },
    embedPreview: {
      thumbnailPreviewRenderer: {
        playlist: {
          playlistPanelRenderer: {
            contents: [
              { playlistPanelVideoRenderer: { videoId, title: { runs: titleRuns } } },
              { playlistPanelVideoRenderer: { videoId: 'AAAAAAAAAAA', title: { runs: [{ text: 'older' }] } } },
            ],
          },
        },
      },
    },
  });
}

describe('parseLatestFromEmbedHtml', () => {
  test('takes the first playlist entry, id and title', () => {
    const html = pageWithFirstEntry('e7rN_P9-n2I', [
      { text: '22 Augustus 2026 – Erediens: Youthfest Xtreme' },
    ]);
    assert.deepEqual(parseLatestFromEmbedHtml(html), {
      videoId: 'e7rN_P9-n2I',
      title: '22 Augustus 2026 – Erediens: Youthfest Xtreme',
    });
  });

  test('joins multi-run titles and survives escaped quotes in them', () => {
    const html = pageWithFirstEntry('abc-DEF_123', [{ text: 'Diens: ' }, { text: '"Hoop" & genesing' }]);
    assert.deepEqual(parseLatestFromEmbedHtml(html), {
      videoId: 'abc-DEF_123',
      title: 'Diens: "Hoop" & genesing',
    });
  });

  test('a missing playlist panel is null, not a throw — the Error 153 page', () => {
    const html = embedPage({
      previewPlayabilityStatus: { status: 'ERROR', reason: 'Video player configuration error' },
    });
    assert.equal(parseLatestFromEmbedHtml(html), null);
  });

  test('a page with no player response at all is null', () => {
    assert.equal(parseLatestFromEmbedHtml('<html>Error 404 (Not Found)!!1</html>'), null);
  });

  test('an id that is not an 11-char video id is rejected', () => {
    const html = pageWithFirstEntry('not/a/real/id', [{ text: 'x' }]);
    assert.equal(parseLatestFromEmbedHtml(html), null);
  });

  test('malformed inner JSON is null, not a throw', () => {
    const html = '<html>"embedded_player_response":"{broken"</html>';
    assert.equal(parseLatestFromEmbedHtml(html), null);
  });
});

describe('uploadsPlaylistFor', () => {
  test('maps a channel id to its uploads playlist', () => {
    assert.equal(uploadsPlaylistFor('UCtZlioPBBORWMMMSJ9BE1Wg'), 'UUtZlioPBBORWMMMSJ9BE1Wg');
  });

  test('rejects anything that is not a channel id', () => {
    assert.equal(uploadsPlaylistFor('UUtZlioPBBORWMMMSJ9BE1Wg'), null);
    assert.equal(uploadsPlaylistFor('@SDATygerberg'), null);
    assert.equal(uploadsPlaylistFor(''), null);
  });
});

describe('embedPageUrl', () => {
  test('names the videoseries embed for the playlist', () => {
    assert.equal(
      embedPageUrl('UUtZlioPBBORWMMMSJ9BE1Wg'),
      'https://www.youtube.com/embed/videoseries?list=UUtZlioPBBORWMMMSJ9BE1Wg',
    );
  });
});
