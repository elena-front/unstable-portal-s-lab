import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('показывает название выбранного продукта', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        name: 'Лаборатория нестабильных порталов',
      }),
    ).toBeInTheDocument();
  });
});
