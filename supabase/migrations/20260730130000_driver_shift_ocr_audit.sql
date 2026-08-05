-- Add OCR audit fields to the existing Driver App odometer shift workflow.

alter table public.driver_shifts
  add column if not exists start_ocr_reading text null,
  add column if not exists start_ocr_confidence numeric null,
  add column if not exists start_ocr_status text null,
  add column if not exists start_ocr_provider text null,
  add column if not exists start_verified_at timestamptz null,
  add column if not exists end_ocr_reading text null,
  add column if not exists end_ocr_confidence numeric null,
  add column if not exists end_ocr_status text null,
  add column if not exists end_ocr_provider text null,
  add column if not exists end_verified_at timestamptz null;

alter table public.driver_shifts
  drop constraint if exists driver_shifts_start_ocr_status_check,
  add constraint driver_shifts_start_ocr_status_check
    check (start_ocr_status is null or start_ocr_status in ('verified', 'mismatch', 'unreadable')),
  drop constraint if exists driver_shifts_end_ocr_status_check,
  add constraint driver_shifts_end_ocr_status_check
    check (end_ocr_status is null or end_ocr_status in ('verified', 'mismatch', 'unreadable')),
  drop constraint if exists driver_shifts_start_verified_shape_check,
  add constraint driver_shifts_start_verified_shape_check
    check (
      start_ocr_status is null
      or (
        start_ocr_status = 'verified'
        and start_ocr_reading is not null
        and start_ocr_provider is not null
        and start_verified_at is not null
      )
    ),
  drop constraint if exists driver_shifts_end_verified_shape_check,
  add constraint driver_shifts_end_verified_shape_check
    check (
      end_ocr_status is null
      or (
        end_ocr_status = 'verified'
        and end_ocr_reading is not null
        and end_ocr_provider is not null
        and end_verified_at is not null
      )
    );

revoke execute on function public.start_driver_shift(bigint, text, timestamptz)
  from authenticated;
revoke execute on function public.end_driver_shift(bigint, text, timestamptz)
  from authenticated;
grant insert on public.activity_logs to service_role;
