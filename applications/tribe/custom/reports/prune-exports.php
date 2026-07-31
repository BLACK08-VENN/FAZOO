<?php
/**
 * FAJU — Export ZIP Pruner
 *
 * GET /custom/reports/prune-exports.php
 *
 * Deletes /uploads/exports/*.zip older than RETENTION_HOURS. Called
 * fire-and-forget when the reports route loads; no cron required.
 */

require __DIR__ . '/../../_init.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

const RETENTION_HOURS = 24;

$exportsDir = rtrim((new \Tribe\Config())->projectRoot(), '/') . '/uploads/exports';
$cutoff = time() - RETENTION_HOURS * 3600;

$pruned = 0;
foreach (glob($exportsDir . '/*.zip') ?: [] as $zip) {
    if (filemtime($zip) < $cutoff && @unlink($zip)) $pruned++;
}

echo json_encode(['status' => 'ok', 'pruned' => $pruned]);
