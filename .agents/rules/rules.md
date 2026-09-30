# Execution Rules
1.  **Strict TypeScript:** Enforce `strict: true` in `tsconfig.json`. Zero use of `any` types. Interface definitions are mandatory for all Mongoose schemas and Express request/response bodies.
2.  **No Placeholders:** Generate complete, functional code. Never use `// ... rest of code` or omit logic unless explicitly instructed to write a stub.
3.  **File Operations:** Always verify a directory exists before attempting to write a file to it. When updating an existing file, read it first to ensure no existing logic is overwritten unintentionally.
4.  **Logging:** All backend operations must utilize the custom MongoDB `LogEntry` middleware; do not rely on standard `console.log`.