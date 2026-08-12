<?php
/**
 * Authentech dev-mode backend config.
 *
 * IMPORTANT — before you deploy this:
 *
 * 1. Change DEV_PASSWORD_HASH below. Generate a new one by running this
 *    on any machine with PHP installed:
 *
 *      php -r "echo password_hash('yourNewPassword', PASSWORD_DEFAULT);"
 *
 *    Paste the output (starts with $2y$...) in place of the value below.
 *    The default password for this template is:  authentech-dev
 *
 * 2. Make sure /data and /uploads/videos are writable by PHP (755 is
 *    usually fine — your host's file manager lets you chmod folders).
 *
 * 3. Set BACKEND_URL below to this backend's actual public URL (once you
 *    know it) — video links are built from it so they work when the
 *    frontend is served from a different domain (e.g. Vercel).
 *
 * 4. Add your frontend's exact URL(s) to $CORS_ALLOWED_ORIGINS below.
 *    This MUST be an exact match (no trailing slash) or the browser will
 *    block every request from the frontend.
 *
 * 5. This backend MUST be served over HTTPS for the cross-site login
 *    session to work at all — browsers refuse to set cross-site cookies
 *    over plain HTTP. Nearly every free PHP host issues a free SSL cert
 *    automatically; just make sure yours is actually active.
 */

// ---- 1. Dev password ----
define('DEV_PASSWORD_HASH', '$2y$10$nyW4CpUGwGYUgNDFS1HN6uP/KnWjfBkFw/b5FCUQRl7TxXtOxp/Be'); // "authentech-dev"

// ---- 3. This backend's own public URL (no trailing slash) ----
define('BACKEND_URL', 'https://your-backend-host.example.com'); // TODO: set this

// ---- 4. Exact frontend origin(s) allowed to call this API ----
$CORS_ALLOWED_ORIGINS = [
  'https://your-project.vercel.app',   // TODO: your production Vercel URL
  // 'https://your-custom-domain.com', // add a custom domain here too, if any
  // 'http://localhost:3000',          // uncomment while developing locally
];

define('DATA_DIR', __DIR__ . '/../data');
define('PROJECTS_FILE', DATA_DIR . '/projects.json');
define('UPLOAD_DIR', __DIR__ . '/../uploads/videos');
define('UPLOAD_URL_BASE', BACKEND_URL . '/uploads/videos/');

// Total storage cap across ALL screen recordings combined.
define('MAX_TOTAL_STORAGE_BYTES', 500 * 1024 * 1024); // 500MB

// Per-file soft cap, so one giant recording can't eat the whole 500MB.
define('MAX_SINGLE_FILE_BYTES', 150 * 1024 * 1024); // 150MB

define('ALLOWED_VIDEO_EXT', ['mp4', 'webm', 'mov']);

// ---- CORS — must run before session_start() ----
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $CORS_ALLOWED_ORIGINS, true)) {
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Vary: Origin');
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Browsers send a preflight OPTIONS request before cross-site POSTs —
// answer it immediately, before any session/auth logic runs.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

// Cross-site cookies require SameSite=None + Secure (HTTPS). This is what
// lets the dev-mode login session survive being on a different domain
// than the frontend.
session_set_cookie_params([
  'lifetime' => 0,
  'path' => '/',
  'domain' => '',
  'secure' => true,
  'httponly' => true,
  'samesite' => 'None',
]);
session_start();

function json_response($data, $code = 200) {
  http_response_code($code);
  header('Content-Type: application/json');
  echo json_encode($data);
  exit;
}

function require_dev_auth() {
  if (empty($_SESSION['dev_authed'])) {
    json_response(['error' => 'Not authorized. Please sign in to dev mode first.'], 401);
  }
}

function ensure_dirs() {
  if (!is_dir(DATA_DIR)) @mkdir(DATA_DIR, 0755, true);
  if (!is_dir(UPLOAD_DIR)) @mkdir(UPLOAD_DIR, 0755, true);
}

function load_projects() {
  ensure_dirs();
  if (!file_exists(PROJECTS_FILE)) return [];
  $raw = file_get_contents(PROJECTS_FILE);
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function save_projects($projects) {
  ensure_dirs();
  file_put_contents(PROJECTS_FILE, json_encode(array_values($projects), JSON_PRETTY_PRINT), LOCK_EX);
}

function current_storage_used() {
  ensure_dirs();
  $total = 0;
  foreach (glob(UPLOAD_DIR . '/*') as $f) {
    if (is_file($f)) $total += filesize($f);
  }
  return $total;
}
