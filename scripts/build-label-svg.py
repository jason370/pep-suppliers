#!/usr/bin/env python3
"""Build Canva-compatible Pep Suppliers label SVG template (RC-029b)."""
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOGO_B64 = base64.b64encode((ROOT / "assets" / "logo-wordmark.png").read_bytes()).decode()

SVG = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="700" viewBox="0 0 2400 700">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700&amp;family=Open+Sans:wght@400;600&amp;display=swap');
      .heading {{ font-family: 'Montserrat', Arial, sans-serif; font-weight: 700; fill: #0D1B2A; }}
      .body {{ font-family: 'Open Sans', Arial, sans-serif; fill: #0D1B2A; }}
      .teal {{ fill: #0EA5A5; }}
      .white {{ fill: #FFFFFF; }}
      .navy {{ fill: #0D1B2A; }}
    </style>
    <pattern id="honeycomb" width="28" height="24" patternUnits="userSpaceOnUse">
      <path d="M14 2 L26 9 L26 15 L14 22 L2 15 L2 9 Z" fill="none" stroke="#D2DAE4" stroke-width="1"/>
    </pattern>
  </defs>

  <!-- FRONT LABEL 1.50 x 1.75 in @300dpi = 450 x 525 -->
  <g id="front-label" transform="translate(20,20)">
    <text x="0" y="-6" class="teal body" font-size="14">FRONT LABEL (1.50" x 1.75")</text>
    <rect width="450" height="525" fill="#FFFFFF" stroke="#0D1B2A" stroke-width="2"/>
    <rect width="450" height="525" fill="url(#honeycomb)" opacity="0.55"/>
    <image href="data:image/png;base64,{LOGO_B64}" x="125" y="18" width="200" height="95" preserveAspectRatio="xMidYMid meet"/>
    <line x1="197" y1="118" x2="253" y2="118" stroke="#0EA5A5" stroke-width="2"/>
    <text id="peptide-name" x="225" y="175" text-anchor="middle" class="heading" font-size="34">TIRZEPATIDE</text>
    <rect id="mg-badge-bg" x="165" y="190" width="120" height="34" rx="6" fill="#0EA5A5"/>
    <text id="mg-badge" x="225" y="213" text-anchor="middle" class="heading white" font-size="20">10 MG</text>
    <text id="disclaimer" x="225" y="248" text-anchor="middle" class="body" font-size="10" letter-spacing="0.5">RESEARCH USE ONLY / NOT FOR HUMAN CONSUMPTION</text>
    <rect y="483" width="450" height="42" class="navy"/>
    <text id="lot-batch" x="225" y="510" text-anchor="middle" class="teal body" font-size="12">LOT: 123456 | BATCH: PS-0625</text>
  </g>

  <!-- BACK LABEL -->
  <g id="back-label" transform="translate(520,20)">
    <text x="0" y="-6" class="teal body" font-size="14">BACK LABEL (1.50" x 1.75")</text>
    <rect width="450" height="525" fill="#FFFFFF" stroke="#0D1B2A" stroke-width="2"/>
    <text id="back-header" x="225" y="40" text-anchor="middle" class="teal heading" font-size="18">PRODUCT INFORMATION</text>
    <line x1="120" y1="48" x2="330" y2="48" stroke="#0EA5A5" stroke-width="2"/>
    <text id="info-line-1" x="40" y="85" class="body" font-size="13">• Purity: &gt;99% (HPLC)</text>
    <text id="info-line-2" x="40" y="115" class="body" font-size="13">• Molecular Weight: N/A</text>
    <text id="info-line-3" x="40" y="145" class="body" font-size="13">• Sequence: N/A</text>
    <text id="info-line-4" x="40" y="175" class="body" font-size="13">• Storage: 2-8°C</text>
    <text id="info-line-5" x="40" y="205" class="body" font-size="13">• Lyophilized Powder</text>
    <text id="info-line-6" x="40" y="235" class="body" font-size="13">• For Research Use Only</text>
    <rect id="qr-placeholder" x="40" y="360" width="90" height="90" fill="#FFFFFF" stroke="#0D1B2A" stroke-width="1"/>
    <text x="85" y="410" text-anchor="middle" class="body" font-size="10">QR CODE</text>
    <text id="scan-coa" x="150" y="395" class="body" font-size="12">SCAN FOR COA &amp; MORE</text>
    <text id="scan-url" x="150" y="415" class="teal body" font-size="12">PEPSUPPLIERS.COM</text>
    <rect y="483" width="450" height="42" class="navy"/>
    <text id="back-lot-batch" x="225" y="510" text-anchor="middle" class="teal body" font-size="12">LOT: 123456 | BATCH: PS-0625</text>
  </g>

  <!-- CAP STICKER 1.75" dia = 525px -->
  <g id="cap-sticker" transform="translate(1020,20)">
    <text x="0" y="-6" class="teal body" font-size="14">CAP STICKER (1.75" diameter)</text>
    <circle cx="262.5" cy="262.5" r="262.5" class="navy"/>
    <circle cx="262.5" cy="262.5" r="248" fill="none" stroke="#0EA5A5" stroke-width="2"/>
    <image href="data:image/png;base64,{LOGO_B64}" x="162" y="95" width="200" height="95"/>
    <text id="cap-tagline" x="262.5" y="360" text-anchor="middle" class="white body" font-size="14" letter-spacing="1">QUALITY • PURITY • TRUST</text>
  </g>

  <!-- TAMPER SEAL 0.60 x 2.00 in = 180 x 600 -->
  <g id="tamper-seal" transform="translate(1580,20)">
    <text x="0" y="-6" class="teal body" font-size="14">TAMPER SEAL (0.60" x 2.00")</text>
    <rect width="180" height="600" rx="4" class="navy"/>
    <image href="data:image/png;base64,{LOGO_B64}" x="20" y="30" width="140" height="70"/>
    <circle cx="90" cy="300" r="28" fill="none" stroke="#0EA5A5" stroke-width="2"/>
    <rect x="78" y="292" width="24" height="18" rx="2" fill="none" stroke="#0EA5A5" stroke-width="2"/>
    <path d="M84 292 v-8 a6 6 0 0 1 12 0 v8" fill="none" stroke="#0EA5A5" stroke-width="2"/>
    <text id="tamper-text" x="90" y="520" text-anchor="middle" class="white body" font-size="11">
      <tspan x="90" dy="0">SEALED FOR</tspan>
      <tspan x="90" dy="14">YOUR</tspan>
      <tspan x="90" dy="14">PROTECTION</tspan>
    </text>
  </g>
</svg>
'''

out = ROOT / "labels" / "pep-suppliers-label-template.svg"
out.write_text(SVG, encoding="utf-8")
print(f"Wrote {out}")
