<?php
require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

function handle_video_upload($file) {
  ensure_dirs();

  if ($file['error'] !== UPLOAD_ERR_OK) {
    $msg = 'Upload failed.';
    if ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE) {
      $msg = 'That file is larger than this server currently allows per upload (check upload_max_filesize / post_max_size).';
    }
    return ['error' => $msg];
  }
  if ($file['size'] > MAX_SINGLE_FILE_BYTES) {
    return ['error' => 'That recording is over the ' . round(MAX_SINGLE_FILE_BYTES / 1024 / 1024) . 'MB per-file limit.'];
  }
  $used = current_storage_used();
  if ($used + $file['size'] > MAX_TOTAL_STORAGE_BYTES) {
    $remaining = max(0, MAX_TOTAL_STORAGE_BYTES - $used);
    return ['error' => 'Not enough storage left — ' . round($remaining / 1024 / 1024) . 'MB remaining of the ' . round(MAX_TOTAL_STORAGE_BYTES / 1024 / 1024) . 'MB total. Delete an old recording first.'];
  }
  $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
  if (!in_array($ext, ALLOWED_VIDEO_EXT, true)) {
    return ['error' => 'Only .mp4, .webm, or .mov screen recordings are allowed.'];
  }
  $filename = bin2hex(random_bytes(8)) . '.' . $ext;
  $dest = UPLOAD_DIR . '/' . $filename;
  if (!move_uploaded_file($file['tmp_name'], $dest)) {
    return ['error' => 'Upload failed — please try again.'];
  }
  return ['url' => UPLOAD_URL_BASE . $filename, 'size' => filesize($dest)];
}

function delete_video_file($relativeUrl) {
  if (!$relativeUrl) return;
  $path = __DIR__ . '/../' . $relativeUrl;
  if (is_file($path)) @unlink($path);
}

if ($method === 'GET' && $action === 'list') {
  json_response(['projects' => load_projects()]);
}

if ($method === 'GET' && $action === 'storage') {
  json_response([
    'usedBytes' => current_storage_used(),
    'limitBytes' => MAX_TOTAL_STORAGE_BYTES,
  ]);
}

if ($method === 'POST' && $action === 'create') {
  require_dev_auth();
  $name = trim($_POST['name'] ?? '');
  if ($name === '') json_response(['error' => 'Project name is required'], 422);

  $video = null;
  if (!empty($_FILES['video']) && $_FILES['video']['name']) {
    $video = handle_video_upload($_FILES['video']);
    if (isset($video['error'])) json_response($video, 422);
  }

  $tags = [];
  if (!empty($_POST['tags'])) {
    $tags = array_values(array_filter(array_map('trim', explode(',', $_POST['tags']))));
  }

  $projects = load_projects();
  $project = [
    'id' => 'p_' . bin2hex(random_bytes(6)),
    'name' => $name,
    'tagline' => trim($_POST['tagline'] ?? ''),
    'description' => trim($_POST['description'] ?? ''),
    'live' => trim($_POST['live'] ?? ''),
    'repo' => trim($_POST['repo'] ?? ''),
    'tags' => $tags,
    'video' => $video ? $video['url'] : null,
    'videoBytes' => $video ? $video['size'] : 0,
    'createdAt' => date('c'),
  ];
  $projects[] = $project;
  save_projects($projects);
  json_response(['project' => $project]);
}

if ($method === 'POST' && $action === 'update') {
  require_dev_auth();
  $id = $_POST['id'] ?? '';
  $projects = load_projects();
  $idx = null;
  foreach ($projects as $i => $p) { if ($p['id'] === $id) { $idx = $i; break; } }
  if ($idx === null) json_response(['error' => 'Project not found'], 404);

  foreach (['name', 'tagline', 'description', 'live', 'repo'] as $field) {
    if (isset($_POST[$field])) $projects[$idx][$field] = trim($_POST[$field]);
  }
  if (isset($_POST['tags'])) {
    $projects[$idx]['tags'] = array_values(array_filter(array_map('trim', explode(',', $_POST['tags']))));
  }

  if (!empty($_FILES['video']) && $_FILES['video']['name']) {
    // Exclude the file being replaced from the storage-used calculation
    $used = current_storage_used();
    if (!empty($projects[$idx]['video'])) {
      $oldPath = __DIR__ . '/../' . $projects[$idx]['video'];
      if (is_file($oldPath)) $used -= filesize($oldPath);
    }
    $file = $_FILES['video'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
      json_response(['error' => 'Upload failed.'], 422);
    }
    if ($file['size'] > MAX_SINGLE_FILE_BYTES) {
      json_response(['error' => 'That recording is over the ' . round(MAX_SINGLE_FILE_BYTES / 1024 / 1024) . 'MB per-file limit.'], 422);
    }
    if ($used + $file['size'] > MAX_TOTAL_STORAGE_BYTES) {
      $remaining = max(0, MAX_TOTAL_STORAGE_BYTES - $used);
      json_response(['error' => 'Not enough storage left — ' . round($remaining / 1024 / 1024) . 'MB remaining of the ' . round(MAX_TOTAL_STORAGE_BYTES / 1024 / 1024) . 'MB total.'], 422);
    }
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ALLOWED_VIDEO_EXT, true)) {
      json_response(['error' => 'Only .mp4, .webm, or .mov screen recordings are allowed.'], 422);
    }
    $filename = bin2hex(random_bytes(8)) . '.' . $ext;
    $dest = UPLOAD_DIR . '/' . $filename;
    if (!move_uploaded_file($file['tmp_name'], $dest)) {
      json_response(['error' => 'Upload failed — please try again.'], 500);
    }
    delete_video_file($projects[$idx]['video'] ?? null);
    $projects[$idx]['video'] = UPLOAD_URL_BASE . $filename;
    $projects[$idx]['videoBytes'] = filesize($dest);
  }

  save_projects($projects);
  json_response(['project' => $projects[$idx]]);
}

if ($method === 'POST' && $action === 'delete') {
  require_dev_auth();
  $id = $_POST['id'] ?? '';
  $projects = load_projects();
  $kept = [];
  $removed = null;
  foreach ($projects as $p) {
    if ($p['id'] === $id) { $removed = $p; continue; }
    $kept[] = $p;
  }
  if ($removed) delete_video_file($removed['video'] ?? null);
  save_projects($kept);
  json_response(['ok' => true]);
}

if ($method === 'POST' && $action === 'delete_video') {
  require_dev_auth();
  $id = $_POST['id'] ?? '';
  $projects = load_projects();
  foreach ($projects as $i => $p) {
    if ($p['id'] === $id) {
      delete_video_file($p['video'] ?? null);
      $projects[$i]['video'] = null;
      $projects[$i]['videoBytes'] = 0;
      save_projects($projects);
      json_response(['project' => $projects[$i]]);
    }
  }
  json_response(['error' => 'Project not found'], 404);
}

json_response(['error' => 'Unknown action'], 400);
