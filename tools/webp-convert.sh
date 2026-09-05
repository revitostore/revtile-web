#!/usr/bin/env bash
# Genera las versiones WebP de todas las imágenes de assets/ y comprime los
# videos. Requiere ImageMagick y ffmpeg. Se ejecuta a mano cuando se añaden
# fotos nuevas, no en cada deploy.
#
#   bash tools/webp-convert.sh
#
# Después:  node tools/webp.mjs   (para que el HTML las use)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Imágenes → WebP"
python3 - <<'PY'
import os, subprocess
CAP = {'assets/galeria': 1100, 'assets/testimonios': 1000, 'assets/video': 900, 'assets': 900}
saltar = ('favicon', 'apple-touch')
antes = despues = 0
for root, _, files in os.walk('assets'):
    r = root.replace('\\', '/')
    for f in sorted(files):
        if not f.lower().endswith(('.png', '.jpg', '.jpeg')):        continue
        if f.startswith(saltar) or f == 'og-card.jpg':               continue
        src = os.path.join(r, f)
        dst = os.path.splitext(src)[0] + '.webp'
        cap = CAP.get(r, 900)
        q = '88' if f.lower().endswith('.png') else '80'
        subprocess.run(['convert', src, '-strip', '-resize', '%dx%d>' % (cap, cap * 2),
                        '-quality', q, '-define', 'webp:method=6', dst], check=True)
        antes += os.path.getsize(src); despues += os.path.getsize(dst)
print('  %.1f MB -> %.1f MB (%.0f%% menos)' % (antes / 1048576, despues / 1048576, 100 - 100 * despues / antes))
PY

echo "Videos → 720p CRF 30, sin audio"
for v in assets/video/*.mp4; do
  tmp="${v%.mp4}.tmp.mp4"
  ffmpeg -y -loglevel error -i "$v" -vf "scale='min(720,iw)':-2" \
         -c:v libx264 -crf 30 -preset slow -an -movflags +faststart "$tmp"
  mv "$tmp" "$v"
  printf '  %-34s %6.0f KB\n' "$v" "$(( $(stat -c%s "$v") / 1024 ))"
done
