-- This is configuration only. PinPad charges remain disabled until the
-- server-side payment flow and its verified postback webhook are enabled.
alter table public.business_settings
  add column if not exists clip_pinpad_reader_serial text,
  add column if not exists clip_pinpad_setup_status text not null default 'not_started';

alter table public.business_settings
  drop constraint if exists business_settings_clip_pinpad_setup_status_check;

alter table public.business_settings
  add constraint business_settings_clip_pinpad_setup_status_check
  check (clip_pinpad_setup_status in ('not_started', 'requested', 'app_installed', 'ready_to_test'));
