import type { GameBalanceConfig } from '../config/gameBalance';
import { energyAfterTransit, findReliableReserve } from './expeditions';
import { estimatedResearchSeconds } from './research';
import { employeesInWorld, isStabilizationEligible, isVeryImportantPortal } from './selectors';
import type { DomainState, Portal } from './types';

export interface ActionAvailability {
  send: string | null;
  returnGroup: string | null;
  stabilize: string | null;
  observe: string | null;
  close: string | null;
}

export function actionAvailability(
  state: DomainState,
  portal: Portal,
  groupSize: number,
  config: GameBalanceConfig,
): ActionAvailability {
  const world = state.worlds.find((item) => item.id === portal.destinationWorldId);
  const free = state.employees.filter((employee) => employee.location === 'lab').length;
  const inWorld = employeesInWorld(state, portal.destinationWorldId).length;
  const active = state.cycle.status === 'running';
  const unavailable = !active ? 'Партия завершена.' : null;
  const notActive = portal.lifecycle !== 'active' ? 'Портал не работает.' : null;
  const after = energyAfterTransit(portal, groupSize, config);
  const reserve = world && groupSize > 0 && after === 0
    ? findReliableReserve(state, portal, groupSize, estimatedResearchSeconds(world, inWorld + groupSize), config)
    : null;
  const observerAssigned = state.employees.some((employee) => employee.role.type === 'observer');

  return {
    send: unavailable ?? notActive ??
      (portal.riskStatus === 'critical' ? 'Отправка в критичный портал запрещена.' : null) ??
      (world?.researchStatus === 'explored' ? 'Мир уже исследован. Новая экспедиция не нужна.' : null) ??
      (groupSize < 1 || groupSize > config.maxExpeditionSize ? `Выберите от 1 до ${config.maxExpeditionSize} сотрудников.` : null) ??
      (free < groupSize ? 'В лаборатории недостаточно сотрудников.' : null) ??
      (after === 0 && !reserve ? 'Переход исчерпает портал; надёжного маршрута возвращения нет.' : null),
    returnGroup: unavailable ?? notActive ??
      (inWorld === 0 ? 'В этом мире нет сотрудников для возвращения.' : null),
    stabilize: unavailable ?? notActive ??
      (!isStabilizationEligible(state, portal) ? 'Стабилизация доступна единственному стабильному маршруту или важному опасному/критичному порталу.' : null) ??
      (portal.stabilizationBonus >= config.maxStabilizationBonus ? 'Достигнут максимальный бонус стабилизации.' : null) ??
      (state.cycle.stabilizationAttemptsUsed >= config.stabilizationAttempts ? 'Попытки стабилизации закончились.' : null),
    observe: unavailable ?? notActive ??
      (portal.riskStatus !== 'dangerous' ? portal.riskStatus === 'critical' ? 'Наблюдателя нельзя отправить в критичный портал.' : 'Наблюдатель доступен только опасному порталу.' : null) ??
      (!isVeryImportantPortal(state, portal) ? 'Наблюдатель нужен только единственному маршруту к миру с сотрудниками.' : null) ??
      (observerAssigned ? 'Наблюдатель уже назначен другому порталу.' : null) ??
      (free === 0 ? 'В лаборатории нет свободных сотрудников.' : null) ??
      (energyAfterTransit(portal, 1, config) === 0 ? 'Переход наблюдателя исчерпает портал.' : null),
    close: unavailable ??
      (portal.lifecycle === 'closed' ? 'Портал уже закрыт.' : null) ??
      (portal.lifecycle === 'active' && world?.researchStatus !== 'explored' && portal.riskStatus !== 'critical' ? 'Неисследованный мир: закрытие доступно только критичному порталу.' : null) ??
      (portal.lifecycle === 'active' && world?.researchStatus !== 'explored' && !findReliableReserve(state, portal, inWorld, 0, config) ? 'Для закрытия критичного портала нужен другой надёжный маршрут в этот мир.' : null) ??
      (portal.lifecycle === 'active' && inWorld > 0 && !findReliableReserve(state, portal, inWorld, 0, config) ? 'Закрытие оставит сотрудников без надёжного маршрута.' : null),
  };
}
