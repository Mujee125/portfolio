import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

function themeRadios() {
  return screen.getAllByRole('radio') as HTMLInputElement[];
}

describe('ThemeToggle', () => {
  it('offers system, light and dark as an accessible radio group', () => {
    render(<ThemeToggle initialTheme="system" />);
    expect(screen.getByRole('group', { name: 'Colour theme' })).toBeInTheDocument();
    expect(themeRadios().map((radio) => radio.value)).toEqual(['system', 'light', 'dark']);
    expect(screen.getByRole('radio', { name: 'System theme' })).toBeChecked();
  });

  it('applies the choice to the document and persists it in a cookie', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initialTheme="system" />);

    await user.click(screen.getByRole('radio', { name: 'Dark theme' }));

    expect(screen.getByRole('radio', { name: 'Dark theme' })).toBeChecked();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.cookie).toContain('theme=dark');
  });

  it('removes the attribute for "system" so the OS preference wins', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initialTheme="dark" />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await user.click(screen.getByRole('radio', { name: 'System theme' }));

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.cookie).toContain('theme=system');
  });

  it('honours a stored preference on first render (no flash of the wrong theme)', () => {
    render(<ThemeToggle initialTheme="light" />);
    expect(screen.getByRole('radio', { name: 'Light theme' })).toBeChecked();
  });

  it('is operable from the keyboard', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initialTheme="system" />);

    await user.tab();
    expect(themeRadios()[0]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Light theme' })).toBeChecked();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
