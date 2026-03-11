<p align="center">
    <img src="https://raw.githubusercontent.com/welpo/kawari/main/app/logo.png" width="120" alt="kawari logo: two overlapping documents, one green and one red, representing diff comparison">
</p>
<h1 align="center">kawari</h1>

<p align="center">
    <a href="#contributing">
        <img src="https://img.shields.io/badge/PRs-welcome-0?style=flat-square&labelColor=202b2d&color=0d9488" alt="PRs welcome"></a>
    <a href="https://diff.osc.garden">
        <img src="https://img.shields.io/website?url=https%3A%2F%2Fdiff.osc.garden&style=flat-square&label=app&labelColor=202b2d&color=0d9488" alt="app status"></a>
    <a href="#license">
        <img src="https://img.shields.io/github/license/welpo/kawari?style=flat-square&labelColor=202b2d&color=0d9488" alt="License"></a>
    <a href="https://github.com/welpo/git-sumi">
        <img src="https://img.shields.io/badge/clean_commits-git--sumi-0?style=flat-square&labelColor=202b2d&color=0d9488" alt="Clean commits"></a>
</p>

<h3 align="center">Private diffs. Shareable URLs.</h3>

A privacy-focused diff tool. Paste two texts, see what changed. No accounts, no tracking, works offline.

## Features

- No server; everything runs locally in the browser
- Share via URL: diffs are compressed and encoded in the URL
- Works offline as an installable PWA
- Minimap: visual overview for navigating large diffs
- Drag and drop files directly into the text areas
- Download patch files compatible with `git apply`
- Ignore options: whitespace, quote style (" vs ')
- Keyboard shortcuts:
  - <kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd>: compare texts
  - <kbd>j</kbd>/<kbd>n</kbd>: next change
  - <kbd>k</kbd>/<kbd>p</kbd>: previous change
  - <kbd>e</kbd>: edit (back to input)
  - <kbd>Shift</kbd>+click on collapsed section: expand/collapse all

## Contributing

Please do! I'd appreciate bug reports, improvements (however minor), suggestions…

The tool uses vanilla JavaScript, HTML, and CSS. To run locally:

1. Clone the repository: `git clone https://github.com/welpo/kawari.git`
2. Navigate to the app directory: `cd diff/app`
3. Start a local server: `python3 -m http.server`
4. Visit `http://localhost:8000` in your browser

The important files are:

- `app.js`: UI logic and event handling
- `diff.js`: diff algorithms (Myers, Patience) and patch generation
- `diff.worker.js`: Web Worker for off-main-thread diffing
- `styles.css`: styles
- `index.html`: structure

### Tests

Tests live in `tests/` and use Node's built-in test runner:

```bash
node --test tests/*.mjs
```

- `patch.test.mjs`: verifies generated patches can be applied with `git apply`. Each test case in `tests/cases/` has an `original.txt` and `modified.txt`.
- `normalization.test.mjs`: tests whitespace/quote normalization logic.

## Need help?

Something not working? Have an idea? Let me know!

- Questions or ideas → [start a discussion](https://github.com/welpo/kawari/discussions)
- Found a bug? → [report it here](https://github.com/welpo/kawari/issues/new?labels=bug)
- Feature request? → [let me know](https://github.com/welpo/kawari/issues/new?labels=feature)

## License

kawari is free software: you can redistribute it and/or modify it under the terms of the [GNU Affero General Public License as published by the Free Software Foundation](./COPYING), either version 3 of the License, or (at your option) any later version.
