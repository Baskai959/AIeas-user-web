import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const h5NodeClient = readFileSync(resolve(process.cwd(), 'h5_node_client.mjs'), 'utf8');
const h5MigrationGuide = readFileSync(resolve(process.cwd(), 'new_doc/H5用户端移植指南.md'), 'utf8');

const requiredInlineVideoMarkers = [
  'webkit-playsinline',
  'x5-playsinline',
  'x5-video-player-type="h5"',
  'x-webkit-airplay="deny"'
];

describe('mobile inline video compatibility guidance', () => {
  it('keeps the h5 demo videos inside the page on mobile browsers', () => {
    requiredInlineVideoMarkers.forEach((marker) => {
      expect(h5NodeClient).toContain(marker);
    });
  });

  it('documents the same mobile inline video attributes in the migration guide', () => {
    requiredInlineVideoMarkers.forEach((marker) => {
      expect(h5MigrationGuide).toContain(marker);
    });
  });
});
