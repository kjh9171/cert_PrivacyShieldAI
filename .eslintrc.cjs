module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['react-refresh'],
  settings: { react: { version: 'detect' } },
  globals: { JSX: 'readonly' },
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // 컴포넌트를 대문자로 시작하도록 강제 (JSX는 소문자면 HTML 태그로 취급됨)
    'react/jsx-pascal-case': ['error', { allowNamespace: true }],
    // TypeScript 미사용 프로젝트이므로 prop-types 강제는 끈다
    'react/prop-types': 'off',
    'react/jsx-uses-vars': 'error',
    'react/jsx-uses-react': 'error',
    // 사용하지 않는 import 를 조용히 넘기지 않는다
    'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      files: ['tests/**/*.mjs', '*.config.js', '*.config.cjs'],
      env: { node: true },
      rules: { 'no-undef': 'off' },
    },
  ],
  ignorePatterns: ['dist', 'node_modules', '*.tmp.mjs'],
}
