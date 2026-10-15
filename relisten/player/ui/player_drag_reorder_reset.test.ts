import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

function dependencySource(filename: string) {
  const path = new URL(
    `../../../node_modules/react-native-draggable-flatlist/src/components/${filename}`,
    import.meta.url
  ).pathname;
  const text = ts.sys.readFile(path);
  if (!text) throw new Error('Install dependencies before checking the drag patch.');
  return ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

const listSource = dependencySource('DraggableFlatList.tsx');
const translateSource = dependencySource('../hooks/useCellTranslate.tsx');

function findNode(file: ts.SourceFile, matches: (node: ts.Node) => boolean): ts.Node {
  let found: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (!found && matches(node)) found = node;
    if (!found) ts.forEachChild(node, visit);
  }
  visit(file);
  if (!found) throw new Error('Missing dependency drag lifecycle code.');
  return found;
}

function callback(file: ts.SourceFile, name: string) {
  const call = findNode(
    file,
    (node) => ts.isCallExpression(node) && node.expression.getText(file) === name
  ) as ts.CallExpression;
  return call.arguments[0].getText(file);
}

describe('patched successful drag reorder', () => {
  it('resets native drag translations after the new data order renders without InteractionManager', () => {
    const resetDeclaration = findNode(
      listSource,
      (node) => ts.isVariableDeclaration(node) && node.name.getText(listSource) === 'reset'
    ) as ts.VariableDeclaration;
    const resetCallback = (resetDeclaration.initializer as ts.CallExpression).arguments[0];
    const dataDeclaration = findNode(
      listSource,
      (node) => ts.isVariableDeclaration(node) && node.name.getText(listSource) === 'dataHasChanged'
    ) as ts.VariableDeclaration;
    const changedBlock = findNode(
      listSource,
      (node) => ts.isIfStatement(node) && node.expression.getText(listSource) === 'dataHasChanged'
    );
    const dataChangeCode = listSource.text.slice(
      dataDeclaration.parent.parent.getStart(listSource),
      changedBlock.end
    );

    const pending: (() => void)[] = [];
    const setActiveKey = vi.fn();
    const activeIndexAnim = { value: 3 };
    const environment = {
      activeIndexAnim,
      spacerIndexAnim: { value: 4 },
      touchTranslate: { value: 64 },
      activeCellSize: { value: 64 },
      activeCellOffset: { value: 200 },
      setActiveKey,
    };
    const reset = new Function(
      ...Object.keys(environment),
      `return (${resetCallback.getText(listSource)});`
    )(...Object.values(environment)) as () => void;
    const dataRef = { current: ['Ocelot', 'Vultures', 'Monsters'] };
    const render = new Function(
      'dataRef',
      'props',
      'keyExtractor',
      'requestIdleCallback',
      'reset',
      // RN 0.88 removed this API. Supplying undefined reproduces its release behavior.
      'InteractionManager',
      `let activeKey = 'Ocelot'; ${dataChangeCode}; return activeKey;`
    );
    const nextData = ['Vultures', 'Ocelot', 'Monsters'];
    const renderReorderedData = () =>
      render(
        dataRef,
        { data: nextData },
        (key: string) => key,
        (task: () => void) => pending.push(task),
        reset,
        undefined
      );

    expect(renderReorderedData()).toBeNull();
    expect(pending).toHaveLength(1);
    pending[0]();
    expect(activeIndexAnim.value).toBe(-1);
    expect(setActiveKey).toHaveBeenCalledExactlyOnceWith(null);

    // Execute the shipped translation calculation after the deferred reset.
    const translateEnvironment = {
      activeIndexAnim,
      cellIndex: 3,
      viewableIndexMin: { value: 0 },
      viewableIndexMax: { value: 10 },
      activeKey: 'Ocelot',
    };
    const translation = new Function(
      ...Object.keys(translateEnvironment),
      `return (${callback(translateSource, 'useDerivedValue')});`
    )(...Object.values(translateEnvironment)) as () => number;
    expect(translation()).toBe(0);
    expect(dataRef.current).toEqual(nextData);
  });
});
