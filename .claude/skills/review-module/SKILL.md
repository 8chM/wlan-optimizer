---
name: review-module
description: Comprehensive review of a specific module
user-invocable: true
context: fork
agent: general-purpose
allowed-tools: Read, Grep, Glob, Bash
argument-hint: "[module-path]"
---

# Module Review: $0

Perform a comprehensive review of the module at `$0`.

## Review Areas

1. **Code Quality**: Clean code, no dead code, proper abstractions
2. **TypeScript**: Strict types, no `any`, proper generics
3. **Tests**: Test coverage, edge cases
4. **i18n**: All user-facing strings use translation keys
5. **Security**: No vulnerabilities
6. **Performance**: No bottlenecks
7. **Documentation**: Inline comments where non-obvious

## Output

Provide a structured report with:
- Summary of findings
- Issues by severity (critical, warning, info)
- Suggestions for improvement
- Overall verdict
