import type { Nodes } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { describe, expect, it } from 'vitest';
import shared from './guide_markdown_vectors.json';
import {
  type GuideTextContext,
  guideTextRefusal,
  isPlainProse,
  sanitizeGuideMarkdown,
  sanitizeParsedGuideMarkdown,
} from './guide_markdown';

interface Vector {
  name: string;
  server: 'accept' | 'reject';
  /** Where this parser reads the text differently from the server's: stricter only. */
  device?: 'reject';
  context: GuideTextContext['kind'];
  durationSeconds?: number;
  markdown: string;
  links: string[];
  text: string[];
}

const vectors = shared.vectors as Vector[];

function contextOf(vector: Vector): GuideTextContext {
  return vector.context === 'track'
    ? { kind: 'track', durationSeconds: vector.durationSeconds }
    : { kind: vector.context };
}

/** What a renderer would see in the sanitized result. */
function rendered(markdown: string) {
  const links: string[] = [];
  const kinds = new Set<string>();
  let text = '';
  const visit = (node: Nodes) => {
    kinds.add(node.type);
    if (node.type === 'link') {
      links.push(node.url);
    }
    if (node.type === 'text') {
      text += node.value;
    }
    if ('children' in node) {
      node.children.forEach(visit);
    }
  };
  visit(fromMarkdown(markdown));
  return { links, kinds, text };
}

describe('sanitizeGuideMarkdown', () => {
  describe.each(vectors)('$name', (vector) => {
    const sanitized = sanitizeGuideMarkdown(vector.markdown, contextOf(vector));
    const result = rendered(sanitized);

    it('keeps only the allowed links', () => {
      expect(result.links).toEqual(vector.links);
    });

    it('renders no image, HTML or code', () => {
      for (const kind of ['image', 'imageReference', 'html', 'code', 'inlineCode', 'definition']) {
        expect(result.kinds).not.toContain(kind);
      }
    });

    it('keeps the text a reader should see', () => {
      for (const expected of vector.text) {
        expect(result.text).toContain(expected);
      }
    });

    it('is stable when sanitized again', () => {
      expect(sanitizeGuideMarkdown(sanitized, contextOf(vector))).toBe(sanitized);
    });
  });

  it.each(vectors)('refuses on the device exactly what the server refuses: $name', (vector) => {
    const refusal = guideTextRefusal(vector.markdown);
    expect(refusal === null ? 'accept' : 'reject').toBe(vector.device ?? vector.server);
  });

  // Stored results carry GUIDE_MARKDOWN_VERSION. If this snapshot changes, bump
  // it so descriptions sanitized by the old rules are redone.
  it('produces the pinned output for every shared vector', () => {
    const outputs = Object.fromEntries(
      vectors.map((vector) => [
        vector.name,
        sanitizeGuideMarkdown(vector.markdown, contextOf(vector)),
      ])
    );
    expect(outputs).toMatchSnapshot();
  });

  it('falls back to plain text when nesting is too deep to parse', () => {
    for (const source of ['>'.repeat(2000) + ' x', '- '.repeat(1000) + 'x']) {
      const sanitized = sanitizeGuideMarkdown(source, { kind: 'segment' });
      expect(rendered(sanitized).text).toContain('x');
      expect(sanitizeGuideMarkdown(sanitized, { kind: 'segment' })).toBe(sanitized);
    }
  });

  it.each(vectors.filter((vector) => isPlainProse(vector.markdown)))(
    'skips parsing only where parsing would change nothing: $name',
    (vector) => {
      expect(sanitizeGuideMarkdown(vector.markdown, contextOf(vector))).toBe(
        sanitizeParsedGuideMarkdown(vector.markdown, contextOf(vector))
      );
    }
  );

  it('leaves bare timestamps alone until the track duration is known', () => {
    expect(sanitizeGuideMarkdown('Listen at 2:00.', { kind: 'track' })).toBe('Listen at 2:00.');
  });
});

describe('link destinations', () => {
  it('writes entry links without escapes', () => {
    const link = '[Later](#entry=playlist_entry_01k8000000e008000000000004&t=6:42)';
    expect(sanitizeGuideMarkdown(link, { kind: 'text' })).toBe(link);
  });

  it('encodes characters that would end the destination', () => {
    expect(
      sanitizeGuideMarkdown('[Phish](<https://en.wikipedia.org/wiki/Phish_(band)>)', {
        kind: 'segment',
      })
    ).toBe('[Phish](https://en.wikipedia.org/wiki/Phish_%28band%29)');
  });
});
