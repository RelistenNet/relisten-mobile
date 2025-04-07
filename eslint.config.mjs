import main from '@switz/eslint-config/eslint.config.mjs';
import react from '@switz/eslint-config/react.mjs';
import typescript from '@switz/eslint-config/typescript.mjs';

export default [...react, ...typescript, ...main];
