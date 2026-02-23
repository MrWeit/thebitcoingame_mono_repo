# License Header Template

Every source file modified or created in this fork must carry the following license header at the top of the file. This ensures compliance with the GPLv3 license and provides clear attribution to both the original author and TheBitcoinGame contributors.

## For Modified Files (originally from ckpool)

Use this header when modifying an existing ckpool source file. Place it at the very top of the file, before any `#include` directives.

```c
/*
 * Copyright (C) Con Kolivas
 * Copyright (C) The Bitcoin Game contributors
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation; either version 3 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, see <https://www.gnu.org/licenses/>.
 *
 * Modifications by The Bitcoin Game contributors:
 * - [Brief description of modifications, e.g., "Added event emission system"]
 */
```

## For New Files (created by this fork)

Use this header for entirely new source files added by this fork.

```c
/*
 * Copyright (C) The Bitcoin Game contributors
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation; either version 3 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, see <https://www.gnu.org/licenses/>.
 */
```

## For Shell Scripts and Configuration Files

Use `#` comment syntax for non-C files:

```bash
# Copyright (C) The Bitcoin Game contributors
#
# This program is free software; you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by the Free
# Software Foundation; either version 3 of the License, or (at your option)
# any later version. See <https://www.gnu.org/licenses/>.
```

## For Python Files (Test Utilities, Scripts)

```python
# Copyright (C) The Bitcoin Game contributors
#
# This program is free software; you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by the Free
# Software Foundation; either version 3 of the License, or (at your option)
# any later version. See <https://www.gnu.org/licenses/>.
```

## Notes

- The full GPLv3 license text is in the [LICENSE](LICENSE) file at the repository root.
- **Do not remove** Con Kolivas's copyright notice from any file that originally contained it.
- When in doubt, include both copyright lines. The GPLv3 permits multiple copyright holders.
- The year is intentionally omitted from the copyright lines, following ckpool's existing convention. If you prefer to include it, use the year of first publication of the modification.
- The `Modifications by` line in the modified-file header is optional but recommended for clarity. It helps future contributors understand what was changed and why.
