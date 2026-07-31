<?php
require __DIR__ . '/../../_init.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

$api = new \Tribe\API;
$_ENV['MAILPACE_SERVER_TOKEN'] = '4239ec3e-50bb-4991-a3d8-9233f99105cc';

if ($_SERVER['REQUEST_METHOD'] === 'POST')
  $_POST = $api->requestBody;

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// ── Helper: start session safely ─────────────────────────────────────────────
if (session_status() === PHP_SESSION_NONE) {
  session_start();
}

$action = $_POST['action'] ?? 'send_otp';

// ════════════════════════════════════════════════════════════════════════════
// ACTION: send_otp
// Expects: email
// Generates a 6-digit OTP, stores it + expiry in session, emails it.
// ════════════════════════════════════════════════════════════════════════════
if ($action === 'send_otp') {

  $email = trim($_POST['email'] ?? '');

  if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['error' => 'A valid email address is required.']);
    exit;
  }

  if (!($_ENV['MAILPACE_SERVER_TOKEN'] ?? false)) {
    echo json_encode(['error' => 'SMTP not configured on this server.']);
    exit;
  }

  // Look up the BA by email so we know the account exists
  // (avoids leaking whether an email is registered via timing — but we still
  //  return a generic success so enumerators learn nothing)
  $ba = null;
  try {
    $results = $api->store->query('ba', [
      'modules' => ['email' => $email],
      'show_public_objects_only' => false,
      'page' => ['offset' => 0, 'limit' => 1],
    ]);
    if (!empty($results)) {
      $ba = $results[0];
    }
  } catch (\Throwable $e) {
    // swallow — generic response below
  }

  // Always respond "success" so attackers can't enumerate emails
  if (!$ba) {
    echo json_encode(['success' => true]);
    exit;
  }

  // Generate OTP
  $otp    = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
  $expiry = time() + 600; // 10 minutes

  // Store in session keyed by email (normalised)
  $_SESSION['otp_data'] = [
    'email'  => strtolower($email),
    'otp'    => $otp,
    'expiry' => $expiry,
    'ba_id'  => $ba['id'],
  ];

  // Send the email
  $mail = new PHPMailer(true);
  try {
    $mail->isSMTP();
    $mail->Host     = 'smtp.mailpace.com';
    $mail->SMTPAuth = true;
    $mail->Username = $_ENV['MAILPACE_SERVER_TOKEN'];
    $mail->Password = $_ENV['MAILPACE_SERVER_TOKEN'];
    $mail->Port     = 25;

    $mail->setFrom('otp@setarez.com', 'Fazoo');
    $mail->addAddress($email);

    $mail->isHTML(true);
    $mail->Subject = 'Your Fazoo Password-Reset OTP: ' . $otp;
    $mail->Body    = '
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#faf7ff;border-radius:12px">
        <div style="text-align:center;margin-bottom:24px">
          <img src="https://fazoo.setarez.com/favicon.png" width="80" style="border-radius:12px" />
        </div>
        <h2 style="text-align:center;color:#5A1E82">Password Reset OTP</h2>
        <p style="text-align:center;color:#555">Use the code below to reset your Fazoo BA password.<br>It expires in <strong>10 minutes</strong>.</p>
        <div style="text-align:center;margin:28px 0">
          <span style="font-size:42px;font-weight:bold;letter-spacing:10px;color:#7B2FBE">' . $otp . '</span>
        </div>
        <p style="text-align:center;color:#999;font-size:13px">If you did not request this, please ignore this email.</p>
      </div>';

    $mail->send();
    echo json_encode(['success' => true]);

  } catch (Exception $e) {
    // Clear session so a failed send doesn't leave a phantom OTP
    unset($_SESSION['otp_data']);
    echo json_encode(['error' => 'Email could not be sent. Please try again.']);
  }

  exit;
}

// ════════════════════════════════════════════════════════════════════════════
// ACTION: verify_otp
// Expects: email, otp
// Returns: { success: true } or { error: '...' }
// ════════════════════════════════════════════════════════════════════════════
if ($action === 'verify_otp') {

  $email      = strtolower(trim($_POST['email'] ?? ''));
  $userOtp    = trim($_POST['otp'] ?? '');
  $otpData    = $_SESSION['otp_data'] ?? null;

  if (!$otpData) {
    echo json_encode(['error' => 'No OTP found. Please request a new one.']);
    exit;
  }

  if ($otpData['email'] !== $email) {
    echo json_encode(['error' => 'Email mismatch. Please restart the process.']);
    exit;
  }

  if (time() > $otpData['expiry']) {
    unset($_SESSION['otp_data']);
    echo json_encode(['error' => 'OTP has expired. Please request a new one.']);
    exit;
  }

  if ($userOtp !== $otpData['otp']) {
    echo json_encode(['error' => 'Incorrect OTP. Please try again.']);
    exit;
  }

  // Mark OTP as verified (keep ba_id for the reset step)
  $_SESSION['otp_data']['verified'] = true;

  echo json_encode(['success' => true]);
  exit;
}

// ════════════════════════════════════════════════════════════════════════════
// ACTION: reset_password
// Expects: email, password
// Requires a prior verified OTP in session.
// ════════════════════════════════════════════════════════════════════════════
if ($action === 'reset_password') {

  $email    = strtolower(trim($_POST['email'] ?? ''));
  $password = $_POST['password'] ?? '';
  $otpData  = $_SESSION['otp_data'] ?? null;

  if (!$otpData || empty($otpData['verified'])) {
    echo json_encode(['error' => 'OTP not verified. Please complete verification first.']);
    exit;
  }

  if ($otpData['email'] !== $email) {
    echo json_encode(['error' => 'Email mismatch. Please restart the process.']);
    exit;
  }

  if (strlen($password) < 6) {
    echo json_encode(['error' => 'Password must be at least 6 characters.']);
    exit;
  }

  $baId = $otpData['ba_id'];

  try {
    $api->store->update('ba', $baId, [
      'modules' => ['password' => $password],
    ]);

    // Invalidate the OTP session
    unset($_SESSION['otp_data']);

    echo json_encode(['success' => true]);

  } catch (\Throwable $e) {
    echo json_encode(['error' => 'Could not update password. Please try again.']);
  }

  exit;
}

// Fallback — unknown action
echo json_encode(['error' => 'Unknown action.']);