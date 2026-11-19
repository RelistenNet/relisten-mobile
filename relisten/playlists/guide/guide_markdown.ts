import type {
  BlockContent,
  Break,
  Definition,
  Link,
  Nodes,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Text,
} from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { type Handle, toMarkdown } from 'mdast-util-to-markdown';

/**
 * Sanitizes guide descriptions (segment, track and text-block Markdown) into
 * the subset the design doc allows, before they reach the renderer.
 *
 * react-native-enriched-markdown can't be limited to a subset, and it loads
 * images and plays `<video>`. So every description passes through here, and
 * the renderer only ever sees the output. The server also refuses images, raw
 * HTML and other link destinations, but this is the guard that counts: the
 * renderer's parser can read edge cases differently from the server's, and
 * rows can predate a rule.
 *
 * Callers sanitize once, when a description is written to Realm, and store the
 * result with `GUIDE_MARKDOWN_VERSION`. Parsing costs about 5 ms for a
 * 2,000-character description on an interpreter, too much to repeat per render.
 * The output is stable: sanitizing it again returns it unchanged.
 */

/**
 * Bump when the output for any input changes, so stored results are redone.
 * The output snapshot in `guide_markdown.test.ts` fails when output changes.
 */
export const GUIDE_MARKDOWN_VERSION = 1;

/**
 * Who owns the description. Bare timestamps link only in a track's own
 * description, and only once its duration is known. `#t=` links without an
 * entry point at that track, so they are text anywhere else.
 */
export type GuideTextContext =
  | { kind: 'segment' }
  | { kind: 'text' }
  | { kind: 'track'; durationSeconds?: number };

// region Grammar

/** `m:ss` or `h:mm:ss`. Seconds are always two digits. The server uses the same grammar. */
const TIMESTAMP = String.raw`(?:[0-9]+:[0-5][0-9]:[0-5][0-9]|[0-9]+:[0-5][0-9])`;
const ENTRY_TIMESTAMP_LINK = new RegExp(`^#entry=playlist_entry_[0-9a-z]{26}&t=${TIMESTAMP}$`);
const OWN_TIMESTAMP_LINK = new RegExp(`^#t=${TIMESTAMP}$`);
/** A timestamp standing on its own, not part of a longer number or word. */
const BARE_TIMESTAMP = new RegExp(`(?<![\\w:])${TIMESTAMP}(?![\\w:])`, 'g');
/** Cheap check before looking for timestamps at all. */
const MAY_HAVE_TIMESTAMP = /[0-9]:[0-5][0-9]/;

/**
 * No whitespace or control characters, matching the server's
 * `char.IsWhiteSpace || char.IsControl` check.
 */
// eslint-disable-next-line no-control-regex -- control characters are what it rejects
const HTTPS_LINK = /^https:\/\/[^\s\x00-\x1f\x7f-\x9f]+$/i;

// endregion

// region Plain-prose fast path

/*
 * Text that matches none of these is already in the subset, so it skips the
 * parser. Together they must cover every character or line shape that starts
 * a construct the parser acts on; adding parser features means adding here.
 */
/** Links, images, HTML, entities, escapes, code spans, emphasis, ATX headings and quotes. */
const INLINE_MARKUP = /[[\]!<>`\\&*_#~|=]/;
/** Indented code: four spaces or a tab at the start of a line. */
const INDENTED_CODE = /^(?: {4}|\t)/m;
/** List items: a bullet or `1.` / `1)` followed by a space or the end of the line. */
const LIST_MARKER = /^\s*(?:[-+*]|[0-9]+[.)])(?:\s|$)/m;
/** Setext heading underlines and thematic breaks. */
const UNDERLINE = /^\s*[-=]{2,}\s*$/m;

function isPlainProse(source: string) {
  return (
    !INLINE_MARKUP.test(source) &&
    !INDENTED_CODE.test(source) &&
    !LIST_MARKER.test(source) &&
    !UNDERLINE.test(source)
  );
}

// endregion

export function sanitizeGuideMarkdown(source: string, context: GuideTextContext): string {
  if (isPlainProse(source) && !linksTimestamps(context, source)) {
    return source;
  }

  try {
    const tree = fromMarkdown(source);
    const sanitizer = new GuideSanitizer(context, tree);
    return write({ type: 'root', children: sanitizer.blocks(tree.children) });
  } catch {
    // Parsing and writing recurse once per nesting level, so a description
    // nested thousands deep can exhaust the stack. Never fall back to the
    // source: show it as plain text instead.
    return write({ type: 'root', children: [paragraph(linesOf(source))] });
  }
}

/** The seconds a `m:ss` or `h:mm:ss` timestamp names. */
export function timestampSeconds(timestamp: string): number {
  return timestamp.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

/** Whether a link may stay a link in this context. Anything else renders as its label. */
export function isAllowedGuideLink(url: string, context: GuideTextContext): boolean {
  return (
    HTTPS_LINK.test(url) ||
    ENTRY_TIMESTAMP_LINK.test(url) ||
    (context.kind === 'track' && OWN_TIMESTAMP_LINK.test(url))
  );
}

function linksTimestamps(context: GuideTextContext, source: string) {
  return (
    context.kind === 'track' && context.durationSeconds != null && MAY_HAVE_TIMESTAMP.test(source)
  );
}

function write(tree: Root) {
  return toMarkdown(tree, {
    bullet: '-',
    emphasis: '*',
    strong: '*',
    handlers: { link: writeLink },
  }).trimEnd();
}

/**
 * Rebuilds a parsed description from allowed nodes only. Every node type is
 * handled explicitly, and an unknown type is dropped, so syntax a later parser
 * version adds can't pass through unexamined.
 *
 * Text that leaves its construct, such as a code span or an image's alt text,
 * is treated like any other text, including timestamp linking. Otherwise the
 * next pass would see it as ordinary prose and link it, and stored results
 * would change when re-sanitized.
 */
class GuideSanitizer {
  /** Reference links resolve through definitions, which may appear anywhere. */
  private readonly definitions = new Map<string, Definition>();
  private readonly referenced = new Set<string>();

  constructor(
    private readonly context: GuideTextContext,
    tree: Root
  ) {
    this.collectReferences(tree);
  }

  blocks(nodes: RootContent[]): BlockContent[] {
    return nodes.flatMap((node) => this.block(node));
  }

  private block(node: RootContent): BlockContent[] {
    switch (node.type) {
      case 'paragraph':
        return [paragraph(this.inline(node.children))];
      case 'heading':
        // Only `##` and `###`; the playlist name is the page's title.
        return node.depth === 2 || node.depth === 3
          ? [{ type: 'heading', depth: node.depth, children: this.inline(node.children) }]
          : [paragraph(this.inline(node.children))];
      case 'blockquote':
        return [{ type: 'blockquote', children: this.blocks(node.children) }];
      case 'list':
        return [
          {
            type: 'list',
            ordered: node.ordered,
            start: node.start,
            spread: node.spread,
            children: node.children.map((item) => ({
              type: 'listItem',
              spread: item.spread,
              children: this.blocks(item.children),
            })),
          },
        ];
      case 'code':
      case 'html':
        // Shown as the literal source, never interpreted.
        return [paragraph(this.plainLines(node.value))];
      case 'definition':
        // A used definition already became its links. An unused one is text
        // that happens to look like one, such as `[Encore]: Brokedown`.
        return this.referenced.has(node.identifier)
          ? []
          : [paragraph(this.plainText(definitionSource(node)))];
      default:
        // Thematic breaks, and anything unknown.
        return [];
    }
  }

  /**
   * `insideLink` stops timestamp linking inside a link's label. Links never
   * nest, because the parser closes an outer link before an inner one opens.
   */
  private inline(nodes: PhrasingContent[], insideLink = false): PhrasingContent[] {
    return nodes.flatMap((node) => this.phrasing(node, insideLink));
  }

  private phrasing(node: PhrasingContent, insideLink: boolean): PhrasingContent[] {
    switch (node.type) {
      case 'text':
        return this.plainText(node.value, insideLink);
      case 'emphasis':
      case 'strong':
        return [{ type: node.type, children: this.inline(node.children, insideLink) }];
      case 'break':
        return [node];
      case 'inlineCode':
      case 'html':
        return this.plainText(node.value, insideLink);
      case 'image':
      case 'imageReference':
        // Never fetched: an image is its alt text.
        return this.plainText(node.alt ?? '', insideLink);
      case 'link':
        return this.link(node.url, node.children);
      case 'linkReference': {
        const definition = this.definitions.get(node.identifier);
        return definition
          ? this.link(definition.url, node.children)
          : this.inline(node.children, insideLink);
      }
      default:
        return [];
    }
  }

  private link(url: string, children: PhrasingContent[]): PhrasingContent[] {
    if (!isAllowedGuideLink(url, this.context)) {
      return this.inline(children);
    }

    const link: Link = { type: 'link', url, children: this.inline(children, true) };
    return [link];
  }

  /** Multi-line literal text, one line per hard break. */
  private plainLines(value: string): PhrasingContent[] {
    return linesOf(value).flatMap((node) =>
      node.type === 'text' ? this.plainText(node.value) : [node]
    );
  }

  /** In a track's description, a bare timestamp within the track becomes a `#t=` link. */
  private plainText(value: string, insideLink = false): PhrasingContent[] {
    const duration = this.context.kind === 'track' ? this.context.durationSeconds : undefined;
    if (insideLink || duration == null) {
      return value ? [text(value)] : [];
    }

    const nodes: PhrasingContent[] = [];
    let copied = 0;
    for (const match of value.matchAll(BARE_TIMESTAMP)) {
      const timestamp = match[0];
      if (timestampSeconds(timestamp) >= duration) {
        continue;
      }

      nodes.push(text(value.slice(copied, match.index)));
      nodes.push({ type: 'link', url: `#t=${timestamp}`, children: [text(timestamp)] });
      copied = match.index + timestamp.length;
    }
    nodes.push(text(value.slice(copied)));

    return nodes.filter((node) => node.type !== 'text' || node.value.length > 0);
  }

  private collectReferences(tree: Root) {
    const visit = (node: Nodes) => {
      if (node.type === 'definition' && !this.definitions.has(node.identifier)) {
        this.definitions.set(node.identifier, node);
      }
      if (node.type === 'linkReference' || node.type === 'imageReference') {
        this.referenced.add(node.identifier);
      }
      if ('children' in node) {
        node.children.forEach(visit);
      }
    };
    visit(tree);
  }
}

// region Writing

/**
 * Writes `[label](destination)` with the destination as-is. The default writer
 * backslash-escapes characters such as `&`, and a renderer that hands the
 * destination to `onLinkPress` without resolving escapes would then report
 * `#entry=…\&t=…`. Every destination here already passed `isAllowedGuideLink`,
 * which rules out whitespace, so only characters that could end the
 * destination or read as an escape or a character reference are encoded.
 */
const writeLink: Handle = (node: Link, _parent, state, info) => {
  const exitLink = state.enter('link');
  const exitLabel = state.enter('label');
  const tracker = state.createTracker(info);

  let value = tracker.move('[');
  value += tracker.move(
    state.containerPhrasing(node, { before: value, after: '](', ...tracker.current() })
  );
  value += tracker.move(`](${encodeDestination(node.url)})`);

  exitLabel();
  exitLink();
  return value;
};

function encodeDestination(url: string) {
  return url
    .replace(/&(?=#?[a-z0-9]+;)/gi, '%26')
    .replace(/[()<>\\]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function definitionSource(definition: Definition) {
  const title = definition.title ? ` "${definition.title}"` : '';
  return `[${definition.label ?? definition.identifier}]: ${definition.url}${title}`;
}

function paragraph(children: PhrasingContent[]): Paragraph {
  return { type: 'paragraph', children };
}

function text(value: string): Text {
  return { type: 'text', value };
}

/**
 * Lines joined by hard breaks. Blank lines collapse, and none lead or trail,
 * because a trailing hard break renders as a literal backslash.
 */
function linesOf(value: string): (Text | Break)[] {
  const lines = value.split(/\n+/).filter((line) => line.length > 0);
  return lines.flatMap((line, index): (Text | Break)[] =>
    index === 0 ? [text(line)] : [{ type: 'break' }, text(line)]
  );
}

// endregion
