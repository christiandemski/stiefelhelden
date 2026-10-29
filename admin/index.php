<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

ensure_content();
start_session();
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'");
header('Cache-Control: no-store');

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    if (!check_csrf($_POST['csrf'] ?? null)) {
        $error = 'Sitzung abgelaufen. Bitte noch einmal versuchen.';
    } elseif ($action === 'login') {
        if (attempt_login((string) ($_POST['password'] ?? ''))) {
            header('Location: ./', true, 303);
            exit;
        }
        $error = 'Das Passwort stimmt nicht.';
    } elseif ($action === 'logout') {
        $_SESSION = [];
        session_destroy();
        header('Location: ./', true, 303);
        exit;
    }
}
$csrf = csrf_token();
$view = !is_configured() ? 'setup' : (is_logged_in() ? 'editor' : 'login');
?>
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#f4f5f9">
  <meta name="csrf" content="<?= e($csrf) ?>">
  <title>Pflege · Stiefelhelden</title>
  <link rel="icon" href="../assets/logo.jpg">
  <link rel="stylesheet" href="../assets/vendor/fonts/open-sans.css">
  <link rel="stylesheet" href="../assets/vendor/bootstrap/bootstrap.min.css">
  <link rel="stylesheet" href="../style.css">
  <link rel="stylesheet" href="admin.css">
  <script src="../theme.js"></script>
</head>
<body class="<?= $view === 'editor' ? 'has-savebar' : '' ?>">

  <nav class="navbar sticky-top sh-nav">
    <div class="container">
      <a class="navbar-brand d-flex align-items-center gap-2" href="./">
        <img src="../assets/logo.jpg" alt="" width="36" height="36" class="rounded-circle">
        <span>Stiefelhelden <span class="brand-sub">Pflege</span></span>
      </a>
      <div class="d-flex align-items-center gap-2">
        <a class="btn btn-sm btn-outline-secondary rounded-pill d-none d-sm-inline-block" href="../" target="_blank" rel="noopener">Seite ansehen ↗</a>
        <button type="button" class="theme-toggle" data-theme-toggle aria-pressed="false" aria-label="Dunklen Modus einschalten">
          <svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>
          <svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        </button>
        <?php if ($view === 'editor'): ?>
          <form method="post" class="m-0">
            <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
            <button class="btn btn-sm btn-outline-secondary rounded-pill" name="action" value="logout">Abmelden</button>
          </form>
        <?php endif; ?>
      </div>
    </div>
  </nav>

<?php if ($view === 'setup'): ?>
  <main class="container auth-wrap">
    <div class="tile">
      <p class="eyebrow text-accent">Einrichtung</p>
      <h1 class="section-title mb-3">Noch kein Passwort gesetzt.</h1>
      <p>Einmal auf der Kommandozeile im Projektordner ausführen:</p>
      <pre class="code"><code>ddev exec php admin/set-password.php</code></pre>
      <p class="text-body-secondary mb-0">Ohne DDEV: <code>php admin/set-password.php</code>. Danach diese Seite neu laden.</p>
    </div>
  </main>

<?php elseif ($view === 'login'): ?>
  <main class="container auth-wrap">
    <form method="post" class="tile">
      <p class="eyebrow text-accent">Pflege</p>
      <h1 class="section-title mb-4">Anmelden</h1>
      <?php if ($error): ?><div class="alert alert-danger"><?= e($error) ?></div><?php endif; ?>
      <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
      <input type="hidden" name="action" value="login">
      <label class="form-label" for="pw">Passwort</label>
      <input class="form-control form-control-lg mb-3" type="password" id="pw" name="password" autocomplete="current-password" required autofocus>
      <button class="btn btn-green rounded-pill px-4">Anmelden</button>
    </form>
  </main>

<?php else: ?>
  <main class="container py-4 py-lg-5">
    <div class="row g-4">
      <aside class="col-lg-3">
        <nav class="admin-nav tile p-2" aria-label="Bereiche">
          <a href="#s-allgemein">Allgemein</a>
          <a href="#s-texte">Texte</a>
          <a href="#s-next">Nächster Start</a>
          <a href="#s-pbs">Bestzeiten</a>
          <a href="#s-rennen">Rennen</a>
          <a href="#s-orte">Orte</a>
          <a href="#s-liste">Die Liste</a>
          <a href="#s-links">Links</a>
          <a href="#s-backups">Sicherungen</a>
        </nav>
      </aside>

      <div class="col-lg-9" id="editor">
        <div id="alerts" aria-live="polite"></div>

        <section class="tile admin-section" id="s-allgemein">
          <h2>Allgemein</h2>
          <div class="row g-3" data-render="allgemein"></div>
        </section>

        <section class="tile admin-section" id="s-texte">
          <h2>Texte</h2>
          <p class="hint">Die festen Texte der Seite. <code>*Wort*</code> wird hervorgehoben (in der Startkachel grün). Feld leeren = Standardtext.</p>
          <div class="row g-3" data-render="texte"></div>
        </section>

        <section class="tile admin-section" id="s-next">
          <h2>Nächster Start</h2>
          <p class="hint">Wird auf der Seite automatisch ausgeblendet, sobald das Datum vorbei ist.</p>
          <div data-render="next"></div>
        </section>

        <section class="tile admin-section" id="s-pbs">
          <h2>Bestzeiten</h2>
          <p class="hint">Für 5&nbsp;km, 10&nbsp;km, Halbmarathon und Marathon rechnet die Seite die Bestzeiten <strong>automatisch aus den Rennen</strong> aus (ohne Läufe ohne offizielle Zeitnahme). Hier nur eintragen, was dort fehlt – z.&nbsp;B. andere Distanzen oder Zeiten von Läufen, die nicht in der Rennliste stehen. Bei gleicher Distanz zählt die schnellere Zeit.</p>
          <div data-render="pbs"></div>
        </section>

        <section class="tile admin-section" id="s-rennen">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <h2 class="m-0">Rennen</h2>
            <button type="button" class="btn btn-green btn-sm rounded-pill px-3" data-act="add-race">+ Rennen</button>
          </div>
          <p class="hint">Neueste zuerst. Wer nicht dabei war: Haken raus. Dabei, aber nicht gestartet oder nicht ins Ziel gekommen: DNS bzw. DNF wählen. Das Rennen zählt trotzdem als „zusammen“.</p>
          <div data-render="rennen"></div>
        </section>

        <section class="tile admin-section" id="s-orte">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <h2 class="m-0">Orte</h2>
            <button type="button" class="btn btn-green btn-sm rounded-pill px-3" data-act="geo-all">Fehlende suchen</button>
          </div>
          <p class="hint">Für die Karte. Die Orte kommen von selbst aus den Rennen. „Suchen“ holt die Koordinaten bei OpenStreetMap (bei „Essen/Mülheim“ wird nach „Essen“ gesucht). Passt ein Treffer nicht, Koordinaten von Hand eintragen – z.&nbsp;B. aus einer Karten-App per Rechtsklick auf den Ort.</p>
          <div data-render="orte"></div>
        </section>

        <section class="tile admin-section" id="s-liste">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <h2 class="m-0">Die Liste</h2>
            <button type="button" class="btn btn-green btn-sm rounded-pill px-3" data-act="add-wish">+ Eintrag</button>
          </div>
          <p class="hint">Rennen, die ihr noch laufen wollt. Haken setzen, wenn geschafft.</p>
          <div data-render="liste"></div>
        </section>

        <section class="tile admin-section" id="s-links">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <h2 class="m-0">Links</h2>
            <button type="button" class="btn btn-green btn-sm rounded-pill px-3" data-act="add-link">+ Link</button>
          </div>
          <p class="hint">Erscheinen unten auf der Seite, z.&nbsp;B. Instagram oder Strava.</p>
          <div data-render="links"></div>
        </section>

        <section class="tile admin-section" id="s-backups">
          <h2>Sicherungen</h2>
          <p class="hint">Vor jedem Speichern wird der alte Stand gesichert (die letzten <?= BACKUP_KEEP ?>).</p>
          <div data-render="backups"><p class="text-body-secondary m-0">Lädt …</p></div>
        </section>
      </div>
    </div>
  </main>

  <div class="savebar">
    <div class="container d-flex align-items-center justify-content-end gap-3">
      <span class="save-status" id="save-status" aria-live="polite">Alles gespeichert.</span>
      <button type="button" class="btn btn-green rounded-pill px-4" id="save" disabled>Speichern</button>
    </div>
  </div>

  <script type="application/json" id="content-data"><?= to_json(load_content()) ?></script>
  <script type="application/json" id="anzeige-def"><?= json_encode(ANZEIGE, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?></script>
  <script type="application/json" id="texte-def"><?= json_encode(array_map(fn ($t) => ['label' => $t[0], 'rows' => $t[3]], TEXTE), JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?></script>
  <script src="admin.js"></script>
<?php endif; ?>
</body>
</html>
