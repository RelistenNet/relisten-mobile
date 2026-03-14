import main from '@switz/eslint-config/eslint.config.mjs';
import react from '@switz/eslint-config/react.mjs';
import reactCompiler from 'eslint-plugin-react-compiler';

export default [...main, ...react, reactCompiler.configs.recommended];
