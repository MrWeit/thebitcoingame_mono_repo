# Contributing to TheBitcoinGame Mining Engine

Thank you for your interest in contributing. This project is a fork of ckpool-solo, and we welcome contributions that improve the event system, enhance mining capabilities, fix bugs, or improve documentation.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Communication](#communication)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you agree to uphold a welcoming, inclusive, and respectful environment for all contributors.

In short: be kind, be constructive, and focus on the work.

## Ways to Contribute

### Report Bugs

If you find a bug, please [open an issue](https://github.com/thebitcoingame/mining-engine/issues/new) with:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior vs. actual behavior
- Your environment (OS, compiler version, Bitcoin Core version)
- Relevant log output (sanitize any private information)

### Suggest Features

Feature suggestions are welcome. Before opening an issue:

1. Check existing issues to avoid duplicates
2. Consider whether the feature belongs in this fork or would be better proposed upstream to ckpool
3. Describe the use case, not just the solution

### Submit Pull Requests

We accept PRs for:

- Bug fixes
- New event types or event system enhancements
- Performance improvements
- Documentation improvements
- Test coverage improvements
- Build system improvements

### Improve Documentation

Documentation contributions are highly valued. If you found something confusing while setting up or using the mining engine, fixing the docs helps everyone who comes after you.

## Development Setup

### Prerequisites

- Linux (Ubuntu 22.04+ or Debian 12+ recommended)
- GCC 9+ or Clang 12+
- autoconf, automake, libtool
- libjansson-dev
- Bitcoin Core 25.0+ (for integration testing)
- Python 3.10+ (for test scripts)

### Clone and Build

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/mining-engine.git
cd mining-engine
git remote add upstream https://github.com/thebitcoingame/mining-engine.git

# Build
autoreconf -fi
./configure --enable-debug
make -j$(nproc)
```

The `--enable-debug` flag includes debug symbols and enables additional assertions.

### Run on Signet

Signet is the recommended network for development. See [building.md](building.md) for full setup instructions.

```bash
# Start bitcoind on signet
bitcoind -signet -daemon -rpcuser=btcuser -rpcpassword=btcpass

# Run ckpool with debug logging
./src/ckpool -c ckpool.conf -s /tmp/ckpool -l debug
```

### Run Tests

```bash
# Unit tests
make check

# Integration tests (requires running bitcoind on signet)
python3 tests/integration/run_all.py --network signet

# Event system tests
python3 tests/integration/test_events.py --socket /tmp/ckpool-events.sock
```

See [testing.md](testing.md) for the complete test suite documentation.

## Code Style

This project follows ckpool's existing C coding conventions. Consistency with the upstream codebase is prioritized over personal preference.

### C Code

- **Indentation**: Tabs, not spaces. Tab width is 8.
- **Brace style**: K&R (opening brace on the same line as the statement, except for function definitions).
- **Line length**: Soft limit of 100 characters. Hard limit of 120.
- **Naming**: `snake_case` for functions and variables. `UPPER_CASE` for macros and constants.
- **Comments**: Use `/* */` for multi-line comments, `//` is acceptable for single-line comments.
- **Pointer declarations**: `char *ptr`, not `char* ptr`.
- **Function definitions**: Return type on its own line, opening brace on its own line.

Example:

```c
static void
emit_share_event(const stratum_instance_t *client, const double diff,
		 const bool accepted)
{
	json_t *event;

	if (!events_enabled())
		return;

	event = json_object();
	json_object_set_new(event, "type", json_string("share.submitted"));
	json_object_set_new(event, "diff", json_real(diff));
	json_object_set_new(event, "accepted", json_boolean(accepted));

	event_emit(event);
	json_decref(event);
}
```

### Commit Messages

- Use the imperative mood: "Add event emission for difficulty updates", not "Added" or "Adds"
- First line: 50 characters or less, summarizing the change
- Blank line after the first line
- Body: wrap at 72 characters, explain *what* and *why*, not *how*
- Reference issues where relevant: `Fixes #42` or `Related to #17`

Example:

```
Add bestdiff tracking for weekly time window

Track per-user best difficulty within a rolling 7-day window in
addition to the existing session and all-time tracking. The weekly
window resets at midnight UTC on Monday.

This enables gamification features like weekly leaderboards and
"beat your personal best" challenges.

Related to #23
```

### New Files

All new source files must include the appropriate license header. See [LICENSE-HEADER.md](LICENSE-HEADER.md) for templates.

## Pull Request Process

### 1. Fork and Branch

```bash
# Sync with upstream
git fetch upstream
git checkout main
git merge upstream/main

# Create a feature branch
git checkout -b feature/your-feature-name
```

Branch naming conventions:
- `feature/description` -- New features
- `fix/description` -- Bug fixes
- `docs/description` -- Documentation changes
- `test/description` -- Test additions or fixes
- `refactor/description` -- Code refactoring

### 2. Develop

- Make focused, atomic commits
- Keep PRs reasonably sized (under 500 lines of diff when possible)
- If a change is large, consider splitting it into multiple PRs

### 3. Test

Before submitting:

```bash
# Build must succeed with no warnings
make clean && make -j$(nproc)

# Unit tests must pass
make check

# If you modified the event system, run event tests
python3 tests/integration/test_events.py

# If you modified stratum handling, run stratum tests
python3 tests/integration/test_stratum.py
```

### 4. Submit

- Push your branch to your fork
- Open a PR against the `main` branch of the upstream repository
- Fill in the PR template completely
- Ensure CI passes

### 5. Review

- A maintainer will review your PR, usually within a few business days
- Address review feedback by pushing additional commits (do not force-push during review)
- Once approved, a maintainer will merge the PR

## Testing Requirements

All pull requests must:

- **Pass CI**: The GitHub Actions pipeline must complete without errors.
- **Not regress**: Existing tests must continue to pass.
- **Include tests**: New features must include corresponding tests. Bug fixes should include a regression test where feasible.
- **Test on signet**: If your change affects mining behavior, test it against a signet Bitcoin Core node.

See [testing.md](testing.md) for details on writing and running tests.

## Communication

- **GitHub Issues**: For bug reports, feature requests, and technical discussions.
- **GitHub Discussions**: For broader questions, ideas, and community conversation.
- **Pull Requests**: For code review and implementation discussion.

For security-sensitive issues (vulnerabilities, exploits), please email security@thebitcoingame.xyz rather than opening a public issue.

## Recognition

All contributors are recognized in the project's CHANGELOG and in GitHub's contributor graph. Significant contributions will be acknowledged in release notes.

---

Thank you for helping make solo Bitcoin mining more accessible and engaging.
