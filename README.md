# FestKasse

Kasse für Vereinsfeste: Helfer kassieren auf dem eigenen Handy, Gäste zahlen bar oder mit TWINT, der Verein sieht alles live.

- **Frontend:** reines HTML/CSS/JavaScript, läuft auf GitHub Pages, installierbar als App (PWA)
- **Backend:** Supabase (Datenbank, Login, Live-Abgleich, Fotos, Edge Functions)
- **TWINT:** über Payrexx; das Geld geht direkt aufs Konto des Vereins

Ohne Einstellungen in `config.js` läuft die App im **Demo-Modus**: alle Daten bleiben im Browser, TWINT wird simuliert. So kannst du alles ausprobieren, bevor du etwas einrichtest.

---

## Einrichtung (ca. 30–45 Minuten)

### 1. Supabase-Projekt

1. Auf [supabase.com](https://supabase.com) ein neues Projekt anlegen. Als Region **Zürich (eu-central-2)** wählen, falls angeboten.
2. **SQL Editor** öffnen und nacheinander ausführen:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_storage.sql`
3. **Authentication → Sign In / Providers**
   - «Allow anonymous sign-ins» **einschalten** (Helfer brauchen kein Konto).
   - Unter «Email»: «Confirm email» nach Wunsch. Eingeschaltet ist sicherer; Vereine müssen dann nach der Registrierung einen Link in der E-Mail anklicken.
4. **Authentication → URL Configuration**: «Site URL» auf die Adresse der App setzen, z. B. `https://DEINNAME.github.io/festkasse/`.
5. **Project Settings → API**: «Project URL» und den «anon public» Key kopieren.

### 2. App konfigurieren

In `config.js` eintragen:

```js
export const CONFIG = {
  supabaseUrl: 'https://abcdefghijk.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...',
};
```

Der anon Key darf öffentlich sein. Die Daten schützt die Datenbank selbst (Row Level Security).

### 3. Edge Functions (für TWINT)

Einmalig im Terminal, im Ordner dieses Projekts:

```bash
npx supabase login
npx supabase link --project-ref abcdefghijk          # deine Projekt-ID
npx supabase secrets set APP_URL=https://DEINNAME.github.io/festkasse
npx supabase functions deploy twint-create
npx supabase functions deploy twint-status
npx supabase functions deploy payrexx-webhook --no-verify-jwt
```

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` setzt Supabase automatisch.

### 4. Veröffentlichen auf GitHub Pages

1. Neues Repository `festkasse` anlegen und alle Dateien hochladen (bzw. `git push`).
2. **Settings → Pages**: Source «Deploy from a branch», Branch `main`, Ordner `/ (root)`.
3. Nach ein bis zwei Minuten läuft die App unter `https://DEINNAME.github.io/festkasse/`.

### 5. Pro Verein: Payrexx einrichten

Jeder Verein braucht ein eigenes Payrexx-Konto, denn das Geld fliesst direkt zu ihm. Die Freischaltung von TWINT (inkl. Identitätsprüfung) dauert einige Tage, also früh beantragen.

1. Payrexx-Konto eröffnen und TWINT als Zahlungsmittel aktivieren.
2. Im Payrexx-Backend im Bereich **API** das API-Secret kopieren (die genaue Menübezeichnung kann je nach Payrexx-Version abweichen).
3. Im Bereich **Webhooks** einen Webhook anlegen:
   - URL: `https://abcdefghijk.supabase.co/functions/v1/payrexx-webhook`
   - Typ: normal oder JSON (beides funktioniert)
4. In FestKasse als Verein anmelden → **Einstellungen → Payrexx**: Instanz-Name (der Teil vor `.payrexx.com`) und API-Secret eintragen, dann TWINT einschalten.
5. Mit einem kleinen Betrag testen. TWINT über Payrexx braucht **mindestens CHF 0.50** pro Zahlung.

---

## So funktioniert es

**Verein:** Registrieren → Produkte anlegen (eigene Fotos oder aus der Bildbibliothek) → QR-Code aufhängen oder Link teilen.

**Helfer:** QR-Code mit der Kamera scannen → Namen eingeben → kassieren. Kein Konto, kein Passwort. Der Verein kann jeden Zugang sofort sperren und den Code jederzeit neu erzeugen.

**Bezahlen:**

- **Bar:** mit Rückgeld-Rechner. Funktioniert auch ohne Internet; die Bestellung wird gespeichert und automatisch verbucht, sobald wieder Netz da ist.
- **TWINT:** Das Helfer-Handy zeigt einen QR-Code. Der Gast scannt ihn mit der Kamera, landet auf der Payrexx-Seite und bestätigt in der TWINT-App. Die Kasse merkt die Zahlung automatisch (Abfrage alle 2,5 Sekunden plus Webhook) und zeigt den Erfolgsbildschirm.

**Sicherheit:**

- Preise werden in der Datenbank berechnet, nicht auf dem Handy. Ein manipuliertes Handy kann keine falschen Preise buchen.
- Bestellungen lassen sich nur über geprüfte Datenbankfunktionen anlegen. Jede Bestellung hat eine eindeutige ID, doppelt gesendete werden nur einmal verbucht.
- Ob eine TWINT-Zahlung bezahlt ist, fragt der Server immer selbst bei Payrexx nach. Ein gefälschter Webhook ändert nichts.
- Payrexx-Secrets sind für die App unlesbar (nur die Edge Functions lesen sie). **Wichtig:** Als Betreiber des Supabase-Projekts kannst du sie im Dashboard sehen. Sag das den Vereinen offen, oder nutze später das Plattform-Modell von Payrexx.

---

## Tests

```bash
./test/run.sh                    # Datenbank: Rechte und Funktionen (braucht lokales PostgreSQL)
deno run --allow-env --import-map test/import_map.json test/functions_test.ts   # Edge Functions
node test/e2e.mjs                # App im Demo-Modus, Verein + Helfer parallel (braucht Playwright)
```

## Bekannte Grenzen (Version 1)

- **Karte/Apple Pay** ist nicht dabei. Kontaktloses Bezahlen geht aus einer Web-App nicht, weil der Browser keinen Zugriff auf den NFC-Chip hat. Möglich wäre später die Übergabe an die SumUp-App oder eine eigene App.
- **TWINT braucht Internet** auf dem Helfer-Handy. Ohne Netz geht nur bar.
- **Offline-Barbestellungen**, die nach der Rückkehr des Netzes abgelehnt werden (z. B. weil das Produkt inzwischen gelöscht wurde), erscheinen beim Helfer als Warnung und müssen von Hand nachgetragen werden.
- **Helfer** melden sich nur mit Code und Namen an. Wer den Code kennt, kann beitreten. Dagegen helfen: Code nicht öffentlich aushängen, bei Bedarf neu erzeugen, unbekannte Namen sperren.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `styles.css`, `app.js` | Oberfläche |
| `api.js` | Zugriff auf Supabase |
| `api-demo.js` | Demo-Modus ohne Server (gleiche Funktionen) |
| `qr.js` | QR-Code-Erzeugung (MIT, Kazuhiko Arase) |
| `library.js`, `assets/products/` | Bildbibliothek und Beispielprodukte |
| `sw.js`, `manifest.webmanifest` | Offline-Start und «Zum Home-Bildschirm» |
| `danke.html` | Seite, die der Gast nach der TWINT-Zahlung sieht |
| `supabase/migrations/` | Datenbank, Rechte, Funktionen |
| `supabase/functions/` | TWINT über Payrexx |
| `test/` | Automatische Tests |
