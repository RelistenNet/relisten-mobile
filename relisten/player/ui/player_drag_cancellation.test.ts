import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Execute the callbacks shipped by our dependency patch, with controllable
// shared values and spring delivery. This does not simulate native gestures.
const librarySource = ts.sys.readFile(
  new URL(
    '../../../node_modules/react-native-draggable-flatlist/src/components/DraggableFlatList.tsx',
    import.meta.url
  ).pathname
);
if (!librarySource) throw new Error('Install dependencies before checking the drag patch.');
const source = ts.createSourceFile(
  'DraggableFlatList.tsx',
  librarySource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

function callbackSource(name: string, file = source) {
  let callback: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const calledName = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : ts.isIdentifier(node.expression)
          ? node.expression.text
          : undefined;
      if (calledName === name) {
        if (
          name !== 'addEventListener' ||
          (ts.isPropertyAccessExpression(node.expression) &&
            node.expression.expression.getText(file) === 'AppState')
        ) {
          callback = node.arguments[name === 'addEventListener' ? 1 : 0];
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!callback) throw new Error(`Missing patched callback: ${name}`);
  return callback.getText(file);
}

function dragHarness() {
  const onDragEnd = vi.fn();
  const onRelease = vi.fn();
  let springCompletion: ((finished: boolean) => void) | undefined;
  let translation = 30;
  const environment = {
    activeKey: 'track',
    activeIndexAnim: { value: 3 },
    spacerIndexAnim: { value: 5 },
    isTouchActiveNative: { value: true },
    touchTranslate: {
      get value() {
        return translation;
      },
      set value(value: number) {
        const canceled = springCompletion;
        springCompletion = undefined;
        translation = value;
        canceled?.(false);
      },
    },
    disabled: { value: false },
    gestureDisabled: { value: false },
    horizontalAnim: { value: false },
    autoScrollDistance: { value: 0 },
    panGestureState: { value: 0 },
    placeholderOffset: { value: 200 },
    activeCellOffset: { value: 100 },
    animationConfigRef: { value: {} },
    onDragEnd,
    onRelease,
    runOnJS: (callback: (...args: unknown[]) => void) => callback,
    withSpring: vi.fn((_target: number, _config: unknown, finished: (value: boolean) => void) => {
      // Shared value assignment starts the spring after evaluating withSpring.
      queueMicrotask(() => {
        springCompletion = finished;
      });
      return 100;
    }),
  };
  const callback = (name: string) =>
    new Function(...Object.keys(environment), `return (${callbackSource(name)});`)(
      ...Object.values(environment)
    );
  return {
    environment,
    end: callback('onEnd') as (
      event: { translationY: number; state: number },
      success: boolean
    ) => void,
    finalize: callback('onFinalize') as (event: { state: number }, success: boolean) => void,
    appState: callback('addEventListener') as (state: string) => void,
    finishSpring: () => {
      springCompletion?.(true);
    },
  };
}

describe('patched drag cancellation lifecycle', () => {
  it('cancels a failed pan without starting a drop spring or moving the queue', () => {
    const h = dragHarness();
    h.end({ translationY: 30, state: 3 }, false);
    expect(h.environment.withSpring).not.toHaveBeenCalled();
    h.finalize({ state: 3 }, false);
    expect(h.environment.onDragEnd).toHaveBeenCalledExactlyOnceWith({ from: 3, to: 3 });
    expect(h.environment.activeIndexAnim.value).toBe(-1);
    expect(h.environment.isTouchActiveNative.value).toBe(false);
    h.finalize({ state: 3 }, false);
    expect(h.environment.onDragEnd).toHaveBeenCalledTimes(1);
  });

  it('clears the lifted index before releasing an unmoved held press', () => {
    const h = dragHarness();
    h.environment.touchTranslate.value = 0;
    Object.defineProperty(h.environment.isTouchActiveNative, 'value', {
      set(active: boolean) {
        if (!active) expect(h.environment.activeIndexAnim.value).toBe(-1);
      },
    });
    h.appState('inactive');
    h.appState('background');
    expect(h.environment.onDragEnd).toHaveBeenCalledExactlyOnceWith({ from: 3, to: 3 });
  });

  it('backgrounding during a drop cancels its spring without dispatching an invalid index', async () => {
    const h = dragHarness();
    h.end({ translationY: 30, state: 5 }, true);
    await Promise.resolve();
    h.appState('background');
    h.finishSpring();
    expect(h.environment.onDragEnd).toHaveBeenCalledExactlyOnceWith({ from: 3, to: 3 });
    expect(h.environment.disabled.value).toBe(false);
    expect(h.environment.activeIndexAnim.value).toBe(-1);
  });

  it('a rejected second gesture does not cancel the first drag while it settles', async () => {
    const h = dragHarness();
    h.end({ translationY: 30, state: 5 }, true);
    await Promise.resolve();
    h.environment.gestureDisabled.value = true;
    h.finalize({ state: 3 }, false);
    expect(h.environment.activeIndexAnim.value).toBe(3);
    expect(h.environment.onDragEnd).not.toHaveBeenCalled();
    h.finishSpring();
    expect(h.environment.onDragEnd).toHaveBeenCalledExactlyOnceWith({ from: 3, to: 5 });
  });

  it('an ordinary successful drop preserves the requested destination', async () => {
    const h = dragHarness();
    h.end({ translationY: 30, state: 5 }, true);
    await Promise.resolve();
    h.finalize({ state: 5 }, true);
    expect(h.environment.onDragEnd).not.toHaveBeenCalled();
    h.finishSpring();
    expect(h.environment.onDragEnd).toHaveBeenCalledExactlyOnceWith({ from: 3, to: 5 });
    expect(h.environment.disabled.value).toBe(false);
  });
});

describe('patched cell cancellation visuals', () => {
  const cellSource = ts.createSourceFile(
    'CellRendererComponent.tsx',
    ts.sys.readFile(
      new URL(
        '../../../node_modules/react-native-draggable-flatlist/src/components/CellRendererComponent.tsx',
        import.meta.url
      ).pathname
    )!,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  function styleHarness(activeKey: string | null) {
    const values = {
      activeIndexAnim: { value: 3 },
      translate: { value: -64 },
      heldTanslate: { value: -64 },
      horizontalAnim: { value: false },
      isWeb: false,
      activeKey,
    };
    const style = new Function(
      ...Object.keys(values),
      `return (${callbackSource('useAnimatedStyle', cellSource)});`
    )(...Object.values(values)) as () => { transform: { translateY: number }[] };
    return { values, style };
  }

  it.each(['track', null])('clears stale transforms on cancellation with activeKey=%s', (key) => {
    const h = styleHarness(key);
    h.values.activeIndexAnim.value = -1;
    // translate may still hold a prior frame when the cancellation flag arrives.
    expect(h.style().transform).toEqual([{ translateY: 0 }]);
    expect(h.values.heldTanslate.value).toBe(0);
    h.values.translate.value = 0;
    expect(h.style().transform).toEqual([{ translateY: 0 }]);
  });

  it('preserves successful-drop handoff until layout while its active index is valid', () => {
    const h = styleHarness(null);
    h.values.translate.value = 0;
    expect(h.style().transform).toEqual([{ translateY: -64 }]);
    // The real onCellLayout clears the held value after reordered layout arrives.
    h.values.heldTanslate.value = 0;
    expect(h.style().transform).toEqual([{ translateY: 0 }]);
  });
});
