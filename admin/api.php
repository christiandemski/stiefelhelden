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
            reply(200, ['ok' => true, 'content' => json_decode(to_json($clean), true)]);

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
