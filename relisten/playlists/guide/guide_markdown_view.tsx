import { useMemo } from 'react';
import { Linking, useWindowDimensions } from 'react-native';
import { EnrichedMarkdownText, type MarkdownStyle } from 'react-native-enriched-markdown';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { guideLinkAction } from './guide_links';

/**
 * Renders sanitized guide Markdown as native text.
 *
 * Only ever pass output of `sanitizeGuideMarkdown` (stored as
 * `descriptionMarkdown`, read through `renderableDescription`). The renderer
 * can't be limited to the guide subset; the sanitizer is what keeps images,
 * HTML and other links out. Video, math and code highlighting are compiled out
 * in package.json (`enriched-markdown`).
 */
export function GuideMarkdown({
  markdown,
  onTimestamp,
  secondary = false,
}: {
  markdown: string;
  /** A timestamp link was tapped. `entryId` is absent for a track's own `#t=` link. */
  onTimestamp: (entryId: string | undefined, seconds: number) => void;
  /** Quieter text, for a track's note under its title. */
  secondary?: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const markdownStyle = useMemo(() => guideStyle(fontScale, secondary), [fontScale, secondary]);

  return (
    <EnrichedMarkdownText
      markdown={markdown}
      markdownStyle={markdownStyle}
      flavor="commonmark"
      // A single newline is a line break, as it looks in the editor. Callouts
      // (`> [!NOTE]`) and math aren't part of the guide subset.
      md4cFlags={GUIDE_MD4C_FLAGS}
      enableLinkPreview={false}
      selectable
      onLinkPress={({ url }) => {
        const action = guideLinkAction(url);
        if (action.kind === 'timestamp') {
          onTimestamp(action.entryId, action.seconds);
        } else if (action.kind === 'web') {
          void Linking.openURL(action.url);
        }
      }}
    />
  );
}

const GUIDE_MD4C_FLAGS = { hardSoftBreaks: true, admonitions: false, latexMath: false };

/**
 * Text sizes follow the rest of the playlist screen. Links the guide doesn't
 * allow, such as a bare `http://` URL the renderer links on its own, are drawn
 * as plain text: tapping them does nothing (`guideLinkAction`).
 */
function guideStyle(fontScale: number, secondary: boolean): MarkdownStyle {
  const body = (secondary ? 14 : 16) * fontScale;
  const color = secondary ? '#d1d5db' : '#f3f4f6';
  const text = { fontSize: body, color, lineHeight: body * 1.4 };

  return {
    // Every block sets its own color and size; the renderer's defaults are
    // black body text, which disappears on the dark background.
    paragraph: { ...text, marginBottom: body * 0.5 },
    h2: { fontSize: 20 * fontScale, fontWeight: 'bold', color: 'white', marginBottom: 6 },
    h3: { fontSize: 18 * fontScale, fontWeight: 'bold', color: 'white', marginBottom: 4 },
    blockquote: { ...text, borderColor: RelistenBlue[700], borderWidth: 3, gapWidth: 10 },
    list: {
      ...text,
      bulletColor: color,
      markerColor: color,
      // The marker column is the top-level indent (`marginLeft` only indents
      // nested lists), with room between the marker and its text.
      markerMinWidth: body * 0.75,
      gapWidth: body * 0.75,
      marginBottom: body * 0.5,
    },
    link: { color: RelistenBlue[400], underline: false },
    linkVariants: {
      // The sanitizer keeps `HTTPS://` links too. Patterns take no flags on the
      // native side, so the scheme's case is spelled out.
      '^(?![Hh][Tt][Tt][Pp][Ss]://|#)': { color, underline: false },
    },
  };
}
