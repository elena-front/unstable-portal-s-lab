import styles from './App.module.css';

export function App() {
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>MOX · тестовое задание</p>
        <h1>Лаборатория нестабильных порталов</h1>
        <p className={styles.description}>
          Репозиторий подготовлен. Следующий этап — предметная модель и расчёт
          риска согласно плану разработки.
        </p>
      </section>
    </main>
  );
}

