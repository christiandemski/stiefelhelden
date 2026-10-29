<?php
/**
 * Läufe aus einer Excel-Liste (xlsx) einlesen – nur auf der Kommandozeile.
 *
 *   php admin/import-rennen.php DATEI.xlsx --wer=christian [--probe] [--ohne-beispiele]
 *
 *   --wer=ID           wessen Zeit in der Spalte „Zeit netto“ steht (Kürzel aus „Allgemein“)
 *   --probe            nur anzeigen, was passieren würde, nichts speichern
 *   --ohne-beispiele   die mitgelieferten Beispiel-Rennen und -Bestzeiten dabei entfernen
 *
 * Erwartete Spalten (Überschrift in Zeile 1, Reihenfolge egal):
 *   Datum, Event, Ort, Land, mit, Distanz, Zeit netto, Bemerkung
 *   optional je weitere Person: „Zeit <Name>“, z. B. „Zeit Susen“
 *   optional: „Startnummer“ (für --wer) und „Startnummer <Name>“
 *
 * Abgleich: gleiches Datum + gleicher Event-Name (ohne Nummerierung wie „7.“) = derselbe Lauf.
 * Neue Läufe kommen dazu, Zeiten werden aus der Liste übernommen. Was im Backend gepflegt
 * wurde (Name, Notiz, Startnummer, Fotos) bleibt erhalten; gelöscht wird nichts.
 * Vor dem Speichern wird wie immer eine Sicherung angelegt.
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$args = array_slice($argv, 1);
$file = null;
$opt = ['wer' => null, 'probe' => false, 'ohne-beispiele' => false];
foreach ($args as $a) {
    if (preg_match('/^--(wer)=(.+)$/', $a, $m)) {
        $opt[$m[1]] = $m[2];
    } elseif (in_array($a, ['--probe', '--ohne-beispiele'], true)) {
        $opt[substr($a, 2)] = true;
    } elseif ($file === null) {
        $file = $a;
    } else {
        fail("Unbekannte Angabe: $a");
    }
}

function fail(string $msg): never
{
    fwrite(STDERR, $msg . "\n");
    exit(1);
}

// Pfad darf auch relativ zum Projektordner sein (Plesk-Aufgaben laufen in einem anderen Verzeichnis)
if ($file && !is_file($file) && is_file(ROOT . '/' . $file)) {
    $file = ROOT . '/' . $file;
}
if (!$file || !is_file($file)) {
    fail("Aufruf: php admin/import-rennen.php DATEI.xlsx --wer=KÜRZEL [--probe] [--ohne-beispiele]");
}

ensure_content();
$content = load_content();
$ids = array_keys($content['laeufer']);
if (!in_array($opt['wer'], $ids, true)) {
    fail('Bitte mit --wer angeben, wessen Zeiten in „Zeit netto“ stehen: ' . implode(', ', $ids));
}

// Name -> Kürzel (für die Spalte „mit“ und „Zeit <Name>“)
$byName = [];
foreach ($content['laeufer'] as $id => $n) {
    $byName[mb_strtolower(trim($n))] = $id;
    $byName[$id] = $id;
}

// ---------------------------------------------------------------- xlsx lesen

/** @return array<int, array<string, string|float>> Zeilen als [Spaltenbuchstabe => Wert] */
function read_xlsx(string $file): array
{
    $z = new ZipArchive();
    if ($z->open($file) !== true) {
        fail('Die Datei lässt sich nicht als xlsx öffnen.');
    }
    $strings = [];
    if (($x = $z->getFromName('xl/sharedStrings.xml')) !== false) {
        foreach (simplexml_load_string($x)->si as $si) {
            $t = '';
            foreach ($si->xpath('.//*[local-name()="t"]') as $n) {
                $t .= (string) $n;
            }
            $strings[] = $t;
        }
    }
    $sheet = $z->getFromName('xl/worksheets/sheet1.xml');
    if ($sheet === false) {
        fail('Kein Tabellenblatt gefunden.');
    }
    $rows = [];
    foreach (simplexml_load_string($sheet)->sheetData->row as $r) {
        $row = [];
        foreach ($r->c as $c) {
            $col = preg_replace('/\d+/', '', (string) $c['r']);
            $t = (string) $c['t'];
            $v = (string) $c->v;
            $row[$col] = match ($t) {
                's'         => $strings[(int) $v] ?? '',
                'inlineStr' => (string) $c->is->t,
                'str', 'b'  => $v,
                default     => $v === '' ? '' : (float) $v,
            };
        }
        $rows[] = $row;
    }
    return $rows;
}

function to_date(string|float $v): ?string
{
    if (is_float($v) && $v > 20000) {
        return gmdate('Y-m-d', (int) round(($v - 25569) * 86400));  // Excel-Datum
    }
    if (is_string($v) && preg_match('/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/', trim($v), $m)) {
        return sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1]);
    }
    return null;
}

function to_time(string|float $v): string
{
    if (is_float($v)) {                                     // Excel: Bruchteil eines Tages
        $s = (int) round($v * 86400);
        return $s >= 3600
            ? sprintf('%d:%02d:%02d', intdiv($s, 3600), intdiv($s % 3600, 60), $s % 60)
            : sprintf('%d:%02d', intdiv($s, 60), $s % 60);
    }
    return trim($v);
}

/** Text aus Excel säubern: auch geschützte Leerzeichen, doppelte Leerzeichen */
function clean(string|float $v): string
{
    return trim((string) preg_replace('/[\s\x{00A0}\x{2007}\x{202F}]+/u', ' ', (string) $v));
}

function norm_name(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = preg_replace('/^\d+\.\s*/', '', $s);              // „7. Welterbelauf“ -> „welterbelauf“
    return preg_replace('/[^\p{L}\p{N}]+/u', '', $s);
}

$rows = read_xlsx($file);
$head = array_shift($rows) ?? [];
$col = [];
$timeCols = [];  // Spalte => Kürzel
$bibCols = [];   // Spalte => Kürzel (optional: „Startnummer“, „Startnummer Susen“)
foreach ($head as $c => $h) {
    $h = mb_strtolower(trim((string) $h));
    foreach (['datum', 'event', 'ort', 'land', 'mit', 'distanz', 'bemerkung'] as $k) {
        if ($h === $k) {
            $col[$k] = $c;
        }
    }
    if ($h === 'zeit netto' || $h === 'zeit') {
        $timeCols[$c] = $opt['wer'];
    } elseif (preg_match('/^zeit\s+(.+)$/u', $h, $m) && isset($byName[trim($m[1])])) {
        $timeCols[$c] = $byName[trim($m[1])];
    } elseif (in_array($h, ['startnummer', 'startnr', 'startnr.'], true)) {
        $bibCols[$c] = $opt['wer'];
    } elseif (preg_match('/^startn(?:umme)?r\.?\s+(.+)$/u', $h, $m) && isset($byName[trim($m[1])])) {
        $bibCols[$c] = $byName[trim($m[1])];
    }
}
foreach (['datum', 'event', 'distanz'] as $k) {
    if (!isset($col[$k])) {
        fail("Spalte „" . ucfirst($k) . "“ nicht gefunden. Gefunden: " . implode(', ', array_map('strval', $head)));
    }
}
if (!$timeCols) {
    fail('Keine Zeit-Spalte gefunden („Zeit netto“).');
}

// ---------------------------------------------------------------- Zeilen -> Läufe

$imported = [];
$problems = [];
foreach ($rows as $i => $r) {
    $line = $i + 2;
    $datum = to_date($r[$col['datum']] ?? '');
    $event = clean($r[$col['event']] ?? '');
    if ($datum === null && $event === '') {
        continue;  // leere/vorbereitete Zeile
    }
    if ($datum === null || $event === '') {
        $problems[] = "Zeile $line: Datum oder Event fehlt – übersprungen.";
        continue;
    }
    $km = $r[$col['distanz']] ?? '';
    $km = is_float($km) ? $km : (float) str_replace(',', '.', (string) $km);

    $teil = [];
    $zeiten = [];
    $status = [];  // „DNS“ / „DNF“ statt einer Zeit
    foreach ($timeCols as $c => $id) {
        $v = $r[$c] ?? '';
        if (is_string($v) && preg_match('/^\s*(dns|dnf)\s*$/i', $v, $m)) {
            $status[$id] = strtolower($m[1]);
        } elseif ($v !== '' && $v !== 0.0) {
            $zeiten[$id] = to_time($v);
        }
    }
    $nrs = [];
    foreach ($bibCols as $c => $id) {
        $v = $r[$c] ?? '';
        if (is_float($v) && $v > 0 || is_string($v) && ctype_digit(trim($v))) {
            $nrs[$id] = (int) $v;
        }
    }
    $teil[] = $opt['wer'];  // es ist die Liste dieser Person: jeder Lauf darin ist ihrer
    foreach (preg_split('/\s*(?:,|&|\bund\b|\+)\s*/u', clean($r[$col['mit'] ?? ''] ?? '')) as $n) {
        $n = mb_strtolower(trim($n));
        if ($n === '') {
            continue;
        }
        if (isset($byName[$n])) {
            $teil[] = $byName[$n];
        } else {
            $problems[] = "Zeile $line: „$n“ in Spalte „mit“ ist keine bekannte Person – ignoriert.";
        }
    }
    $teil = array_values(array_intersect($ids, array_unique(array_merge($teil, array_keys($zeiten), array_keys($nrs), array_keys($status)))));

    $bem = clean($r[$col['bemerkung'] ?? ''] ?? '');
    $ort = clean($r[$col['ort'] ?? ''] ?? '');

    $run = ['name' => $event, 'ort' => $ort, 'datum' => $datum, 'km' => $km, 'zeiten' => $zeiten, 'teilnehmer' => $teil];
    if ($nrs) {
        $run['startnummern'] = $nrs;
    }
    if ($status) {
        $run['status'] = $status;
    }
    if (preg_match('/keine offizielle zeitnahme/i', $bem)) {
        $run['inoffiziell'] = true;
    } elseif ($bem !== '') {
        $run['notiz'] = $bem;
    }
    $imported[] = $run;
}

// ---------------------------------------------------------------- Beispiele entfernen

$removed = [];
if ($opt['ohne-beispiele'] && is_file(EXAMPLE_FILE)) {
    $ex = json_decode((string) file_get_contents(EXAMPLE_FILE), true);
    $exKeys = array_map(fn ($r) => $r['datum'] . '|' . $r['name'], $ex['rennen'] ?? []);
    $content['rennen'] = array_values(array_filter($content['rennen'], function ($r) use ($exKeys, &$removed) {
        $hit = in_array($r['datum'] . '|' . $r['name'], $exKeys, true) && empty($r['fotos']);
        if ($hit) {
            $removed[] = "Beispiel-Rennen „{$r['name']}“ ({$r['datum']})";
        }
        return !$hit;
    }));
    foreach ($content['bestzeiten'] as $id => $list) {
        $exPb = array_map(fn ($p) => $p['distanz'] . '|' . $p['zeit'], $ex['bestzeiten'][$id] ?? []);
        $content['bestzeiten'][$id] = array_values(array_filter($list, function ($p) use ($exPb, $id, &$removed) {
            $hit = in_array($p['distanz'] . '|' . $p['zeit'], $exPb, true);
            if ($hit) {
                $removed[] = "Beispiel-Bestzeit $id {$p['distanz']} {$p['zeit']}";
            }
            return !$hit;
        }));
    }
}

// ---------------------------------------------------------------- Abgleichen

$new = $updated = $same = 0;
$log = [];
foreach ($imported as $run) {
    $match = null;
    foreach ($content['rennen'] as $k => $r) {
        if (($r['datum'] ?? '') === $run['datum'] && norm_name($r['name'] ?? '') === norm_name($run['name'])) {
            $match = $k;
            break;
        }
    }
    if ($match === null) {
        $content['rennen'][] = $run;
        $new++;
        $log[] = "+ {$run['datum']}  {$run['name']}";
        continue;
    }
    $r = $content['rennen'][$match];
    $before = json_encode($r);
    $r['zeiten'] = array_merge((array) ($r['zeiten'] ?? []), $run['zeiten']);
    // Liste gewinnt: Zeit hebt DNS/DNF auf, DNS/DNF ersetzt die Zeit
    $st = array_diff_key((array) ($r['status'] ?? []), $run['zeiten']);
    $st = array_merge($st, $run['status'] ?? []);
    $r['zeiten'] = array_diff_key($r['zeiten'], $st);
    if ($st != (array) ($r['status'] ?? [])) {
        unset($r['status']);
        if ($st) {
            $r['status'] = $st;
        }
    }
    $r['teilnehmer'] = array_values(array_intersect($ids, array_unique(array_merge(
        (array) ($r['teilnehmer'] ?? array_keys(array_filter((array) ($r['zeiten'] ?? [])))),
        $run['teilnehmer']
    ))));
    if (empty($r['ort']) && $run['ort'] !== '') {
        $r['ort'] = $run['ort'];
    }
    if (empty($r['km'])) {
        $r['km'] = $run['km'];
    }
    if (!empty($run['inoffiziell'])) {
        $r['inoffiziell'] = true;
    }
    if (empty($r['notiz']) && !empty($run['notiz'])) {
        $r['notiz'] = $run['notiz'];
    }
    // Startnummern nur ergänzen, im Backend eingetragene bleiben
    if (!empty($run['startnummern'])) {
        $r['startnummern'] = (array) ($r['startnummern'] ?? []) + $run['startnummern'];
    }
    if (json_encode($r) === $before) {
        $same++;
    } else {
        $content['rennen'][$match] = $r;
        $updated++;
        $log[] = "~ {$run['datum']}  {$run['name']}";
    }
}

// ---------------------------------------------------------------- Ergebnis

$current = load_content();
try {
    $clean = validate($content, $current);
} catch (ValidationError $e) {
    fail("Nicht gespeichert, bitte prüfen:\n- " . implode("\n- ", $e->errors));
}

echo "Gelesen: " . count($imported) . " Läufe aus " . basename($file) . "\n";
echo "Neu: $new · aktualisiert: $updated · unverändert: $same\n";
foreach ($removed as $x) {
    echo "- entfernt: $x\n";
}
foreach ($log as $x) {
    echo "$x\n";
}
foreach ($problems as $x) {
    echo "! $x\n";
}

if ($opt['probe']) {
    echo "\nProbelauf – nichts gespeichert. Ohne --probe ausführen, um zu übernehmen.\n";
    exit(0);
}
save_content($clean);
echo "\nGespeichert und veröffentlicht. Der vorherige Stand liegt unter „Sicherungen“ im Backend.\n";
