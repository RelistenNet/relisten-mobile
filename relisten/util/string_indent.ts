/**
 * Indents each line of the input string by the specified number of levels.
 *
 * @param input - The multiline string to be indented.
 * @param levels - The number of indentation levels.
 * @param spacesPerLevel - The number of spaces per indentation level. Default is 2.
 * @returns The indented multiline string.
 */
export function indentString(
  input: string,
  levels: number = 1,
  spacesPerLevel: number = 2
): string {
  if (!Number.isInteger(levels) || levels < 0) {
    throw new Error('Levels must be a non-negative integer.');
  }
  if (!Number.isInteger(spacesPerLevel) || spacesPerLevel < 0) {
    throw new Error('Spaces per level must be a non-negative integer.');
  }

  const indent = ' '.repeat(spacesPerLevel * levels);
  return input
    .split('\n')
    .map((line) => indent + line)
    .join('\n');
}
