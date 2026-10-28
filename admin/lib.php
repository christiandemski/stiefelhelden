<?php
/**
 * Stiefelhelden – kleines Backend ohne Datenbank.
 * Inhalte liegen in data/stiefel.json; beim Speichern wird data.js für die Seite neu erzeugt.
 */
declare(strict_types=1);

const ROOT        = __DIR__ . '/..';
const DATA_FILE   = ROOT . '/data/stiefel.json';
const JS_FILE     = ROOT . '/data.js';
const CONFIG_FILE = ROOT . '/data/config.php';
const BACKUP_DIR  = ROOT . '/data/backups';
const BACKUP_KEEP = 30;

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
        $notiz = $str($r['notiz'] ?? '', "$l: Notiz", 200);
        if ($notiz !== '') {
            $row['notiz'] = $notiz;
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
