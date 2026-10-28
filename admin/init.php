<?php
/**
 * Nach einer Bereitstellung ausführen (z. B. als Plesk-Bereitstellungsaktion):
 *   php admin/init.php
 * Legt data/stiefel.json und data.js aus der Vorlage an, falls sie fehlen.
 * Vorhandene Inhalte werden nie überschrieben.
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$had = [is_file(DATA_FILE), is_file(JS_FILE)];
ensure_content();
fwrite(STDOUT, ($had === [true, true] ? 'Inhalte vorhanden, nichts geändert.' : 'Inhalte aus der Vorlage angelegt.') . "\n");
if (!is_configured()) {
    fwrite(STDOUT, "Hinweis: Noch kein Passwort gesetzt – php admin/set-password.php\n");
}
