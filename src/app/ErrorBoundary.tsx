import { Component, type ErrorInfo, type ReactNode } from 'react';

import styles from './ErrorBoundary.module.css';

interface Props { children: ReactNode }
interface State { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Ошибка интерфейса порталов', error, info);
  }

  render() {
    if (this.state.failed) {
      return <main className={styles.fallback} role="alert"><h1>Не удалось показать лабораторию</h1><p>Произошла непредвиденная ошибка. Обновите страницу. Если она повторится, проверьте локальные данные браузера.</p><button onClick={() => window.location.reload()}>Обновить страницу</button></main>;
    }
    return this.props.children;
  }
}
