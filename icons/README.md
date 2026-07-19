# MapReach icons

The extension ships with placeholder PNG icons referenced by `manifest.json`:

| File | Size | Used for |
| --- | --- | --- |
| `icon16.png` | 16×16 | Toolbar / favicon |
| `icon48.png` | 48×48 | Extensions management page |
| `icon128.png` | 128×128 | Install dialog / Chrome Web Store |

The current icons are a deep-indigo rounded square with a white map pin and a
small amber outreach arrow — matching the MapReach brand direction.

## Replacing the icons

Drop in your own PNGs with the **exact same file names and sizes**. Square,
transparent-background PNGs look best. No manifest change is needed as long as
the names/sizes match.

If a size is missing, Chrome will still load the extension but may show a
default puzzle-piece icon at that size.

## Regenerating the placeholders

A reproducible generator lives at `tools/generate-icons.py` (dev-only, not part
of the loaded extension):

```bash
pip install pillow
cd mapreach
python3 tools/generate-icons.py
```

It renders at high resolution and downsamples to 16/48/128 for crisp edges.
Edit the color constants at the top of the script to rebrand.
