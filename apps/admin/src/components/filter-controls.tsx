'use client';

import { Select } from '@/components/ui/input';
import type { SelectHTMLAttributes } from 'react';

function submit(form: HTMLFormElement | null) {
  form?.requestSubmit();
}

/**
 * A filter <select> that applies itself the moment the value changes — no
 * separate "Apply" click. Used for the dropdown filters (range preset,
 * campaign, BA, store, attendance status) where every option is a complete,
 * valid filter state.
 */
export function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { onChange, ...rest } = props;
  return (
    <Select
      {...rest}
      onChange={(event) => {
        onChange?.(event);
        submit(event.currentTarget.form);
      }}
    />
  );
}

/**
 * Range preset select with the one special rule: picking "Last 7/30/90 days"
 * must win over any custom from/to dates left in the URL. It clears both date
 * inputs before submitting so `resolveRange()` honours the preset again.
 */
export function PresetSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { onChange, ...rest } = props;
  return (
    <Select
      {...rest}
      onChange={(event) => {
        onChange?.(event);
        const form = event.currentTarget.form;
        if (form && event.currentTarget.value !== 'custom') {
          const from = form.elements.namedItem('from');
          const to = form.elements.namedItem('to');
          if (from instanceof HTMLInputElement) from.value = '';
          if (to instanceof HTMLInputElement) to.value = '';
        }
        submit(form);
      }}
    />
  );
}
