import { type ComponentRef, useCallback, useRef } from 'react';
import type { ScrollView, View } from 'react-native';

/** Room left above the focused file, so the set header above it stays in view. */
const FOCUSED_ROW_TOP_MARGIN = 96;

/**
 * Scrolls a focused file into view once, after it has laid out. The row is
 * measured against the scroll view's content, so header height and set
 * headers above it are accounted for.
 */
export function useScrollFocusedRowIntoView() {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const contentRef = useRef<ComponentRef<typeof View>>(null);
  const hasScrolled = useRef(false);

  const attachFocusedRow = useCallback((row: ComponentRef<typeof View> | null) => {
    if (!row || hasScrolled.current) {
      return;
    }

    requestAnimationFrame(() => {
      const content = contentRef.current;
      if (!content || hasScrolled.current) {
        return;
      }
      row.measureLayout(content, (_x: number, y: number) => {
        hasScrolled.current = true;
        scrollRef.current?.scrollTo({ y: Math.max(0, y - FOCUSED_ROW_TOP_MARGIN), animated: true });
      });
    });
  }, []);

  return { scrollRef, contentRef, attachFocusedRow };
}
