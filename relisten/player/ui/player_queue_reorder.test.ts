/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const libraryPath = join(
  dirname(require.resolve('react-native-reorderable-list/package.json')),
  'src/components/ReorderableListCore.tsx'
);
const library = ts.createSourceFile(
  libraryPath,
  readFileSync(libraryPath, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

// Run the installed dependency's callbacks, including our patch, without a native
// renderer. Revisit these extraction points when upgrading the list dependency.
function findNode(node: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node | undefined {
  if (predicate(node)) return node;
  return ts.forEachChild(node, (child) => findNode(child, predicate));
}

function initializer(name: string) {
  const node = findNode(
    library,
    (node) => ts.isVariableDeclaration(node) && node.name.getText(library) === name
  ) as ts.VariableDeclaration | undefined;
  if (!node?.initializer) throw new Error(`Missing list callback: ${name}`);
  return node.initializer;
}

const reset = (initializer('resetSharedValues') as ts.CallExpression).arguments[0];
const timing = findNode(
  library,
  (node) =>
    ts.isCallExpression(node) &&
    node.expression.getText(library) === 'withTiming' &&
    !!node.arguments[2]?.getText(library).includes('runOnJS(reorder)')
) as ts.CallExpression;

function compile(source: string) {
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

type Mutable = { _value: number; _animation?: unknown; value: number };
const reanimatedPath = join(
  dirname(require.resolve('react-native-reanimated/package.json')),
  'src/valueSetter.ts'
);
const reanimated = {
  exports: {} as { valueSetter: (mutable: Mutable, value: unknown) => void },
  global: { __frameTimestamp: 1 },
};
runInNewContext(compile(readFileSync(reanimatedPath, 'utf8')), reanimated);

function createDrag(from = 0, to = 1) {
  const tasks: (() => void)[] = [];
  const onReorder = vi.fn();
  const callbackFlags: boolean[] = [];
  const dragXY = { _value: 20 } as Mutable;
  Object.defineProperty(dragXY, 'value', {
    get: () => dragXY._value,
    set: (value: number) => reanimated.exports.valueSetter(dragXY, value),
  });
  const draggedIndex = { value: from };
  const currentIndex = { value: to };
  const data = ['A', 'B', 'C'].map((identifier) => ({ identifier }));
  const keyExtractor = vi.fn((item: { identifier: string }) => item.identifier);
  const schedule =
    (fn: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      tasks.push(() => fn(...args));
    };
  const callbacks = runInNewContext(
    compile(`
      const resetSharedValues = ${reset.getText(library)};
      const markCells = ${initializer('markCells').getText(library)};
      const reorder = ${initializer('reorder').getText(library)};
      const completion = ${timing.arguments[2].getText(library)};
      ({ reorder, completion });
    `),
    {
      data,
      draggedIndex,
      currentIndex,
      dragXY,
      onReorder,
      e: { from, to },
      runOnUI: schedule,
      runOnJS: schedule,
      keyExtractorPropRef: { current: keyExtractor },
      markedCellsRef: { current: null },
      ReorderableListState: { IDLE: 0 },
      ...Object.fromEntries(
        [
          'state',
          'dragScrollTranslationXY',
          'scrollViewDragScrollTranslationXY',
          'dragDirection',
          'lastDragDirectionPivot',
          'currentItemDragCenterXY',
        ].map((name) => [name, { value: 0 }])
      ),
    }
  ) as { reorder: (from: number, to: number) => void; completion: (finished: boolean) => void };

  return {
    ...callbacks,
    data,
    draggedIndex,
    currentIndex,
    keyExtractor,
    onReorder,
    callbackFlags,
    completeAnimation() {
      reanimated.exports.valueSetter(dragXY, {
        current: 30,
        onStart() {},
        onFrame: () => true,
        callback(finished: boolean) {
          callbackFlags.push(finished);
          callbacks.completion(finished);
        },
      });
    },
    flush() {
      while (tasks.length) tasks.shift()!();
    },
  };
}

describe('player queue drop callbacks', () => {
  it('reorders once when resetting a completed animation invokes cancellation', () => {
    const drag = createDrag();
    drag.completeAnimation();
    expect(() => drag.flush()).not.toThrow();
    expect(drag.callbackFlags).toEqual([true, false]);
    expect(drag.onReorder).toHaveBeenCalledExactlyOnceWith({ from: 0, to: 1 });
    expect(drag.draggedIndex.value).toBe(-1);
  });

  it('ignores canceled animations', () => {
    const drag = createDrag();
    drag.completion(false);
    drag.flush();
    expect(drag.keyExtractor).not.toHaveBeenCalled();
    expect(drag.onReorder).not.toHaveBeenCalled();
  });

  it('uses the released indexes even if the shared drag indexes change', () => {
    const drag = createDrag();
    drag.draggedIndex.value = -1;
    drag.currentIndex.value = 2;
    drag.completion(true);
    drag.flush();
    expect(drag.onReorder).toHaveBeenCalledExactlyOnceWith({ from: 0, to: 1 });
  });

  it.each([
    [-1, 1],
    [0, -1],
    [3, 0],
    [0, 3],
    [0.5, 1],
    [0, NaN],
    [Infinity, 1],
  ])('rejects invalid indexes %s -> %s before extracting keys', (from, to) => {
    const drag = createDrag();
    drag.reorder(from, to);
    drag.flush();
    expect(drag.keyExtractor).not.toHaveBeenCalled();
    expect(drag.onReorder).not.toHaveBeenCalled();
    expect(drag.draggedIndex.value).toBe(-1);
  });

  it('rejects indexes outside a shortened queue', () => {
    const drag = createDrag(2, 0);
    drag.data.splice(1);
    drag.completion(true);
    drag.flush();
    expect(drag.keyExtractor).not.toHaveBeenCalled();
    expect(drag.onReorder).not.toHaveBeenCalled();
  });

  it('does not reorder a drop at the same position', () => {
    const drag = createDrag(1, 1);
    drag.completeAnimation();
    drag.flush();
    expect(drag.onReorder).not.toHaveBeenCalled();
    expect(drag.draggedIndex.value).toBe(-1);
  });
});
