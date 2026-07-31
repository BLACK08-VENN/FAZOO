<?php
/**
 * FAJU — Image ZIP Export Endpoint (fire-and-forget)
 *
 * POST /custom/reports/export-images.php
 * Body: {
 *   "zip_path": "exports/images-2025-01-01-to-2025-01-31-a1b2c3d4.zip",
 *   "files": [
 *     { "source_url": "/uploads/2025/01-January/03-Friday/photo_x.jpg",
 *       "dest_path": "2025-01-03/North/Springfield Primary/photo_x.jpg" }
 *   ]
 * }
 *
 * Copies each source (preferring its /lg/ variant for images) into a staging
 * tree under dest_path, zips the tree to /uploads/<zip_path>, removes staging.
 * Originals are never moved. Responds immediately; the archive appears at the
 * announced path once the build finishes.
 */

require __DIR__ . '/../../_init.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$api = new \Tribe\API();
$body = $api->requestBody ?? json_decode(file_get_contents('php://input'), true) ?? [];

$zipPathRel = $body['zip_path'] ?? '';
$files = $body['files'] ?? [];

$uploadsRoot = rtrim((new \Tribe\Config())->projectRoot(), '/') . '/uploads';

$zipPathRel = ltrim(str_replace('..', '', $zipPathRel), '/');
if ($zipPathRel === '' || substr($zipPathRel, -4) !== '.zip' || !is_array($files) || empty($files)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'detail' => 'Invalid zip_path or files.']);
    exit;
}

$zipAbs = $uploadsRoot . '/' . $zipPathRel;
$zipUrl = '/uploads/' . $zipPathRel;

echo json_encode(['status' => 'accepted', 'zip_url' => $zipUrl, 'count' => count($files)]);

if (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
} else {
    @ob_end_flush();
    @flush();
}

ignore_user_abort(true);
set_time_limit(0);

// Prefer the /lg/ thumbnail for images only. Videos (and anything that isn't
// an image) have no /lg/ variant, so use the original file unchanged.
$lgVariant = function (string $sourceAbs): string {
    if (!preg_match('#\.(jpe?g|png|gif|webp|svg)$#i', $sourceAbs)) {
        return $sourceAbs;
    }
    $dir = dirname($sourceAbs);
    $name = basename($sourceAbs);
    $lg = $dir . '/lg/' . $name;
    return is_file($lg) ? $lg : $sourceAbs;
};

$sanitizeSegment = fn(string $s): string =>
    trim(preg_replace('#[/\\\\:*?"<>|]+#', '_', $s)) ?: '_';

$staging = sys_get_temp_dir() . '/imgzip_' . bin2hex(random_bytes(8));
@mkdir($staging, 0775, true);

$added = 0;
foreach ($files as $f) {
    $srcUrl = $f['source_url'] ?? '';
    $destRel = $f['dest_path'] ?? '';
    if ($srcUrl === '' || $destRel === '') continue;

    $srcRel = ltrim(str_replace('..', '', parse_url($srcUrl, PHP_URL_PATH) ?? ''), '/');
    if (strpos($srcRel, 'uploads/') === 0) $srcRel = substr($srcRel, strlen('uploads/'));
    $srcAbs = $lgVariant($uploadsRoot . '/' . $srcRel);
    if (!is_file($srcAbs)) continue;

    $destRel = str_replace('..', '', $destRel);
    $segments = array_map($sanitizeSegment, array_filter(explode('/', $destRel), 'strlen'));
    $destAbs = $staging . '/' . implode('/', $segments);

    @mkdir(dirname($destAbs), 0775, true);
    if (@copy($srcAbs, $destAbs)) $added++;
}

if ($added > 0) {
    @mkdir(dirname($zipAbs), 0775, true);
    $zip = new ZipArchive();
    if ($zip->open($zipAbs, ZipArchive::CREATE | ZipArchive::OVERWRITE) === true) {
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($staging, FilesystemIterator::SKIP_DOTS)
        );
        foreach ($it as $file) {
            $local = substr($file->getPathname(), strlen($staging) + 1);
            $zip->addFile($file->getPathname(), $local);
        }
        $zip->close();
    }
}

$rrmdir = function (string $dir) use (&$rrmdir) {
    foreach (scandir($dir) ?: [] as $e) {
        if ($e === '.' || $e === '..') continue;
        $p = "$dir/$e";
        is_dir($p) ? $rrmdir($p) : @unlink($p);
    }
    @rmdir($dir);
};
$rrmdir($staging);