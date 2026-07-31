<?php
/**
 * FAJU — CSV Export Endpoint
 * 
 * Usage: GET /custom/reports/export-csv.php?type=checkins&from=2025-01-01&to=2025-12-31&campaign=5
 * 
 * Exports records of the given type as a downloadable CSV file.
 * Supports date range filtering and campaign filtering.
 */

require __DIR__ . '/../../_init.php';

$core = new \Tribe\Core();
$config = new \Tribe\Config();

// Parse parameters
$type = $_GET['type'] ?? 'checkin';
$from = $_GET['from'] ?? null;
$to = $_GET['to'] ?? null;
$campaignId = $_GET['campaign'] ?? null;

// Map report types to actual Tribe types
$typeMap = [
    'checkins' => 'checkin',
    'promoters' => 'promoter',
    'customers' => 'customer',
    'campaigns' => 'campaign',
];

$tribeType = $typeMap[$type] ?? $type;

// Build search criteria
$searchArr = ['type' => $tribeType];

if ($campaignId) {
    $searchArr['campaign'] = $campaignId;
}

// Build range filter for date fields
$range = [];
if ($from || $to) {
    $dateField = 'created_on';

    // Use appropriate date field per type
    if ($tribeType === 'checkin') {
        $dateField = 'checkin_datetime';
    } elseif ($tribeType === 'customer') {
        $dateField = 'engagement_date';
    } elseif ($tribeType === 'campaign') {
        $dateField = 'start_date';
    }

    $rangeVal = [];
    if ($from) {
        $rangeVal['from'] = strtotime($from);
    }
    if ($to) {
        $rangeVal['to'] = strtotime($to . ' 23:59:59');
    }
    $range[$dateField] = $rangeVal;
}

// Fetch IDs
$ids = $core->getIDs(
    search_arr: $searchArr,
    limit: "0, 10000",
    sort_field: 'created_on',
    sort_order: 'DESC',
    show_public_objects_only: false,
    range: !empty($range) ? $range : []
);

if (empty($ids)) {
    header('Content-Type: text/plain');
    echo "No records found.";
    exit;
}

// Fetch objects
$objects = $core->getObjects($ids);

// Get type schema for column headers
$types = $config->getTypes();
$schema = [];
if (isset($types[$tribeType]['modules'])) {
    foreach ($types[$tribeType]['modules'] as $module) {
        $schema[] = $module['input_slug'];
    }
}

// Fallback: use keys from first object
if (empty($schema) && !empty($objects)) {
    $first = reset($objects);
    $schema = array_keys($first);
}

// Remove internal fields from export
$excludeFields = ['content_privacy', 'files', 'stock_analysis_notes', 'description'];
$schema = array_filter($schema, fn($f) => !in_array($f, $excludeFields));

// Output CSV
$filename = $tribeType . '_export_' . date('Y-m-d_His') . '.csv';
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Access-Control-Allow-Origin: *');

$output = fopen('php://output', 'w');

// Write header row
$headerRow = array_merge(['id', 'slug'], array_values($schema), ['created_on', 'updated_on']);
fputcsv($output, $headerRow);

// Write data rows
foreach ($objects as $obj) {
    $row = [
        $obj['id'] ?? '',
        $obj['slug'] ?? '',
    ];

    foreach ($schema as $field) {
        $val = $obj[$field] ?? '';
        if (is_array($val)) {
            $val = json_encode($val);
        }
        $row[] = $val;
    }

    $row[] = isset($obj['created_on']) ? date('Y-m-d H:i:s', $obj['created_on']) : '';
    $row[] = isset($obj['updated_on']) ? date('Y-m-d H:i:s', $obj['updated_on']) : '';

    fputcsv($output, $row);
}

fclose($output);
exit;
