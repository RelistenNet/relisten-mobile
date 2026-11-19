import { describe, expect, it } from 'vitest';
import { toWireOperation } from './playlist_wire';

describe('toWireOperation', () => {
  it('sends a move into a new segment with snake_case fields and no absent anchors', () => {
    const wire = toWireOperation('playlist_operation_x', 4, {
      type: 'move_entry',
      entryId: 'playlist_entry_a',
      destination: { newSegmentId: 'playlist_segment_n', afterSegmentId: 'playlist_segment_s' },
    });

    expect(JSON.parse(JSON.stringify(wire))).toEqual({
      operation_id: 'playlist_operation_x',
      base_revision: 4,
      operation_type: 'move_entry',
      payload: {
        entry_id: 'playlist_entry_a',
        destination: {
          new_segment_id: 'playlist_segment_n',
          after_segment_id: 'playlist_segment_s',
        },
      },
    });
  });

  it('keeps a cleared description as null, distinct from leaving it unchanged', () => {
    const cleared = toWireOperation('op', 1, { type: 'update_metadata', description: null });
    const renamed = toWireOperation('op', 1, { type: 'update_metadata', name: 'Dew' });

    expect(JSON.parse(JSON.stringify(cleared)).payload).toEqual({ description: null });
    expect(JSON.parse(JSON.stringify(renamed)).payload).toEqual({ name: 'Dew' });
  });

  it('sends guide text: descriptions, text blocks and description updates', () => {
    const insert = toWireOperation('op', 2, {
      type: 'insert_segment',
      segmentId: 'playlist_segment_s',
      description: '## Set two',
      entries: [
        { entryId: 'playlist_entry_t', trackId: 'track_1', description: 'Listen at 2:00.' },
        { entryId: 'playlist_entry_x', description: 'A text block' },
      ],
    });
    const clear = toWireOperation('op', 3, {
      type: 'update_entry',
      entryId: 'playlist_entry_t',
      description: null,
    });

    expect(JSON.parse(JSON.stringify(insert)).payload).toEqual({
      segment_id: 'playlist_segment_s',
      description: '## Set two',
      entries: [
        { entry_id: 'playlist_entry_t', track_id: 'track_1', description: 'Listen at 2:00.' },
        { entry_id: 'playlist_entry_x', description: 'A text block' },
      ],
    });
    expect(JSON.parse(JSON.stringify(clear)).payload).toEqual({
      entry_id: 'playlist_entry_t',
      description: null,
    });
  });
});
