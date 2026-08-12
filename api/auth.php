<?php
require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'GET' && $action === 'check') {
  json_response(['authed' => !empty($_SESSION['dev_authed'])]);
}

if ($method === 'POST' && $action === 'login') {
  $input = json_decode(file_get_contents('php://input'), true) ?: [];
  $password = $input['password'] ?? '';
  if ($password !== '' && password_verify($password, DEV_PASSWORD_HASH)) {
    $_SESSION['dev_authed'] = true;
    session_regenerate_id(true);
    json_response(['authed' => true]);
  }
  json_response(['authed' => false, 'error' => 'Incorrect password'], 401);
}

if ($method === 'POST' && $action === 'logout') {
  $_SESSION = [];
  if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
  }
  session_destroy();
  json_response(['authed' => false]);
}

json_response(['error' => 'Unknown action'], 400);
