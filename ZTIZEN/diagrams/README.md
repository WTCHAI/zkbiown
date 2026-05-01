# ZKBIOWN System Diagrams

**Created:** 2026-03-29
**Purpose:** Professional system architecture diagrams for research paper

---

## 📁 Files Created

### Mermaid Diagrams (.mmd files)
1. `fig1-enrollment-flow.mmd` - Complete enrollment pipeline
2. `fig2-verification-flow.mmd` - Verification with ZK proofs
3. `fig3-system-overview.mmd` - System architecture (5 layers)
4. `fig4-key-distribution.mmd` - Key distribution sequence diagram

### Draw.io Diagrams (.drawio files)
1. `fig4-key-distribution-simple.drawio` - Key distribution flowchart (like your example)

---

## 🚀 How to Use

### Option 1: Mermaid Diagrams (Recommended for Quick Editing)

**Step 1:** Go to [https://mermaid.live/](https://mermaid.live/)

**Step 2:** Copy the content from any `.mmd` file

**Step 3:** Paste into the Mermaid Live Editor

**Step 4:** Export as PNG or SVG
- Click "Actions" → "Export" → "PNG" (for 300 DPI, select "Scale 3x")
- Or export as SVG (vector format, best for papers)

**Example:**
```bash
# Copy content from file
cat fig1-enrollment-flow.mmd | pbcopy

# Then paste into https://mermaid.live/
# Click Export → PNG (Scale 3x for 300 DPI)
```

---

### Option 2: Draw.io (Best for Custom Editing)

**Step 1:** Go to [https://app.diagrams.net/](https://app.diagrams.net/)

**Step 2:** File → Open from → Device

**Step 3:** Select `fig4-key-distribution-simple.drawio`

**Step 4:** Edit as needed
- Double-click boxes to change text
- Click connectors to change arrow styles
- Right panel: Change colors, fonts, sizes

**Step 5:** Export for paper
- File → Export as → PDF (vector, best quality)
- File → Export as → PNG (select 300 DPI)

---

### Option 3: Use in Markdown/Jupyter Notebooks

**Direct Mermaid Rendering:**

```markdown
\`\`\`mermaid
[paste content from .mmd file here]
\`\`\`
```

Works in:
- GitHub README.md
- GitLab
- Jupyter Notebooks (with mermaid extension)
- VS Code (with Markdown Preview Mermaid Support extension)

---

## 📊 Diagram Descriptions

### Fig. 1: Enrollment Flow (`fig1-enrollment-flow.mmd`)

**Shows:**
- 5-step enrollment pipeline
- Face capture → Embedding → Key derivation → BioHashing → Poseidon → Blockchain

**Key Features:**
- Three-party key system (Kp, Kz, Ku) with distinct colors
- Gaussian + Gram-Schmidt orthogonalization
- NFT credential minting

**Use in paper:** Section III (Methodology - Enrollment)

---

### Fig. 2: Verification Flow (`fig2-verification-flow.mmd`)

**Shows:**
- Prover side (user device) vs Verifier side (blockchain)
- Zero-knowledge proof generation/verification
- Private vs public data separation

**Key Features:**
- Split layout (Prover | Verifier)
- Hamming distance computation (private)
- Groth16 proof verification (public)

**Use in paper:** Section III (Methodology - Verification)

---

### Fig. 3: System Overview (`fig3-system-overview.mmd`)

**Shows:**
- Complete 5-layer architecture
- User → Application → Backend → Blockchain → Key Management

**Key Features:**
- Client-side BioHashing engine
- Backend services (ZTIZEN + Product APIs)
- Smart contract + NFT credentials

**Use in paper:** Section II (System Architecture) or Section III intro

---

### Fig. 4: Key Distribution (`fig4-key-distribution.mmd` or `.drawio`)

**Shows:**
- Three-party key provisioning protocol
- Sequence diagram showing API calls
- SHA-256 composite key derivation

**Key Features:**
- Kp (Platform) + Kz (ZTIZEN) + Ku (User) → SHA256 → Composite Key
- Security properties: Cancelability, Unlinkability, Three-party control

**Use in paper:** Section III (Methodology - Key Management)

**Note:** Two versions available:
- `.mmd` - Sequence diagram (timeline view)
- `.drawio` - Flowchart (like your screenshot example)

---

## 🎨 Customization Guide

### Changing Colors in Mermaid

Find this section in `.mmd` files:
```
classDef userStyle fill:#F0F0F0,stroke:#333,stroke-width:2px
```

Change colors:
- `fill:#F0F0F0` - Background color (hex code)
- `stroke:#333` - Border color
- `stroke-width:2px` - Border thickness

### Changing Colors in Draw.io

1. Select shape
2. Right panel → "Style"
3. Click color swatches to change fill/stroke

### Adding More Steps

**Mermaid:**
```
NewStep["📌 New Step Name<br/>Description"]
PreviousStep --> NewStep
```

**Draw.io:**
1. Copy existing box (Ctrl+C, Ctrl+V)
2. Drag to position
3. Double-click to edit text
4. Draw arrow: Click source → drag to target

---

## 📐 Export Specifications for Paper

### Recommended Formats

| Format | Use Case | Settings |
|--------|----------|----------|
| **PDF** | LaTeX papers | Vector, best quality |
| **SVG** | Web/modern editors | Vector, scalable |
| **PNG** | Word/PowerPoint | 300 DPI minimum |

### Size Guidelines

- **Single column:** 3.5 inches (89mm) width
- **Double column:** 7 inches (178mm) width
- **Height:** Flexible, typically 3-5 inches

### Mermaid Export (from mermaid.live)

1. Actions → Export → PNG
2. Settings:
   - **Scale:** 3x (for 300 DPI equivalent)
   - **Background:** White
   - **Theme:** Default

### Draw.io Export

**For PDF:**
- File → Export as → PDF
- ✓ Crop
- ✓ Include a copy of my diagram

**For PNG:**
- File → Export as → PNG
- DPI: 300
- ✓ Transparent Background (optional)
- ✓ Selection only (if you want just part of diagram)

---

## 🔧 Integration with LaTeX

### Single Column Figure

```latex
\begin{figure}[t]
\centering
\includegraphics[width=\columnwidth]{diagrams/fig1-enrollment-flow.pdf}
\caption{ZKBIOWN Enrollment Process. Face embeddings are extracted using
FaceNet/ArcFace (512D), transformed via BioHashing with Gaussian projection
and Gram-Schmidt orthogonalization seeded by composite key SHA256(Kp||Kz||Ku),
hashed using Poseidon (ZK-friendly), and stored on-chain as immutable
commitments.}
\label{fig:enrollment}
\end{figure}
```

### Double Column Figure

```latex
\begin{figure*}[t]
\centering
\includegraphics[width=\textwidth]{diagrams/fig3-system-overview.pdf}
\caption{ZKBIOWN System Architecture Overview showing five layers...}
\label{fig:system}
\end{figure*}
```

### Reference in Text

```latex
As shown in Fig.~\ref{fig:enrollment}, the enrollment process consists of
five stages...
```

---

## 🎯 Quick Start (3 Steps)

### For Fig. 4 (Key Distribution) - Like Your Screenshot

**Step 1:** Open Draw.io
```bash
# Go to: https://app.diagrams.net/
# File → Open → fig4-key-distribution-simple.drawio
```

**Step 2:** Edit if needed
- Double-click boxes to change text
- Drag boxes to rearrange

**Step 3:** Export
```
File → Export as → PNG (300 DPI)
Save as: fig4-key-distribution.png
```

**Done!** You now have a publication-ready diagram.

---

### For Other Diagrams (Enrollment, Verification, System Overview)

**Step 1:** Open Mermaid Live
```bash
# Go to: https://mermaid.live/
```

**Step 2:** Copy .mmd file content
```bash
cat fig1-enrollment-flow.mmd
# Copy output
```

**Step 3:** Paste and Export
```
1. Paste into editor (left panel)
2. Diagram appears (right panel)
3. Actions → Export → PNG (Scale 3x)
```

---

## 🆘 Troubleshooting

### Mermaid diagram doesn't render

**Problem:** Syntax error in .mmd file

**Solution:**
- Check for unmatched brackets `[]` `{}`
- Ensure all arrows have valid syntax: `-->`, `-.->`, `==>`
- Remove special characters in labels

### Draw.io file won't open

**Problem:** Corrupted XML or browser issues

**Solution:**
- Try different browser (Chrome recommended)
- Use desktop app: https://github.com/jgraph/drawio-desktop/releases
- Re-copy the .drawio file content

### Exported PNG is blurry

**Problem:** Low DPI setting

**Solution:**
- Mermaid: Use Scale 3x
- Draw.io: Set DPI to 300 minimum
- Use PDF/SVG instead (vector formats, always crisp)

### Colors look different in paper

**Problem:** CMYK vs RGB color space

**Solution:**
- If printing: Convert to CMYK in image editor
- If digital-only: RGB is fine
- Test print on lab printer before final submission

---

## 📚 Additional Resources

### Mermaid Documentation
- https://mermaid.js.org/intro/
- Flowchart syntax: https://mermaid.js.org/syntax/flowchart.html
- Sequence diagram syntax: https://mermaid.js.org/syntax/sequenceDiagram.html

### Draw.io Documentation
- https://www.drawio.com/doc/
- Video tutorials: https://www.youtube.com/c/drawio

### IEEE Paper Format Guidelines
- IEEE Template: https://www.ieee.org/conferences/publishing/templates.html
- Figure guidelines: Minimum 8pt font, 300 DPI images

---

## 💡 Tips for Professional Diagrams

### Visual Design

✅ **DO:**
- Use consistent colors across all diagrams
- Align boxes to grid (enable grid snap)
- Use clear, readable fonts (minimum 10-11pt)
- Add emojis sparingly for visual interest (🔐, 📊, ⛓️)
- Keep it simple - remove unnecessary details

❌ **DON'T:**
- Mix too many colors (max 5-6 per diagram)
- Use tiny fonts (<8pt)
- Overcrowd diagrams (leave white space)
- Use clipart or low-res icons
- Make arrows cross unnecessarily

### Technical Accuracy

✅ **DO:**
- Verify algorithm names (Gaussian, Gram-Schmidt, Poseidon, Groth16)
- Show correct dimensions (128 bits, 512D, 32 bytes)
- Use proper notation (Kp, Kz, Ku, ⊕, ≤, ∈, ℝ)
- Match code implementation (check experimental/utils/)

❌ **DON'T:**
- Invent algorithm names
- Show impossible data flows
- Contradict the code implementation
- Use inconsistent terminology

### Paper Integration

✅ **DO:**
- Reference every figure in text ("as shown in Fig. 1")
- Write descriptive captions (2-3 sentences)
- Number figures sequentially (Fig. 1, Fig. 2, ...)
- Place figures near first reference

❌ **DON'T:**
- Include figures without mentioning them in text
- Use vague captions ("System diagram")
- Change figure order after text is written
- Place all figures at end of paper

---

## 🎓 Figure Captions (Copy-Paste Ready)

### Fig. 1: Enrollment Flow
```
Fig. 1. ZKBIOWN Enrollment Process. Face embeddings are extracted using
FaceNet/ArcFace (512D), transformed via BioHashing with Gaussian projection
and Gram-Schmidt orthogonalization seeded by composite key SHA256(Kp||Kz||Ku),
hashed using Poseidon (ZK-friendly), and stored on-chain as immutable
commitments. The NFT credential enables user-owned biometric templates.
```

### Fig. 2: Verification Flow
```
Fig. 2. ZKBIOWN Verification Process with Zero-Knowledge Proof. The prover
(user) generates a fresh biometric template B' using the same keys (Kp||Kz||Ku),
computes Hamming distance dₕ against enrolled template, and generates a Groth16
zero-knowledge proof π proving dₕ ≤ τ without revealing templates. The verifier
checks the proof against on-chain commitment H_enrolled, granting access only if
proof is valid. Private biometric data never leaves the user device.
```

### Fig. 3: System Overview
```
Fig. 3. ZKBIOWN System Architecture Overview. The system consists of five
layers: (1) User Layer for biometric capture, (2) Application Layer with
client-side BioHashing and ZK proof engines, (3) Backend Services for key
provisioning and metadata storage, (4) Blockchain Layer for immutable
commitment storage and NFT credential management, and (5) Key Management
for three-party key distribution (Kp, Kz, Ku). Biometric processing occurs
entirely client-side, ensuring privacy.
```

### Fig. 4: Key Distribution
```
Fig. 4. Three-Party Key Distribution and Composite Key Derivation. Users
generate secret key Ku locally, retrieve platform key Kp from Product Service
and service key Kz from ZTIZEN Service. Composite key K_composite = SHA256(Kp
|| Kz || Ku) seeds the BioHashing RNG, ensuring template determinism while
maintaining cancelability (change any key → new template) and unlinkability
(different keys → uncorrelated templates, experimentally validated at 0%
cross-key similarity).
```

---

## ✅ Publication Checklist

Before submitting your paper, verify:

### File Format
- [ ] All diagrams exported as PDF (vector) or 300+ DPI PNG
- [ ] File names match references (fig1-enrollment-flow.pdf, etc.)
- [ ] No transparency issues (white background for non-transparent PNGs)

### Visual Quality
- [ ] All text readable at print size (minimum 8pt)
- [ ] Sufficient contrast (works in grayscale)
- [ ] No pixelation or blurriness
- [ ] Consistent style across all figures

### Technical Accuracy
- [ ] Algorithm names correct
- [ ] Dimensions/sizes accurate (128 bits, 512D, 32 bytes)
- [ ] Flow directions logical (left-to-right, top-to-bottom)
- [ ] Matches code implementation

### Paper Integration
- [ ] All figures referenced in text
- [ ] Figure numbers sequential
- [ ] Captions complete and informative
- [ ] Figures placed near first reference

---

**Need Help?**

If diagrams don't look right:
1. Check this README's troubleshooting section
2. Try different export settings (PDF vs PNG, higher DPI)
3. Use Draw.io desktop app instead of web version
4. Validate .mmd syntax at https://mermaid.live/

---

**Good luck with your paper! 🎓📄**
