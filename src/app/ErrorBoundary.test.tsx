import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';

function Broken(): never { throw new Error('test'); }

describe('ErrorBoundary', () => {
  it('показывает восстановление после ошибки интерфейса', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Broken /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось показать лабораторию');
    expect(screen.getByRole('button', { name: 'Обновить страницу' })).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
