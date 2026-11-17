import { describe, expect, it } from 'vitest';
import { activityLabelKey, formatWhen } from '../../src/domain/activity';
import { hasMessage, t } from '../../src/i18n/en';

describe('activity labels', () => {
  it('maps known audit actions to plain-language catalog messages', () => {
    expect(t(activityLabelKey('business.created'))).toBe('Business created');
    expect(t(activityLabelKey('business.updated'))).toBe('Business details updated');
  });
  it('shows a neutral message for an action this version does not know, never the raw code', () => {
    const key = activityLabelKey('something.new');
    expect(hasMessage(key)).toBe(true);
    expect(t(key)).not.toContain('something');
  });
});

describe('formatWhen', () => {
  it('shows the time in the business timezone, not the device timezone', () => {
    // 22:30 UTC is 00:30 the next day in Malawi (UTC+2, no daylight saving)
    expect(formatWhen('2026-11-17T22:30:00Z', 'Africa/Blantyre', 'en')).toMatch(/18 Nov 2026/);
    expect(formatWhen('2026-11-17T22:30:00Z', 'UTC', 'en')).toMatch(/17 Nov 2026/);
  });
  it('falls back to a readable date for an invalid timezone', () => {
    expect(formatWhen('2026-11-17T10:00:00Z', 'Not/AZone', 'en')).toMatch(/2026/);
  });
});
