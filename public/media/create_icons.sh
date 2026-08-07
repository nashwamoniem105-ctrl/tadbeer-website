#!/bin/bash

# Create icon directories and SVG files
mkdir -p sy1fcxcn prtkotev vusdcwge b0pfvbk1 303ouyuw 5srjf1ou

# Create placeholder SVG icons
for id in sy1fcxcn prtkotev vusdcwge b0pfvbk1 303ouyuw 5srjf1ou; do
  cat > $id/icon.svg << 'SVGEOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <circle cx="50" cy="50" r="45" fill="#f0f0f0" stroke="#2196F3" stroke-width="2"/>
  <text x="50" y="55" font-size="40" text-anchor="middle" fill="#2196F3" font-weight="bold">✓</text>
</svg>
SVGEOF
done

echo "تم إنشاء الأيقونات"
