import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalAppTour, APP_TOUR_STEPS, buildActiveDriveSteps } from '../GlobalAppTour.tsx';

describe('GlobalAppTour', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('defines tour steps covering navigation, telemetry, configuration, and action categories', () => {
    const categories = new Set(APP_TOUR_STEPS.map((s) => s.category));
    expect(categories.has('navigation')).toBe(true);
    expect(categories.has('telemetry')).toBe(true);
    expect(categories.has('configuration')).toBe(true);
    expect(categories.has('action')).toBe(true);
  });

  it('includes overview steps without selectors and filters DOM steps by visibility', () => {
    const steps = buildActiveDriveSteps(APP_TOUR_STEPS);
    // Without mounted DOM elements, only overview steps (without selector) are returned
    expect(steps.length).toBe(1);
    expect(steps[0].popover?.title).toContain('Selamat Datang');
  });

  it('shows the Training button on load, allows hiding it, and shows it again on fresh load', () => {
    const { unmount } = render(<GlobalAppTour />);

    const launchBtn = screen.getByLabelText('Training / Panduan Lengkap');
    const dismissBtn = screen.getByLabelText('Sembunyikan tombol Training');
    expect(launchBtn).toBeTruthy();
    expect(dismissBtn).toBeTruthy();

    // Clicking the dismiss button hides the Training button
    fireEvent.click(dismissBtn);
    expect(screen.queryByLabelText('Training / Panduan Lengkap')).toBeNull();

    // Simulating a page reload (unmount + fresh mount) brings the button back
    unmount();
    render(<GlobalAppTour />);
    expect(screen.getByLabelText('Training / Panduan Lengkap')).toBeTruthy();
  });
});
