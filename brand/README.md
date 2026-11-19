# Orta brand

Orta is a Swiss-army knife of AI utilities for the browser. The mark is an opened multitool seen from the side: four tools fan out of one rivet, and the spark (the AI) rises from the middle. The full brand book (tokens, voice, usage rules and component guidelines) lives in the Orta Brand Kit artifact; this folder holds the source files.

| File | Use |
|---|---|
| `orta-icon.svg` | Primary logo: violet tile, white tools, amber spark. 32 px and up. |
| `orta-icon-small.svg` | 16–24 px: two thicker tools so it reads in the Chrome toolbar. |
| `orta-lockup-ink.svg` / `-white.svg` | Icon + wordmark, for light / dark grounds. |
| `orta-wordmark-ink.svg` / `-white.svg` | Wordmark alone. |
| `orta-glyph-ink.svg` / `-white.svg` / `-violet.svg` | Single-ink glyph without the tile. |
| `orta-glyph-on-dark.svg` | White tools + amber spark; dark grounds only (amber fails contrast on light). |
| `extension-icons/icon-*.svg` | Sources of `public/icons/icon-*.png`. `icon-128` keeps the 16 px transparent padding Chrome Web Store asks for. |

## Palette

| Token | Hex | Role |
|---|---|---|
| violet | `#6C3CE9` | Brand fill: tile, primary button, bubble handle. White text on it is 6.1:1. |
| violet-deep | `#4B21B8` | Rivet, pressed state. |
| spark | `#FFC24B` | The AI only: the spark in the logo, the streaming caret. Never text on light grounds. |
| ink | `#17131F` | Text and single-ink logo on light grounds. |
| paper | `#F6F4FB` / `#120F1A` | Page ground, light / dark. |

No gradients: every brand fill is flat.

## Regenerating

All SVGs come from one geometry in `generate.py`:

```bash
python3 -I brand/generate.py brand
```

Rasterise the extension icons with headless Chrome (transparent background, 1× scale):

```bash
for s in 16 32 48 128; do
  printf '<body style="margin:0"><img src="file://%s/brand/extension-icons/icon-%s.svg" width="%s">' "$PWD" $s $s > "$TMPDIR/orta-icon.html"
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --hide-scrollbars --allow-file-access-from-files \
    --default-background-color=00000000 --force-device-scale-factor=1 --window-size=$s,$s \
    --screenshot="$PWD/public/icons/icon-$s.png" "file://$TMPDIR/orta-icon.html"
done
```
