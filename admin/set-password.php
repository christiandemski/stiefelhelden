<?php
/**
 * Passwort für das Backend setzen (nur auf der Kommandozeile):
 *   php admin/set-password.php
 *   ddev exec php admin/set-password.php
 * Speichert nur einen Hash in data/config.php – das Passwort selbst nirgends.
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

fwrite(STDOUT, "Neues Passwort für das Stiefelhelden-Backend: ");
$pw = trim((string) fgets(STDIN));
if (mb_strlen($pw) < 10) {
    fwrite(STDERR, "Bitte mindestens 10 Zeichen.\n");
    exit(1);
}
fwrite(STDOUT, "Noch einmal: ");
if (trim((string) fgets(STDIN)) !== $pw) {
    fwrite(STDERR, "Die beiden Eingaben sind verschieden.\n");
    exit(1);
}

$cfg = config();
$cfg['password_hash'] = password_hash($pw, PASSWORD_DEFAULT);
write_atomic(CONFIG_FILE, "<?php\n// Wird von admin/set-password.php geschrieben.\nreturn " . var_export($cfg, true) . ";\n");
fwrite(STDOUT, "Gespeichert. Anmelden unter /admin/\n");
