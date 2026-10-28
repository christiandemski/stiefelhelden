<?php
/**
 * Stiefelhelden – kleines Backend ohne Datenbank.
 * Inhalte liegen in data/stiefel.json; beim Speichern wird data.js für die Seite neu erzeugt.
 */
declare(strict_types=1);

const ROOT        = __DIR__ . '/..';
const DATA_FILE   = ROOT . '/data/stiefel.json';
const EXAMPLE_FILE = ROOT . '/data/stiefel.example.json';
const JS_FILE     = ROOT . '/data.js';
const CONFIG_FILE = ROOT . '/data/config.php';
const BACKUP_DIR  = ROOT . '/data/backups';
const BACKUP_KEEP = 30;
const FOTO_DIR    = ROOT . '/uploads/rennen';
const THUMB_DIR   = FOTO_DIR . '/thumb';
const FOTO_MAX    = 2000;  // längste Kante in px
const THUMB_MAX   = 640;
const FOTOS_PER_RACE = 40;

final class ValidationError extends RuntimeException
{
    /** @param string[] $errors */
    public function __construct(public readonly array $errors)
    {
        parent::__construct(implode("\n", $errors));
    }
}

// ---------------------------------------------------------------- Sitzung & Login

function start_session(): void
{
    session_name('stiefel_admin');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/',
        'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function config(): array
{
    return is_file(CONFIG_FILE) ? (array) require CONFIG_FILE : [];
}

function is_configured(): bool
{
    return (config()['password_hash'] ?? '') !== '';
}

function is_logged_in(): bool
{
    return !empty($_SESSION['auth']);
}

function attempt_login(string $password): bool
{
    $hash = config()['password_hash'] ?? '';
    if ($hash !== '' && password_verify($password, $hash)) {
        session_regenerate_id(true);
        $_SESSION['auth'] = true;
        return true;
    }
    usleep(800_000); // bremst Raten aus
    return false;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function check_csrf(?string $token): bool
{
    return is_string($token) && !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $token);
}

function e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

// ---------------------------------------------------------------- Laden & Speichern

/**
 * Inhalte und data.js kommen bewusst nicht aus Git (sonst überschreibt jede Bereitstellung
 * das, was im Backend gepflegt wurde). Fehlen sie, werden sie aus der Vorlage angelegt –
 * vorhandene Dateien bleiben unangetastet.
 */
function ensure_content(): void
{
    if (!is_file(DATA_FILE) && !copy(EXAMPLE_FILE, DATA_FILE)) {
        throw new RuntimeException('Konnte data/stiefel.json nicht anlegen. Schreibrechte für data/ prüfen.');
    }
    if (!is_file(JS_FILE)) {
        write_js(to_json(load_content()));
    }
}

function load_content(): array
{
    return json_decode((string) file_get_contents(DATA_FILE), true, 64, JSON_THROW_ON_ERROR);
}

/** Schreibt erst in eine Temp-Datei und benennt dann um – so ist eine Datei nie halb geschrieben. */
function write_atomic(string $file, string $content): void
{
    $tmp = $file . '.tmp-' . bin2hex(random_bytes(4));
    if (file_put_contents($tmp, $content, LOCK_EX) === false || !rename($tmp, $file)) {
        @unlink($tmp);
        throw new RuntimeException('Konnte ' . basename($file) . ' nicht schreiben. Schreibrechte prüfen.');
    }
}

function to_json(array $c): string
{
    // leere Zuordnungen als {} statt [] ausgeben, damit die Seite Objekte bekommt
    $c['laeufer'] = (object) $c['laeufer'];
    $c['bestzeiten'] = (object) $c['bestzeiten'];
    foreach ($c['rennen'] as &$r) {
        $r['zeiten'] = (object) $r['zeiten'];
    }
    unset($r);
    return json_encode($c, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_THROW_ON_ERROR);
}

function save_content(array $content): void
{
    if (!is_dir(BACKUP_DIR)) {
        mkdir(BACKUP_DIR, 0775, true);
    }
    if (is_file(DATA_FILE)) {
        copy(DATA_FILE, BACKUP_DIR . '/stiefel-' . date('Y-m-d_H-i-s') . '.json');
        $old = list_backups();
        foreach (array_slice($old, BACKUP_KEEP) as $b) {
            @unlink(BACKUP_DIR . '/' . $b['file']);
        }
    }

    $json = to_json($content);
    write_atomic(DATA_FILE, $json . "\n");
    write_js($json);
}

function write_js(string $json): void
{
    write_atomic(JS_FILE,
        "// Wird vom Backend (/admin/) erzeugt – Änderungen bitte dort vornehmen.\n" .
        "window.STIEFEL = " . $json . ";\n");
}

/** @return array<int, array{file: string, time: int}> neueste zuerst */
function list_backups(): array
{
    $out = [];
    foreach (glob(BACKUP_DIR . '/stiefel-*.json') ?: [] as $f) {
        $out[] = ['file' => basename($f), 'time' => (int) filemtime($f)];
    }
    usort($out, fn ($a, $b) => strcmp($b['file'], $a['file']));
    return $out;
}

// ---------------------------------------------------------------- Fotos

/**
 * Speichert ein hochgeladenes Bild neu als JPEG (groß + Vorschau).
 * Durch das Neu-Kodieren fallen Metadaten wie GPS-Koordinaten weg.
 * @return array{datei: string, w: int, h: int}
 */
function store_photo(string $tmpFile): array
{
    if (!function_exists('imagecreatefromstring')) {
        throw new RuntimeException('Auf dem Server fehlt die PHP-Erweiterung GD für Bilder.');
    }
    $info = @getimagesize($tmpFile);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
        throw new RuntimeException('Nur JPG, PNG oder WebP.');
    }
    if ($info[0] * $info[1] > 40_000_000) {
        throw new RuntimeException('Das Bild ist zu groß.');
    }
    $src = @imagecreatefromstring((string) file_get_contents($tmpFile));
    if (!$src) {
        throw new RuntimeException('Das Bild konnte nicht gelesen werden.');
    }

    foreach ([FOTO_DIR, THUMB_DIR] as $dir) {
        if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
            throw new RuntimeException('Konnte uploads/ nicht anlegen. Schreibrechte prüfen.');
        }
    }
    $name = bin2hex(random_bytes(8)) . '.jpg';
    $big = write_jpeg($src, FOTO_MAX, FOTO_DIR . '/' . $name, 84);
    write_jpeg($src, THUMB_MAX, THUMB_DIR . '/' . $name, 78);
    imagedestroy($src);
    return ['datei' => $name, 'w' => $big[0], 'h' => $big[1]];
}

/** @return array{0: int, 1: int} tatsächliche Größe */
function write_jpeg(\GdImage $src, int $max, string $file, int $quality): array
{
    $w = imagesx($src);
    $h = imagesy($src);
    $s = min(1, $max / max($w, $h));
    $nw = max(1, (int) round($w * $s));
    $nh = max(1, (int) round($h * $s));
    $dst = imagecreatetruecolor($nw, $nh);
    imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255)); // Transparenz -> Weiß
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    imageinterlace($dst, true);
    if (!imagejpeg($dst, $file, $quality)) {
        throw new RuntimeException('Konnte das Bild nicht speichern.');
    }
    imagedestroy($dst);
    return [$nw, $nh];
}

/**
 * Löscht Fotos, die weder im aktuellen Stand noch in einer Sicherung vorkommen.
 * Frisch hochgeladene (noch nicht gespeicherte) bleiben einen Tag verschont.
 */
function cleanup_photos(): void
{
    $used = [];
    foreach (array_merge([DATA_FILE], glob(BACKUP_DIR . '/stiefel-*.json') ?: []) as $f) {
        preg_match_all('/"datei":\s*"([a-f0-9]{16}\.jpg)"/', (string) file_get_contents($f), $m);
        $used += array_flip($m[1]);
    }
    foreach (glob(FOTO_DIR . '/*.jpg') ?: [] as $f) {
        $n = basename($f);
        if (!isset($used[$n]) && filemtime($f) < time() - 86400) {
            @unlink($f);
            @unlink(THUMB_DIR . '/' . $n);
        }
    }
}

// ---------------------------------------------------------------- Prüfen

function validate(array $in, array $current): array
{
    $err = [];

    $str = function ($v, string $label, int $max, bool $required = false) use (&$err): string {
        $v = is_scalar($v) ? trim((string) $v) : '';
        if ($required && $v === '') {
            $err[] = "$label fehlt.";
        }
        if (mb_strlen($v) > $max) {
            $err[] = "$label ist zu lang (max. $max Zeichen).";
            $v = mb_substr($v, 0, $max);
        }
        return $v;
    };
    $date = function ($v, string $label, bool $required = true) use (&$err): ?string {
        $v = is_string($v) ? trim($v) : '';
        if ($v === '' && !$required) {
            return null;
        }
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            $err[] = "$label: Datum ungültig.";
            return null;
        }
        return $v;
    };
    $time = function ($v, string $label) use (&$err): string {
        $v = is_scalar($v) ? trim((string) $v) : '';
        if (!preg_match('/^(\d{1,2}:)?[0-5]?\d:[0-5]\d$/', $v)) {
            $err[] = "$label: Zeit bitte als mm:ss oder h:mm:ss.";
        }
        return $v;
    };
    $intOrNull = function ($v, string $label, int $min, int $max) use (&$err): ?int {
        if ($v === null || $v === '') {
            return null;
        }
        if (!is_numeric($v) || (int) $v != $v || $v < $min || $v > $max) {
            $err[] = "$label: Zahl zwischen $min und $max.";
            return null;
        }
        return (int) $v;
    };

    // Läufer: Kürzel bleiben fest, nur die Namen sind änderbar
    $ids = array_keys($current['laeufer']);
    $out = ['laeufer' => []];
    foreach ($ids as $id) {
        $out['laeufer'][$id] = $str($in['laeufer'][$id] ?? '', "Name ($id)", 40, true);
    }

    $out['seit'] = $intOrNull($in['seit'] ?? null, 'Seit', 1900, 2100) ?? (int) $current['seit'];
    $out['stiefelrunde'] = ['distanz' => $str($in['stiefelrunde']['distanz'] ?? '', 'Länge der Runde', 20, true)];

    // Nächster Start (optional)
    $n = $in['naechsterStart'] ?? null;
    if (is_array($n)) {
        $out['naechsterStart'] = [
            'name'    => $str($n['name'] ?? '', 'Nächster Start: Name', 80, true),
            'ort'     => $str($n['ort'] ?? '', 'Nächster Start: Ort', 80),
            'datum'   => $date($n['datum'] ?? '', 'Nächster Start'),
            'distanz' => $str($n['distanz'] ?? '', 'Nächster Start: Distanz', 30),
            'wer'     => array_values(array_intersect($ids, (array) ($n['wer'] ?? []))),
        ];
    } else {
        $out['naechsterStart'] = null;
    }

    // Bestzeiten je Person
    $out['bestzeiten'] = [];
    foreach ($ids as $id) {
        $rows = [];
        foreach ((array) ($in['bestzeiten'][$id] ?? []) as $i => $pb) {
            $l = 'Bestzeit ' . $out['laeufer'][$id] . ' #' . ($i + 1);
            $row = [
                'distanz' => $str($pb['distanz'] ?? '', "$l: Distanz", 30, true),
                'zeit'    => $time($pb['zeit'] ?? '', $l),
                'rennen'  => $str($pb['rennen'] ?? '', "$l: Rennen", 80),
            ];
            $jahr = $intOrNull($pb['jahr'] ?? null, "$l: Jahr", 1900, 2100);
            if ($jahr !== null) {
                $row['jahr'] = $jahr;
            }
            $rows[] = $row;
        }
        $out['bestzeiten'][$id] = $rows;
    }

    // Rennen
    $out['rennen'] = [];
    foreach ((array) ($in['rennen'] ?? []) as $i => $r) {
        $l = 'Rennen #' . ($i + 1) . (is_string($r['name'] ?? null) && $r['name'] !== '' ? ' (' . $r['name'] . ')' : '');
        $km = $r['km'] ?? null;
        if (!is_numeric($km) || $km <= 0 || $km > 500) {
            $err[] = "$l: km muss eine Zahl größer 0 sein.";
            $km = 0;
        }
        $row = [
            'name'  => $str($r['name'] ?? '', "$l: Name", 80, true),
            'ort'   => $str($r['ort'] ?? '', "$l: Ort", 80),
            'datum' => $date($r['datum'] ?? '', $l),
            'km'    => round((float) $km, 2),
        ];
        $nr = $intOrNull($r['startnummer'] ?? null, "$l: Startnummer", 0, 999999);
        if ($nr !== null) {
            $row['startnummer'] = $nr;
        }
        $row['zeiten'] = [];
        foreach ($ids as $id) {
            $t = trim((string) ($r['zeiten'][$id] ?? ''));
            if ($t !== '') {
                $row['zeiten'][$id] = $time($t, "$l: Zeit " . $out['laeufer'][$id]);
            }
        }
        // Wer gelaufen ist – auch ohne (bekannte) Zeit. Eine Zeit heißt immer: gelaufen.
        $teil = array_values(array_filter($ids, fn ($id) => isset($row['zeiten'][$id])
            || in_array($id, (array) ($r['teilnehmer'] ?? []), true)));
        if (!$teil) {
            $err[] = "$l: Bitte mindestens eine Person als gelaufen markieren.";
        }
        $row['teilnehmer'] = $teil;
        if (!empty($r['inoffiziell'])) {
            $row['inoffiziell'] = true;  // keine offizielle Zeitnahme: zählt nicht für Bestzeiten
        }
        $notiz = $str($r['notiz'] ?? '', "$l: Notiz", 200);
        if ($notiz !== '') {
            $row['notiz'] = $notiz;
        }
        $fotos = [];
        foreach ((array) ($r['fotos'] ?? []) as $j => $f) {
            $d = (string) ($f['datei'] ?? '');
            if (!preg_match('/^[a-f0-9]{16}\.jpg$/', $d) || !is_file(FOTO_DIR . '/' . $d)) {
                $err[] = "$l: Foto " . ($j + 1) . ' fehlt auf dem Server.';
                continue;
            }
            [$w, $h] = getimagesize(FOTO_DIR . '/' . $d) ?: [0, 0];
            $fotos[] = ['datei' => $d, 'text' => $str($f['text'] ?? '', "$l: Bildtext " . ($j + 1), 120), 'w' => $w, 'h' => $h];
        }
        if (count($fotos) > FOTOS_PER_RACE) {
            $err[] = "$l: höchstens " . FOTOS_PER_RACE . ' Fotos.';
        }
        if ($fotos) {
            $row['fotos'] = $fotos;
        }
        $out['rennen'][] = $row;
    }

    // Wunschliste
    $out['wunschliste'] = [];
    foreach ((array) ($in['wunschliste'] ?? []) as $i => $w) {
        $out['wunschliste'][] = [
            'name'     => $str($w['name'] ?? '', 'Liste #' . ($i + 1) . ': Name', 80, true),
            'notiz'    => $str($w['notiz'] ?? '', 'Liste #' . ($i + 1) . ': Notiz', 200),
            'erledigt' => !empty($w['erledigt']),
        ];
    }

    // Links: nur http(s) oder "#"
    $out['links'] = [];
    foreach ((array) ($in['links'] ?? []) as $i => $lnk) {
        $url = $str($lnk['url'] ?? '', 'Link #' . ($i + 1) . ': Adresse', 300, true);
        if ($url !== '#' && !preg_match('#^https?://[^\s]+$#i', $url)) {
            $err[] = 'Link #' . ($i + 1) . ': Adresse muss mit https:// beginnen.';
        }
        $out['links'][] = ['label' => $str($lnk['label'] ?? '', 'Link #' . ($i + 1) . ': Text', 30, true), 'url' => $url];
    }

    if ($err) {
        throw new ValidationError(array_values(array_unique($err)));
    }
    return $out;
}
