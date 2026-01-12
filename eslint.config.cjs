/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "docs/build/**",
      "docs/.docusaurus/**",
      "docs/node_modules/**",
      "src/public/js/bundle/**",
    ],
  },
  // Server-side Node.js code
  {
    files: ["src/server/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        console: "readonly",
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-redeclare": "error",
      "no-constant-binary-expression": "error",
    },
  },
  // Browser-side public JS
  {
    files: ["src/public/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        alert: "readonly",
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        location: "readonly",
        crypto: "readonly",
        sessionStorage: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        URLSearchParams: "readonly",
        URL: "readonly",
        File: "readonly",
        FileReader: "readonly",
        Blob: "readonly",
        RTCIceCandidate: "readonly",
        RTCPeerConnection: "readonly",
        RTCSessionDescription: "readonly",
        QRCode: "readonly",
        io: "readonly",
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-redeclare": "error",
      "no-constant-binary-expression": "error",
    },
  },
];
