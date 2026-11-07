import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Exercise our scroll hook together with the installed Gorhom handlers. Native
// animation and derived scroll-lock updates can arrive in different orders.
function loadCallback(path: string, name: string) {
  const source = ts.createSourceFile(
    path,
    ts.sys.readFile(new URL(path, import.meta.url).pathname)!,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let callback: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name)
      callback = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!callback) throw new Error(`Missing scroll hook: ${name}`);
  return ts.transpileModule(`const hook = ${callback.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

const queueHook = loadCallback('./player_queue_tray.tsx', 'useQueueScrollEvents');
const defaultHook = loadCallback(
  '../../../node_modules/@gorhom/bottom-sheet/src/hooks/useScrollEventsHandlersDefault.ts',
  'useScrollEventsHandlersDefault'
);

function scrollHarness() {
  const shared = <T>(value: T) => ({
    value,
    get() {
      return this.value;
    },
    set(value: T | ((previous: T) => T)) {
      this.value = value instanceof Function ? value(this.value) : value;
    },
    modify(update: (previous: T) => T) {
      this.value = update(this.value);
    },
  });
  const state = {
    animatedIndex: shared(1),
    animatedAnimationState: shared({ status: 2 }),
    animatedScrollableState: shared({ contentOffsetY: 350 }),
    animatedScrollableStatus: shared(0),
    animatedSheetState: shared(1),
    animatedHandleGestureState: shared(0),
  };
  const offset = shared(350);
  const queueOffset = shared(350);
  const scrollTo = vi.fn();
  const environment = {
    ANIMATION_STATUS: { RUNNING: 1 },
    SCROLLABLE_STATUS: { LOCKED: 0, UNLOCKED: 1 },
    SHEET_STATE: { EXTENDED: 2, FILL_PARENT: 4 },
    State: { ACTIVE: 4 },
    useCallback: (callback: unknown) => callback,
    useBottomSheetInternal: () => state,
    scrollTo,
  };
  const defaults = new Function(...Object.keys(environment), `${defaultHook}; return hook;`)(
    ...Object.values(environment)
  );
  const queueEnvironment = {
    ...environment,
    useScrollEventsHandlersDefault: defaults,
    useContext: () => ({ offset: queueOffset, transition: shared(null) }),
    QueueScrollContext: {},
    useAnimatedReaction: () => {},
    runOnJS: (callback: unknown) => callback,
  };
  const hook = new Function(...Object.keys(queueEnvironment), `${queueHook}; return hook;`)(
    ...Object.values(queueEnvironment)
  );
  return { state, offset, queueOffset, scrollTo, handlers: hook({}, offset) };
}

describe('queue scroll anchor handoff', () => {
  it.each(['handleOnScroll', 'handleOnEndDrag', 'handleOnMomentumEnd'])(
    'preserves the active row when %s arrives before the expanded scroll lock unlocks',
    (event) => {
      const { handlers, scrollTo, offset, queueOffset } = scrollHarness();
      handlers[event]({ contentOffset: { y: 350 } }, {});
      expect(scrollTo).not.toHaveBeenCalled();
      expect(offset.get()).toBe(350);
      expect(queueOffset.get()).toBe(350);
    }
  );

  it('resumes normal scroll bookkeeping once the expanded list unlocks', () => {
    const { state, handlers, scrollTo, offset } = scrollHarness();
    state.animatedSheetState.set(2);
    state.animatedScrollableStatus.set(1);
    handlers.handleOnEndDrag({ contentOffset: { y: 150 } }, {});
    expect(offset.get()).toBe(150);
    expect(state.animatedScrollableState.get().contentOffsetY).toBe(150);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('retains Gorhom body-scroll locking while the user pulls the sheet down', () => {
    const { state, handlers, scrollTo } = scrollHarness();
    state.animatedIndex.set(0.7);
    handlers.handleOnScroll({ contentOffset: { y: -20 } }, { initialContentOffsetY: 0 });
    expect(scrollTo).toHaveBeenCalledWith(expect.anything(), 0, 0, false);
  });
});
