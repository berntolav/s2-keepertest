# S2 Keepertest · NBK

Kognitiv testapp for keeperar — optimalisert for iPhone.

## Testar

| # | Test | Måler |
|---|------|-------|
| 1 | Reaksjonstest | Enkel reaksjonstid (RT) |
| 2 | Go / No-Go | Hemmingsevne og impulskontroll |
| 3 | Retningsval | Val-RT (choice reaction time) |
| 4 | Spatielt syn | Romleg merksemd og presisjon |
| 5 | Sekvensminne | Arbeidsminne (working memory) |

Resultatsida viser S2 Score (0–100), per-test vurderingar og personleg kommentar.

---

## Kom i gang lokalt

```bash
# Berre opna index.html direkte i nettlesaren
open index.html

# Eller bruk ein enkel lokal server (t.d. for å teste på telefon på same nettverk)
npx serve .
```

---

## Deploy til Vercel (tilrådd)

### Steg 1 — Push til GitHub
```bash
git init
git add .
git commit -m "første versjon"
gh repo create s2-keepertest --public --push
# eller push manuelt til github.com
```

### Steg 2 — Koble til Vercel
1. Gå til [vercel.com](https://vercel.com) → **Add New Project**
2. **Import** GitHub-repoet `s2-keepertest`
3. Under **Framework Preset** — vel **Other** (statisk HTML)
4. Klikk **Deploy**

Appen er live på `https://s2-keepertest.vercel.app` (eller liknande).

### Steg 3 — Automatisk oppdatering
Etter det første deployet: kvar `git push` til `main` triggar automatisk re-deploy på Vercel.

---

## Bruk på iPhone

Appen er optimalisert for iPhone:
- Brukar `touchstart`-event (0 ms forseinking vs 300 ms ved vanleg `click`)
- Safe area-støtte for Dynamic Island og Home Indicator
- Mørk modus via `prefers-color-scheme`
- `apple-mobile-web-app-capable` — kan lagrast til heimskjermen som ein webapp

**Legg til på heimskjermen:**
Safari → Del-knapp → *Legg til på heimskjerm*

---

## Filstruktur

```
s2-keepertest/
├── index.html    ← heile appen (enkeltfil)
└── README.md
```

Ingen `node_modules`, ingen byggsteg, ingen avhengigheiter.
