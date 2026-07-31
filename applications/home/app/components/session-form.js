import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import ENV from 'home/config/environment';

const ACTIVITY_TYPES = [
  { slug: 'crayon_colouring', title: 'Crayon Colouring' },
  { slug: 'watercolour_painting', title: 'Watercolour Painting' },
  { slug: 'paper_crafts', title: 'Paper Crafts' },
];

const STATUS_OPTIONS = [
  { slug: 'completed', title: 'Completed' },
  { slug: 'cancelled', title: 'Cancelled' },
];

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_CHARS = 2;
const SEARCH_PAGE_LIMIT = 20;

export default class SessionFormComponent extends Component {
  @service store;

  activityTypes = ACTIVITY_TYPES;
  statusOptions = STATUS_OPTIONS;

  // ── School search ──────────────────────────────────────────────────────────
  @tracked schoolResults = [];
  @tracked isSearchingSchools = false;
  @tracked schoolSearchError = null;
  _searchTimer = null;

  // ── Form fields ────────────────────────────────────────────────────────────
  @tracked selectedSchool = null;
  @tracked sessionDate = '';
  @tracked selectedActivityTypes = [];

  @tracked learnerCountByActivity = {};
  @tracked legacyCountNeedsResplit = false;
  @tracked mediaItems = [];

  @tracked uploadingCount = 0;
  @tracked kissflowConfirmed = false;
  @tracked notes = '';
  @tracked checkinLatitude = null;
  @tracked checkinLongitude = null;
  @tracked slideshowIndex = 0;
  @tracked status = STATUS_OPTIONS[0];
  @tracked cancellationReason = '';

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  constructor(owner, args) {
    super(owner, args);
    this._populateFromSession();

    if (!this.checkinLatitude || !this.checkinLongitude) {
      this.captureGeolocation();
    }
  }

  _populateFromSession() {
    const s = this.args.session;
    if (!s) {
      this.sessionDate = new Date().toISOString().slice(0, 10);
      return;
    }

    const m = s.modules;

    this.sessionDate = m.session_date ?? '';
    this.kissflowConfirmed = m.kissflow_confirmed ?? false;
    this.notes = m.notes ?? '';
    this.checkinLatitude = m.checkin_latitude ?? null;
    this.checkinLongitude = m.checkin_longitude ?? null;

    const savedStatus = STATUS_OPTIONS.find((opt) => opt.slug === m.status);
    this.status = savedStatus ?? STATUS_OPTIONS[0];

    this.cancellationReason = m.cancellation_reason ?? '';

    // Activity types – stored as array or legacy single string
    const raw = m.activity_type;
    if (Array.isArray(raw)) {
      this.selectedActivityTypes = ACTIVITY_TYPES.filter((a) =>
        raw.includes(a.slug),
      );
    } else if (raw) {
      const found = ACTIVITY_TYPES.find((a) => a.slug === raw);
      this.selectedActivityTypes = found ? [found] : [];
    }

    const counts =
      m.learner_counts && typeof m.learner_counts === 'object'
        ? m.learner_counts
        : null;

    if (counts) {
      const next = {};
      for (const a of this.selectedActivityTypes) {
        const v = counts[a.slug];
        next[a.slug] =
          v == null || v === '' ? '' : String(Math.max(0, parseInt(v, 10) || 0));
      }
      this.learnerCountByActivity = next;
    } else if (m.learner_count != null && m.learner_count !== '') {
      const legacy = String(Math.max(0, parseInt(m.learner_count, 10) || 0));
      if (this.selectedActivityTypes.length === 1) {
        this.learnerCountByActivity = {
          [this.selectedActivityTypes[0].slug]: legacy,
        };
      } else if (this.selectedActivityTypes.length > 1) {
        this.legacyCountNeedsResplit = true;
        this.learnerCountByActivity = {};
      }
    }

    const stored = m.media_links;
    const links = Array.isArray(stored) ? stored : stored ? [stored] : [];
    this.mediaItems = links.map((url) => ({
      name: url.split('/').pop(),
      url,
      isVideo: /\.(mp4|webm|ogg|mov)$/i.test(url),
    }));

    this.selectedSchool = this.args.existingSchool ?? null;
  }

  get learnerCountEntries() {
    return this.selectedActivityTypes.map((a) => ({
      slug: a.slug,
      title: a.title,
      value: this.learnerCountByActivity[a.slug] ?? '',
    }));
  }

  get totalLearnerCount() {
    return Object.values(this.learnerCountByActivity).reduce(
      (sum, v) => sum + (parseInt(v, 10) || 0),
      0,
    );
  }

  get hasHighLearnerCount() {
    return this.totalLearnerCount >= 300;
  }

  get isCancelled() {
    return this.status?.slug === 'cancelled';
  }

  get isUploading() {
    return this.uploadingCount > 0;
  }

  @action
  async searchSchools(term) {
    clearTimeout(this._searchTimer);
    this.schoolSearchError = null;

    if (!term || term.length < SEARCH_MIN_CHARS) {
      this.schoolResults = [];
      return this.schoolResults;
    }

    return new Promise((resolve) => {
      this._searchTimer = setTimeout(async () => {
        this.isSearchingSchools = true;
        try {
          const results = await this.store.query('school', {
            filter: { title: term.replace(/'/g, "\\'") },
            sort: 'title',
            page: { offset: 0, limit: SEARCH_PAGE_LIMIT },
          });
          this.schoolResults = results.slice();
        } catch {
          this.schoolSearchError = 'Could not load schools. Please try again.';
          this.schoolResults = [];
        } finally {
          this.isSearchingSchools = false;
          resolve(this.schoolResults);
        }
      }, SEARCH_DEBOUNCE_MS);
    });
  }

  @action
  onSchoolChange(school) {
    this.selectedSchool = school;
  }

  @action
  onActivityTypeChange(selected) {
    this.selectedActivityTypes = selected;

    const validSlugs = new Set(selected.map((a) => a.slug));
    const next = {};
    for (const slug of Object.keys(this.learnerCountByActivity)) {
      if (validSlugs.has(slug)) {
        next[slug] = this.learnerCountByActivity[slug];
      }
    }
    this.learnerCountByActivity = next;

    if (this.legacyCountNeedsResplit) this.legacyCountNeedsResplit = false;
  }

  @action
  onStatusChange(selected) {
    this.status = selected;
    if (selected.slug !== 'cancelled') {
      this.cancellationReason = '';
    }
  }

  @action
  onCancellationReasonChange(event) {
    this.cancellationReason = event.target.value;
  }

  @action
  onLearnerCountChange(slug, event) {
    const raw = event.target.value;
    const sanitized =
      raw === '' ? '' : String(Math.max(0, parseInt(raw, 10) || 0));

    this.learnerCountByActivity = {
      ...this.learnerCountByActivity,
      [slug]: sanitized,
    };
  }

  @action
  onNotesChange(event) {
    this.notes = event.target.value;
  }

  @action
  onSessionDateChange(event) {
    this.sessionDate = event.target.value;
  }

  @action
  captureGeolocation() {
    if (!navigator.geolocation) {
      console.warn('[SessionForm] Geolocation not supported.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.checkinLatitude = pos.coords.latitude;
        this.checkinLongitude = pos.coords.longitude;
      },
      (err) => {
        console.warn('[SessionForm] Geolocation error:', err.message);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  @action
  async onFilesChange(event) {
    const files = Array.from(event.target.files);
    event.target.value = '';

    for (const file of files) {
      this.uploadingCount += 1;
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(ENV.TribeENV.API_URL + '/uploads.php', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();

        if (data.status === 'success') {
          const url = `${ENV.TribeENV.API_URL}/${data.file.md.url}`;
          this.mediaItems = [
            ...this.mediaItems,
            {
              name: data.file.name,
              url,
              isVideo: data.file.mime.startsWith('video/'),
            },
          ];
        } else {
          console.error('[SessionForm] Upload failed:', data.error_message);
        }
      } catch (err) {
        console.error('[SessionForm] Upload error:', err);
      } finally {
        this.uploadingCount -= 1;
      }
    }
  }

  @action
  removeSlide(item) {
    this.mediaItems = this.mediaItems.filter((m) => m !== item);
    const newLen = this.mediaItems.length;
    if (newLen === 0) {
      this.slideshowIndex = 0;
    } else if (this.slideshowIndex >= newLen) {
      this.slideshowIndex = newLen - 1;
    }
  }

  @action
  goToSlide(index) {
    this.slideshowIndex = index;
  }

  @action
  prevSlide() {
    if (this.slideshowIndex > 0) this.slideshowIndex--;
  }

  @action
  nextSlide() {
    if (this.slideshowIndex < this.mediaItems.length - 1) this.slideshowIndex++;
  }

  @action
  toggleKissflowConfirmed() {
    this.kissflowConfirmed = !this.kissflowConfirmed;
  }

  @action
  handleSubmit() {
    if (!this.args.onSave) return;

    const learnerCounts = {};
    for (const a of this.selectedActivityTypes) {
      const raw = this.learnerCountByActivity[a.slug];
      learnerCounts[a.slug] = parseInt(raw, 10) || 0;
    }

    this.args.onSave({
      selectedSchool: this.selectedSchool,
      sessionDate: this.sessionDate,
      selectedActivityTypes: this.selectedActivityTypes,
      learnerCounts,
      // FIX: was "mediaLinks" — controllers destructure this key as "mediaFiles"
      mediaFiles: this.mediaItems.map((m) => m.url),
      kissflowConfirmed: this.kissflowConfirmed,
      notes: this.notes,
      checkinLatitude: this.checkinLatitude,
      checkinLongitude: this.checkinLongitude,
      status: this.status,
      cancellationReason: this.cancellationReason,
    });
  }
  
  willDestroy() {
    super.willDestroy();
    clearTimeout(this._searchTimer);
  }
}