# Stiefelhelden

Team-Seite mit kleinem Backend zur Pflege. Kein Build, kein Framework, keine Datenbank, keine externen Abhängigkeiten zur Laufzeit (Bootstrap und Schrift liegen im Projekt).

| Datei / Ordner          | Wofür                                                                  |
|-------------------------|------------------------------------------------------------------------|
| `index.html`            | Die Seite                                                              |
| `style.css`             | Gestaltung, Farben für Hell und Dunkel oben in den `[data-bs-theme]`-Blöcken |
| `main.js`               | Baut Kacheln, Bestzeiten, Rennen und Liste aus `data.js`               |
| `theme.js`              | Hell/Dunkel: folgt dem System, Schalter merkt sich die Wahl            |
| `data.js`               | **Wird vom Backend erzeugt** – nicht von Hand bearbeiten, nicht im Repo |
| `data/stiefel.json`     | Die eigentlichen Inhalte (Quelle für `data.js`), nicht im Repo          |
| `data/stiefel.example.json` | Startvorlage: daraus entstehen die beiden Dateien oben, falls sie fehlen |
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

Im Backend unter `/admin/` anmelden. Bereiche: Allgemein, Texte, Nächster Start, Bestzeiten, Rennen, Die Liste, Links. „Speichern“ (oder Strg+S) prüft alle Eingaben und veröffentlicht sofort. Vor jedem Speichern wird der alte Stand gesichert; unter „Sicherungen“ lässt sich jeder davon wiederherstellen.

- Zeiten als `mm:ss` oder `h:mm:ss`. Wer nicht dabei war: Haken raus. Dabei, aber nicht gestartet bzw. nicht ins Ziel gekommen: DNS bzw. DNF wählen (dann ohne Zeit und nicht für Bestzeiten; das Rennen zählt trotzdem als „zusammen“).
- Unter „Allgemein → Auf der Seite zeigen“ lassen sich Zeiten, Startnummern, DNS/DNF und der Bereich „Bestzeiten“ ausblenden – wenn es eher um die Erlebnisse als um die Uhr gehen soll. Die Angaben bleiben im Backend erhalten.
- Unter „Texte“ stehen die festen Texte der Seite (Überschriften, die Geschichte der Runde, Fußzeile). `*Wort*` wird hervorgehoben, ein leeres Feld setzt den Standardtext zurück.
- Die Rennliste ist nach Jahren gegliedert (neuestes Jahr offen, Jahresband zum Springen). Rennen mit Foto oder Notiz erscheinen als große Erlebnis-Kacheln, die übrigen als kompakte Zeilen.
- Die Pace und die Kennzahlen oben (Rennen, davon zusammen, km Seite an Seite) rechnet die Seite selbst aus.
- Der nächste Start blendet sich nach seinem Datum von selbst aus.
- Die Kürzel der Läufer (`susen`, `christian`) sind fest; die angezeigten Namen sind änderbar.

## Läufe aus Excel einlesen

```bash
php admin/import-rennen.php DATEI.xlsx --wer=christian --probe   # erst nur anzeigen
php admin/import-rennen.php DATEI.xlsx --wer=christian           # übernehmen
```

- Spalten (Überschrift in Zeile 1): `Datum`, `Event`, `Ort`, `mit`, `Distanz`, `Zeit netto`, `Bemerkung`. Optional je weitere Person eine Spalte `Zeit <Name>`, z. B. `Zeit Susen`.
- `--wer` = wessen Zeit in `Zeit netto` steht. `DNS` oder `DNF` statt einer Zeit wird übernommen. In `mit` eingetragene Personen gelten als mitgelaufen, auch ohne Zeit („Zeit folgt“).
- Bemerkung „keine offizielle Zeitnahme“ → Lauf zählt nicht für Bestzeiten.
- Abgleich über Datum + Event-Name: beliebig oft wiederholbar, neue Läufe kommen dazu, Zeiten werden aktualisiert. Im Backend Gepflegtes (Notizen, Startnummern, Fotos) bleibt, gelöscht wird nichts. Vorher wird eine Sicherung angelegt.
- `--ohne-beispiele` entfernt beim ersten Mal die mitgelieferten Beispiel-Rennen und -Bestzeiten.
- Die Excel-Datei gehört nicht ins Repo (`*.xlsx` ist ausgeschlossen). Auf dem Server nach `data/` legen (dort ist sie von außen gesperrt) und nach dem Import löschen.

Bestzeiten für 5 km, 10 km, Halbmarathon und Marathon berechnet die Seite automatisch aus den Rennen; manuelle Einträge im Backend ergänzen das (bei gleicher Distanz zählt die schnellere Zeit).

## Online stellen

Braucht ein Webhosting **mit PHP 8.1 oder neuer** (übliches Shared Hosting reicht, Apache empfohlen). Netlify Drop oder GitHub Pages reichen dafür nicht mehr, weil dort kein PHP läuft.

**Code kommt über Git, Inhalte über das Backend.** `data.js` und `data/stiefel.json` sind deshalb nicht im Repo – sonst würde jede Bereitstellung die im Backend gepflegten Inhalte überschreiben.

Einrichtung mit Plesk-Git:

1. Repository verbinden, Serverpfad = Dokumentstamm der Domain, z. B. `/stiefelhelden.de/httpdocs`.
2. Als zusätzliche Bereitstellungsaktion eintragen: `php admin/init.php`
   (legt beim ersten Mal die Inhalte aus `data/stiefel.example.json` an; danach ändert es nichts mehr). Alternativ reicht es, einmal `/admin/` aufzurufen.
3. Der Webserver muss in `data/` und im Dokumentstamm (für `data.js`) schreiben dürfen.
4. Passwort setzen: per SSH `php admin/set-password.php` im Dokumentstamm ausführen – oder lokal ausführen und die erzeugte `data/config.php` per FTP hochladen.
5. HTTPS einschalten, damit Passwort und Sitzung verschlüsselt übertragen werden.

Bei **nginx** statt Apache werden `.htaccess`-Dateien ignoriert: dann `data/` und versteckte Dateien in der Server-Konfiguration sperren.
