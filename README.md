# Stiefelhelden

Team-Seite mit kleinem Backend zur Pflege. Kein Build, kein Framework, keine Datenbank, keine externen Abhängigkeiten zur Laufzeit (Bootstrap und Schrift liegen im Projekt).

| Datei / Ordner          | Wofür                                                                  |
|-------------------------|------------------------------------------------------------------------|
| `index.html`            | Die Seite                                                              |
| `style.css`             | Gestaltung, Farben für Hell und Dunkel oben in den `[data-bs-theme]`-Blöcken |
| `main.js`               | Baut Kacheln, Bestzeiten, Rennen und Liste aus `data.js`               |
| `theme.js`              | Hell/Dunkel: folgt dem System, Schalter merkt sich die Wahl            |
| `data.js`               | **Wird vom Backend erzeugt** – nicht von Hand bearbeiten               |
| `data/stiefel.json`     | Die eigentlichen Inhalte (Quelle für `data.js`)                        |
| `data/backups/`         | Automatische Sicherungen vor jedem Speichern (die letzten 30)          |
| `data/config.php`       | Passwort-Hash fürs Backend (wird erzeugt, nicht ins Repo)              |
| `admin/`                | Das Backend                                                            |
| `assets/logo.jpg`       | Logo – einfach durch das neue ersetzen (gleicher Name)                 |
| `assets/vendor/`        | Bootstrap 5.3.3 und Open Sans (lokal statt CDN/Google Fonts)           |

## Lokal mit DDEV

```bash
ddev start
ddev exec php admin/set-password.php   # einmalig: Passwort fürs Backend festlegen
```

- Seite: https://stiefelhelden.ddev.site
- Backend: https://stiefelhelden.ddev.site/admin/

DDEV läuft mit PHP 8.2 und Apache (wie auf üblichem Webhosting, damit die `.htaccess`-Regeln greifen), ohne Datenbank.

## Inhalte pflegen

Im Backend unter `/admin/` anmelden. Bereiche: Allgemein, Nächster Start, Bestzeiten, Rennen, Die Liste, Links. „Speichern“ (oder Strg+S) prüft alle Eingaben und veröffentlicht sofort. Vor jedem Speichern wird der alte Stand gesichert; unter „Sicherungen“ lässt sich jeder davon wiederherstellen.

- Zeiten als `mm:ss` oder `h:mm:ss`. Wer nicht mitgelaufen ist: Zeit leer lassen.
- Die Pace und die Kennzahlen oben (Rennen, davon zusammen, km Seite an Seite) rechnet die Seite selbst aus.
- Der nächste Start blendet sich nach seinem Datum von selbst aus.
- Die Kürzel der Läufer (`susen`, `christian`) sind fest; die angezeigten Namen sind änderbar.

## Online stellen

Braucht ein Webhosting **mit PHP 8.1 oder neuer** (übliches Shared Hosting reicht, Apache empfohlen). Netlify Drop oder GitHub Pages reichen dafür nicht mehr, weil dort kein PHP läuft.

1. Alles außer `.ddev/` und `.git/` hochladen.
2. Der Webserver muss in `data/` und in `data.js` schreiben dürfen.
3. Passwort setzen: lokal `php admin/set-password.php` ausführen und die erzeugte `data/config.php` mit hochladen (oder per SSH auf dem Server ausführen).
4. HTTPS einschalten, damit Passwort und Sitzung verschlüsselt übertragen werden.

Bei **nginx** statt Apache werden `.htaccess`-Dateien ignoriert: dann `data/` und versteckte Dateien in der Server-Konfiguration sperren.
