import React from 'react';

// https://github.com/jsx-eslint/eslint-plugin-react/issues/2760#issuecomment-696668171
export const memo: <T>(c: T) => T = React.memo;
