import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import ENV from 'home/config/environment';

const COOKIE_KEY    = 'fazoo_remembered_phone';
const OTP_API       = ENV.TribeENV.API_URL + '/custom/auth/sendotp.php';

// Forgot-password sub-steps
const FP_STEP = {
  EMAIL:    'email',    // enter email → request OTP
  OTP:      'otp',     // enter 6-digit OTP
  PASSWORD: 'password', // enter new password
  DONE:     'done',    // success banner
};

const FP_STEP_ORDER = [FP_STEP.EMAIL, FP_STEP.OTP, FP_STEP.PASSWORD, FP_STEP.DONE];

export default class LoginController extends Controller {
  @service sessionAuth;
  @service router;
  @service store;
  @service cookies;

  // ── Shared ─────────────────────────────────────────────────────────────────
  @tracked isRegistering   = false;
  @tracked isForgotPassword = false;
  @tracked isBusy          = false;
  @tracked errorMessage    = '';
  @tracked successMessage  = '';

  // ── Login fields ────────────────────────────────────────────────────────────
  @tracked phone      = '';
  @tracked password   = '';
  @tracked rememberMe = false;

  // ── Registration fields ─────────────────────────────────────────────────────
  @tracked reg = {
    name: '',
    phone: '',
    phoneConfirm: '',
    password: '',
    email: '',
    gender: '',
    age: '',
    city: '',
    photoUrl: null,
    photoName: null,
  };

  @tracked photoPreview      = null;
  @tracked isUploadingPhoto  = false;
  @tracked photoUploadError  = null;

  // ── Forgot-password state ───────────────────────────────────────────────────
  @tracked fpStep        = FP_STEP.EMAIL;
  @tracked fpEmail       = '';
  @tracked fpOtp         = '';
  @tracked fpNewPassword = '';
  @tracked fpConfirmPass = '';
  @tracked fpResendCooldown = 0;
  #resendTimer = null;

  constructor() {
    super(...arguments);
    const saved = this.cookies.getCookie(COOKIE_KEY);
    if (saved) {
      this.phone      = saved;
      this.rememberMe = true;
    }
  }

  // ── Computed ────────────────────────────────────────────────────────────────
  get phoneMismatch() {
    return (
      this.reg.phone.length > 0 &&
      this.reg.phoneConfirm.length > 0 &&
      this.reg.phone !== this.reg.phoneConfirm
    );
  }

  get fpPasswordMismatch() {
    return (
      this.fpNewPassword.length > 0 &&
      this.fpConfirmPass.length > 0 &&
      this.fpNewPassword !== this.fpConfirmPass
    );
  }

  get canResend() {
    return this.fpResendCooldown === 0;
  }

  // ── Step-circle styles ──────────────────────────────────────────────────────
  // Returns the inline style string for each numbered circle in the
  // forgot-password stepper. Keeps all colour logic out of the template.
  _circleStyle(stepIndex) {
    const current = FP_STEP_ORDER.indexOf(this.fpStep);
    const isDone  = this.fpStep === FP_STEP.DONE;
    const active  = stepIndex === current && !isDone;
    const past    = stepIndex < current || isDone;

    const bg    = active ? '#7B2FBE' : past ? '#198754' : '#dee2e6';
    const color = (active || past) ? 'white' : '#6c757d';

    return `width:32px;height:32px;font-size:13px;background:${bg};color:${color}`;
  }

  get fpCircle1Style() { return this._circleStyle(0); }
  get fpCircle2Style() { return this._circleStyle(1); }
  get fpCircle3Style() { return this._circleStyle(2); }

  // ── Tab / panel switching ───────────────────────────────────────────────────
  @action
  showLogin() {
    this.isRegistering    = false;
    this.isForgotPassword = false;
    this._clearMessages();
  }

  @action
  showRegister() {
    this.isRegistering    = true;
    this.isForgotPassword = false;
    this._clearMessages();
  }

  @action
  showForgotPassword() {
    this.isRegistering    = false;
    this.isForgotPassword = true;
    this.fpStep           = FP_STEP.EMAIL;
    this.fpEmail          = '';
    this.fpOtp            = '';
    this.fpNewPassword    = '';
    this.fpConfirmPass    = '';
    this.fpResendCooldown = 0;
    this._clearMessages();
  }

  // ── Login ───────────────────────────────────────────────────────────────────
  @action
  async login() {
    this._clearMessages();
    if (!this.phone || !this.password) {
      this.errorMessage = 'Please enter your mobile number and password.';
      return;
    }

    this.isBusy = true;
    try {
      const ok = await this.sessionAuth.login(this.phone, this.password);
      if (ok) {
        if (this.rememberMe) {
          this.cookies.setCookie(COOKIE_KEY, this.phone);
        } else {
          this.cookies.eraseCookie(COOKIE_KEY);
        }
        this.router.transitionTo('veda.index');
      } else {
        this.errorMessage = 'Invalid mobile number or password.';
      }
    } finally {
      this.isBusy = false;
    }
  }

  // ── Forgot password — Step 1: request OTP ──────────────────────────────────
  @action
  async fpRequestOtp() {
    this._clearMessages();

    const email = this.fpEmail.trim();
    if (!email) {
      this.errorMessage = 'Please enter your registered email address.';
      return;
    }

    this.isBusy = true;
    try {
      // ── Guard: verify the email belongs to a registered account ──────────
      const results = await this.store.query('ba', {
        modules: { email },
        page: { offset: 0, limit: 1 },
      });

      if (results.length === 0) {
        this.errorMessage = 'No account found with that email address.';
        return;                          // bail out before touching the OTP API
      }

      // ── Email exists — proceed to send OTP ────────────────────────────────
      const res  = await fetch(OTP_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'send_otp', email }),
      });
      const data = await res.json();

      if (data.success) {
        this.fpStep = FP_STEP.OTP;
        this.successMessage =
          'A 6-digit OTP has been sent to your email. It expires in 10 minutes.';
        this._startResendCooldown(60);
      } else {
        this.errorMessage = data.error ?? 'Could not send OTP. Please try again.';
      }
    } catch {
      this.errorMessage = 'Network error. Please check your connection and try again.';
    } finally {
      this.isBusy = false;
    }
  }

  // ── Forgot password — resend OTP ───────────────────────────────────────────
  @action
  async fpResendOtp() {
    if (!this.canResend) return;
    this._clearMessages();
    await this.fpRequestOtp();
  }

  // ── Forgot password — Step 2: verify OTP ──────────────────────────────────
  @action
  async fpVerifyOtp() {
    this._clearMessages();

    const otp = this.fpOtp.trim();
    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      this.errorMessage = 'Please enter the 6-digit OTP exactly as received.';
      return;
    }

    this.isBusy = true;
    try {
      const res  = await fetch(OTP_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action: 'verify_otp',
          email:  this.fpEmail.trim(),
          otp,
        }),
      });
      const data = await res.json();

      if (data.success) {
        this.fpStep = FP_STEP.PASSWORD;
        this._clearMessages();
      } else {
        this.errorMessage = data.error ?? 'OTP verification failed. Please try again.';
      }
    } catch {
      this.errorMessage = 'Network error. Please try again.';
    } finally {
      this.isBusy = false;
    }
  }

  // ── Forgot password — Step 3: set new password ────────────────────────────
  @action
  async fpResetPassword() {
    this._clearMessages();

    if (!this.fpNewPassword || this.fpNewPassword.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters.';
      return;
    }
    if (this.fpNewPassword !== this.fpConfirmPass) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }

    this.isBusy = true;
    try {
      const res  = await fetch(OTP_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action:   'reset_password',
          email:    this.fpEmail.trim(),
          password: this.fpNewPassword,
        }),
      });
      const data = await res.json();

      if (data.success) {
        this.fpStep = FP_STEP.DONE;
        this.successMessage = 'Password updated successfully! You can now sign in.';
      } else {
        this.errorMessage = data.error ?? 'Could not update password. Please try again.';
      }
    } catch {
      this.errorMessage = 'Network error. Please try again.';
    } finally {
      this.isBusy = false;
    }
  }

  // ── Registration ────────────────────────────────────────────────────────────
  @action
  setGender(event) {
    this.reg = { ...this.reg, gender: event.target.value };
  }

  @action
  triggerPhotoInput() {
    document.getElementById('photoInput')?.click();
  }

  @action
  async onPhotoSelected(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    const reader    = new FileReader();
    reader.onload   = (e) => { this.photoPreview = e.target.result; };
    reader.readAsDataURL(file);

    this.isUploadingPhoto  = true;
    this.photoUploadError  = null;
    this.reg               = { ...this.reg, photoUrl: null, photoName: null };

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(ENV.TribeENV.API_URL + '/uploads.php', {
        method: 'POST',
        body:   formData,
      });
      const data = await response.json();

      if (data.status === 'success') {
        const url = `${ENV.TribeENV.API_URL}/${data.file.md.url}`;
        this.reg = { ...this.reg, photoUrl: url, photoName: data.file.name };
      } else {
        this.photoUploadError = data.error_message ?? 'Upload failed.';
        this.photoPreview     = null;
      }
    } catch {
      this.photoUploadError = 'Upload failed — please try again.';
      this.photoPreview     = null;
    } finally {
      this.isUploadingPhoto = false;
    }
  }

  @action
  async register() {
    this._clearMessages();

    const r       = this.reg;
    const missing = [];

    if (!r.name.trim())         missing.push('Full Name');
    if (!r.phone.trim())        missing.push('Mobile Number');
    if (!r.phoneConfirm.trim()) missing.push('Confirm Mobile');
    if (!r.password.trim())     missing.push('Password');
    if (!r.email.trim())        missing.push('Email Address');
    if (!r.gender)              missing.push('Gender');
    if (!r.age)                 missing.push('Age');
    if (!r.city.trim())         missing.push('City');
    if (!r.photoUrl)            missing.push('Profile Photo');

    if (missing.length > 0) {
      this.errorMessage = `Please fill in: ${missing.join(', ')}.`;
      return;
    }

    if (r.phone !== r.phoneConfirm) {
      this.errorMessage = 'Mobile numbers do not match. Please double-check.';
      return;
    }

    const age = parseInt(r.age, 10);
    if (isNaN(age) || age < 18 || age > 60) {
      this.errorMessage = 'Age must be between 18 and 60.';
      return;
    }

    this.isBusy = true;
    try {
      const ok = await this.sessionAuth.register({
        name:            r.name.trim(),
        phone:           r.phone.trim(),
        password:        r.password,
        email:           r.email.trim(),
        gender:          r.gender,
        age,
        city:            r.city.trim(),
        photoUrl:        r.photoUrl,
        content_privacy: 'public',
      });

      if (ok) {
        this.successMessage = 'Account created! You are now signed in.';
        this.router.transitionTo('veda.index');
      } else {
        this.errorMessage =
          'Registration failed. That mobile number may already be registered.';
      }
    } catch (err) {
      this.errorMessage = err?.message ?? 'Something went wrong. Please try again.';
    } finally {
      this.isBusy = false;
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────
  _clearMessages() {
    this.errorMessage   = '';
    this.successMessage = '';
  }

  _startResendCooldown(seconds) {
    clearInterval(this.#resendTimer);
    this.fpResendCooldown = seconds;
    this.#resendTimer = setInterval(() => {
      this.fpResendCooldown -= 1;
      if (this.fpResendCooldown <= 0) {
        this.fpResendCooldown = 0;
        clearInterval(this.#resendTimer);
      }
    }, 1000);
  }

  // Expose step constants to the template
  get FP_STEP() { return FP_STEP; }
}