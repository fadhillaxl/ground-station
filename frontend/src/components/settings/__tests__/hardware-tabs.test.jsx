import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ThemeProvider } from '@mui/material/styles';
import { setupTheme } from '../../../theme';

vi.mock('../../hardware/rotator-table.jsx', () => ({
    default: () => <div data-testid="rotator-table">Rotator Table Content</div>,
}));

vi.mock('../../hardware/camera-table.jsx', () => ({
    default: () => <div data-testid="camera-table">Camera Table Content</div>,
}));

vi.mock('../../hardware/rig-table.jsx', () => ({
    default: () => <div data-testid="rig-table">Rig Table Content</div>,
}));

vi.mock('../../hardware/sdr-table.jsx', () => ({
    default: () => <div data-testid="sdr-table">SDR Table Content</div>,
}));

vi.mock('react-i18next', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useTranslation: () => ({
            t: (key, options) => options?.defaultValue ?? key,
        }),
    };
});

import { AdminSystemHardwarePage } from '../settings.jsx';

function renderHardwarePage(initialPath) {
    const theme = setupTheme('dark');
    return render(
        <ThemeProvider theme={theme}>
            <MemoryRouter initialEntries={[initialPath]}>
                <Routes>
                    <Route path="/admin/system/hardware/*" element={<AdminSystemHardwarePage />} />
                </Routes>
            </MemoryRouter>
        </ThemeProvider>
    );
}

describe('AdminSystemHardwareTabs route resolution', () => {
    it('renders rig table when navigating to /admin/system/hardware/rigs', () => {
        renderHardwarePage('/admin/system/hardware/rigs');

        expect(screen.getByTestId('rig-table')).toBeInTheDocument();
        expect(screen.queryByTestId('sdr-table')).not.toBeInTheDocument();
        const rigsTab = screen.getByRole('tab', { name: 'tabs.rigs' });
        expect(rigsTab).toHaveAttribute('aria-selected', 'true');
    });

    it('renders SDR table when navigating to /admin/system/hardware/sdrs', () => {
        renderHardwarePage('/admin/system/hardware/sdrs');

        expect(screen.getByTestId('sdr-table')).toBeInTheDocument();
        const sdrsTab = screen.getByRole('tab', { name: 'tabs.sdrs' });
        expect(sdrsTab).toHaveAttribute('aria-selected', 'true');
    });

    it('renders rotators table when navigating to /admin/system/hardware/rotators', () => {
        renderHardwarePage('/admin/system/hardware/rotators');

        expect(screen.getByTestId('rotator-table')).toBeInTheDocument();
        const rotatorsTab = screen.getByRole('tab', { name: 'tabs.rotators' });
        expect(rotatorsTab).toHaveAttribute('aria-selected', 'true');
    });

    it('renders cameras table when navigating to /admin/system/hardware/cameras', () => {
        renderHardwarePage('/admin/system/hardware/cameras');

        expect(screen.getByTestId('camera-table')).toBeInTheDocument();
        const camerasTab = screen.getByRole('tab', { name: 'Cameras' });
        expect(camerasTab).toHaveAttribute('aria-selected', 'true');
    });
});
