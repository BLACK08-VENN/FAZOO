<?php
require __DIR__ . '/../../_init.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// ── Read & validate body ───────────────────────────────────────────────────
$body = json_decode(file_get_contents('php://input'), true);

if (!isset($body['messages']) || !is_array($body['messages']) || empty($body['messages'])) {
    http_response_code(400);
    echo json_encode(['error' => 'messages array is required']);
    exit;
}

$messages = $body['messages'];
$system   = $body['system'] ?? '';

// Sanitise: only keep role + content, ensure valid roles
$cleanMessages = [];
foreach ($messages as $m) {
    $role    = $m['role'] ?? '';
    $content = $m['content'] ?? '';
    if (!in_array($role, ['user', 'assistant'], true) || !is_string($content) || trim($content) === '') {
        continue;
    }
    $cleanMessages[] = ['role' => $role, 'content' => $content];
}

if (empty($cleanMessages)) {
    http_response_code(400);
    echo json_encode(['error' => 'No valid messages provided']);
    exit;
}

// ── Call Anthropic ─────────────────────────────────────────────────────────
$apiKey = getenv('ANTHROPIC_API_KEY') ?: '';
$payload = [
    'model'      => 'claude-sonnet-4-6',
    'max_tokens' => 1000,
    'messages'   => $cleanMessages,
];

if ($system !== '') {
    $payload['system'] = $system;
}

$ch = curl_init('https://api.anthropic.com/v1/messages');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'x-api-key: ' . $apiKey,
        'anthropic-version: 2023-06-01',
    ],
    CURLOPT_POSTFIELDS     => json_encode($payload),
    CURLOPT_TIMEOUT        => 30,
]);

$response   = curl_exec($ch);
$httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError  = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(502);
    echo json_encode(['error' => 'Could not reach AI service: ' . $curlError]);
    exit;
}

// Pass Anthropic's response straight through (status code + body)
http_response_code($httpStatus);
echo $response;