import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import NewTripWizard from '../src/components/NewTripWizard.jsx';

describe('NewTripWizard', () => {
  it('keeps answers while moving through the wizard and submits calculated nights', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewTripWizard onCancel={vi.fn()} onCreate={onCreate} busy={false} error={null} />);

    const next = screen.getByRole('button', { name: 'Suivant' });
    expect(next).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Corée du Sud, Sicile, Nord du Portugal…'), 'Sicile');
    await user.click(next);
    const [startDate, endDate] = document.querySelectorAll('input[type="date"]');
    fireEvent.change(startDate, { target: { value: '2026-09-24' } });
    fireEvent.change(endDate, { target: { value: '2026-09-27' } });
    expect(screen.getByText('3 nuits')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    await user.type(screen.getByPlaceholderText('Séoul, Busan, Jeju'), 'Palermo, Catane');
    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    await user.click(screen.getByRole('button', { name: 'Gastronomie' }));
    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    await user.click(screen.getByRole('button', { name: 'Créer le carnet' }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      destination: 'Sicile', cities: 'Palermo, Catane', styles: ['Gastronomie'], nights: 3,
    }));
  });

  it('rejects an end date before the start date', () => {
    render(<NewTripWizard onCancel={vi.fn()} onCreate={vi.fn()} busy={false} error={null} />);
    fireEvent.change(screen.getByPlaceholderText('Corée du Sud, Sicile, Nord du Portugal…'), { target: { value: 'Sicile' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    const [startDate, endDate] = document.querySelectorAll('input[type="date"]');
    fireEvent.change(startDate, { target: { value: '2026-10-02' } });
    fireEvent.change(endDate, { target: { value: '2026-10-01' } });
    expect(screen.getByText('Le retour doit être après le départ.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled();
  });
});
