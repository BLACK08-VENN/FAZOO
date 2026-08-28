-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00015 — completion photo types.
--
-- A log may only be completed (checkout) after the BA captures a fresh
-- stock-on-shelf photo and a uniform selfie that prove the visit's outcome.
-- New photo_type values distinguish these checkout shots from the check-in
-- photos captured in `ba_checkin`.
-- ═══════════════════════════════════════════════════════════════════════════

alter type public.photo_type add value if not exists 'checkout_stock_shelf';
alter type public.photo_type add value if not exists 'checkout_uniform_selfie';