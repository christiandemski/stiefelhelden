<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

ensure_content();
start_session();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function reply(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

if (!is_logged_in()) {
    reply(401, ['error' => 'Bitte neu anmelden.']);
}

$action = $_GET['action'] ?? '';

if ($action === 'backups' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    reply(200, ['backups' => list_backups()]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !check_csrf($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
    reply(403, ['error' => 'Anfrage abgelehnt. Seite neu laden.']);
}

try {
    switch ($action) {
        case 'save':
            $in = json_decode((string) file_get_contents('php://input'), true, 64, JSON_THROW_ON_ERROR);
            $clean = validate((array) $in, load_content());
            save_content($clean);
            cleanup_photos();
            reply(200, ['ok' => true, 'content' => json_decode(to_json($clean), true)]);

        case 'upload':
            $f = $_FILES['foto'] ?? null;
            if (!is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
                $tooBig = in_array($f['error'] ?? 0, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
                reply(400, ['error' => $tooBig ? 'Die Datei ist zu groß für den Server.' : 'Upload fehlgeschlagen.']);
            }
            try {
                reply(200, ['ok' => true] + store_photo($f['tmp_name']));
            } catch (RuntimeException $e) {
                reply(422, ['error' => $e->getMessage()]);
            }

        case 'geocode':
            $in = json_decode((string) file_get_contents('php://input'), true, 4, JSON_THROW_ON_ERROR);
            $q = trim((string) ($in['q'] ?? ''));
            if ($q === '' || mb_strlen($q) > 120) {
                reply(400, ['error' => 'Bitte einen Ort angeben.']);
            }
            try {
                reply(200, ['ok' => true] + geocode($q));
            } catch (RuntimeException $e) {
                reply(422, ['error' => $e->getMessage()]);
            }

        case 'restore':
            $in = json_decode((string) file_get_contents('php://input'), true, 4, JSON_THROW_ON_ERROR);
            $file = (string) ($in['file'] ?? '');
            if (!preg_match('/^stiefel-[\d_-]+\.json$/', $file) || !is_file(BACKUP_DIR . '/' . $file)) {
                reply(404, ['error' => 'Sicherung nicht gefunden.']);
            }
            $old = json_decode((string) file_get_contents(BACKUP_DIR . '/' . $file), true, 64, JSON_THROW_ON_ERROR);
            $clean = validate($old, load_content());
            save_content($clean);
            reply(200, ['ok' => true, 'content' => json_decode(to_json($clean), true)]);

        default:
            reply(400, ['error' => 'Unbekannte Aktion.']);
    }
} catch (ValidationError $e) {
    reply(422, ['error' => 'Bitte prüfen:', 'details' => $e->errors]);
} catch (JsonException) {
    reply(400, ['error' => 'Daten konnten nicht gelesen werden.']);
} catch (Throwable $e) {
    reply(500, ['error' => $e->getMessage()]);
}
