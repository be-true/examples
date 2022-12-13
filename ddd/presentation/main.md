---
marp: true
paginate: true
---
<!-- _paginate: false -->

# DDD на практическом примере:
## Расчет диаграммы Ганта

Автор: `Шапошников Евгений`
ЯП: `JavaScript`
Компания: `lad24.ru`

---

# Про что поговорим:

- DDD трилемма
- Что такое DDD
- Примеры кода и реализаций
- Проблемы DDD и их оптимизации

---

# DDD трилемма

![width:800](images/ddd_trilema.png)
> Взято из доклада Владимира Хорикова "Domain-driven design: Самое важное"
- CAP теорема - аналог, только для баз данных

---
#  Что такое DDD?

**DDD** - domain driven design
Domain - предметная область

![bg right w:90%](images/onion.png)

---

# Стратегическое проектирование (управление проектом)

- Разделение на ограниченные контексты
- Формирование единого языка для контекста
- Выделение сценариев

`Event Storming` - инструмент для совместного достижения этих пунктов


---

# Тактическое проектирование (ООП)

Основные сущности:
- `Агрегат`
    - Часть модели с бизнес логикой
- `Репозиторий`
    - Слой работы с базой данных
- `Сервис`
    - Склеивающий код, в котором взаимодействуют агрегаты
---

# График Ганта

## Введение в предметную область (ограниченный контекст)

---

![Гант](images/gant.png)

---

# Работа

## хранит данные:

- Заголовок, описание...
- Время: `начала`, `конца`
- Ресурсы: `объем`, сколько выполнено
- Список `связей` к предыдущему элементу
- Исполнители
- ...

---

# ППР (посуточное планирование работ)

![ППР width:800px](images/ppr.png)

---

#  Единый язык

| RUS                                      | ENG             |
|------------------------------------------|-----------------|
| График                                   | plan            |
| Элемент графика (работа)                 | plan_item       |
| Зависимость между элементами (стрелочки) | deps            |
| ППР                                      | ppr             |
| Начало выполнения работы                 | start_time      |
| Окончание выполнения работы              | end_time        |

---

# Сценарий:

Пользователь изменил:
- длительность элемента на графике `i2` 
- описание  работы

Результат:
- Информация о работе `i2` должна измениться
- Зависимые от `i2` работы должны сдвинуться
- ППР измененных задач должны быть пересчитаны


---

![Гант](images/gant_after_change.png)

---

# Что мы сейчас сделали:
- Описали ограниченный контекст
- Выделили единый язык
- Описали сценарий

---

# Перейдем к тактической части DDD


## Список агрегатов

- `Элемент графика` (работа)
    - Все поля, которые можно редактировать в работе
- `График Ганта` 
    - Часть информации из работы, такие как `start_time`, `end_time` и `type`
    - Список всех связей
- `ППР`
    - Распределение по дням для каждой работы

---

# Сценарий в коде сервиса

```javascript
export const changePositionGantItem = async (params, { repoTask, repoGant, repoPPR }) => {
    const item = await repoPlanItem.restoreOrFail(params.plan_item_id);
    item.update(params);
    
    let gant, pprs;
    if (item.hasChanges('time_range', 'dependencies')) {
        gant = await repoGant.restore(params.plan_id);
        gant.changePositionForItem(item.plan_item_id, item.getPosition());

        const changedItemsIds = gant.getChangedPositionsIds();
        pprs = await repoPPR.restoreByGantItems(changedItemsIds);
        for (const ppr of pprs) {
            ppr.applyPositionChange(gant.getChangeItemById(ppr.plan_item_id));
        }
    }

    await repoTask.persist(task);
    await repoGant.persist(gant);
    await repoPPR.persist(pprs);
}
```

---

# Как написать агрегат. Подготовка


```javascript

class Gant extends BaseAggregate {
    ...
    constructor(items, deps) {
        this.items = items;
        this.deps = deps;
        this.index();
    }

    private index() {
        this.mapItemIdToItem = toMap(this.items, 'plan_item_id'); // (1)
        this.mapItemIdToSuccIds = toMapGroup(this.items, 'pred_id'); // (2)
    }
}
```
---

# Как написать агрегат. Бизнес логика


```javascript

class Gant extends BaseAggregate {
    ...

    changePositionForItem(plan_item_id, position) {
        if (this.setPositionForItem(plan_item_id, position)) {
            this.calcPositions();
        }
    }

    private setPositionForItem(plan_item_id, position) {
        const item = this.mapItemIdToItem[plan_item_id];
        if (!item) throw new Error(`Гант не содержит элемент с указанным ID`);
        if (position.start > position.end) throw new Error(`Начало интервала не может быть ...`);

        if (item.start !== position.start || item.end !== position.end) {
            item.start = position.start;
            item.end = position.end;
            this.addChange('item', item.plan_item_id, 'update', ['start', 'end']});
            return true;
        } else {
            return false;
        }
    }
}
```

---
# Как написать агрегат. Расчет смещения


```javascript

class Gant extends BaseAggregate {
    ...

    private calcPositions() {
        for (const item of walkGant(this.items, this.deps)) {
            const position = this.getNewPositionForItem(item);
            this.setPositionForItem(item.plan_item_id, position);
        }
    }
    ...
}
```
---
# Как написать агрегат. Регистрация изменений


```javascript

class BaseAggregate {
    ...
    changes = new Map();

    addChange(source, id, action, columns) {
        if (!this.changes.has(id)) {
            this.changes.set(id, {
                source,
                action,
                columns
            })
        } else {
            // логика по объединению изменений
        }
    }
}
```

---
# Как написать агрегат. Получение изменений


```javascript

class BaseAggregate {
    ...
    changes = new Map();

    getChanges(batch = 100) {
        const changes = [];
        for (const [id, { source, action }] of Object.entries(this.changes)) {
            const params = this.getChangedParams(id);
            changes.push({ source, action, params })
        }
        return toBatch(changes, batch);
    }
}
```

---
# Как написать репозиторий

```javascript

class GantRepository {
    ...
    async restore(plan_id) {
        const items = await this.findItemsByPlanId(plan_id);
        const deps = await this.findDepsByPlanId(plan_id);
        return new Gant(items, deps);
    }

    async persist(gant) {
        return this.manager.transaction(mng => {
            for (const batch of gant.getChanges({ batch: 100 })) {
                const queries = batch.map(makeSqlFromChange);
                await mng.query(queries);
            }
        });
    }
    ...
}
```

---

# Как написать репозиторий

- Чтение выполняется напрямую из базы
- Можно срезать углы и выполнить бизнес логику через `SQL`

```javascript

class GantRepository {
    ...
    async findList(filter) { ... }
    async findOne(id) { ... }
    async hasInDataRange(id) { ... }
    async cloneToVersion(id, version) { ... }
    ...
}
```

---
# Пример **Unit** теста. Тест кейс

![width:700](images/unit_test.png)

---
# Пример **Unit** теста. Реализация

```javascript
describe('GantItem.calcPosition() несколько связей', () => {
  it('Для i3 берем окончание от i1, так как она дает "худшее" время', async () => {
    // Восстанавливаем состояние
    const i1 = ensureItem({ id: 'i1', start_time: 0, end_time: 5});
    const i2 = ensureItem({ id: 'i2', start_time: 0, end_time: 2});
    const i3 = ensureItem({ id: 'i3', start_time: 0, end_time: 5});
    i1.setDeps(i3, EDependencyType.FS);
    i2.setDeps(i3, EDependencyType.FS);

    // Выполняем целевое действие 
    i3.calcPosition();

    // Проверяем результат
    const change = i3.getChange();
    expect(change.action).toEqual('update');
    expect(change.params).toEqual({ start_time: 5, end_time: 10 });
  });
});
```

---

# Пример **Unit** теста. Функция `ensureItem`

```javascript
export const ensureItem = (data: Partial<EnsureItemOptions>): GantItem {
  const defaultParams = {
    id: data.id ?? guId(),
    parent_id: undefined,
    start_time: new Date(),
    end_time: new Date(),
    type: EItemType.COMMON,
  };
  const params = {
    ...defaultParams
    ...data, 
  };

  return new GantItem(params);
};
```

---

# Плюсы для тестирования

![Пирамида тестов](./images/piramid_of_tests.jpeg)

- ? Минус - нужно править много тестов вместе с кодом


---

# Плюсы в разработке
- Возможность решать более сложные задачи
- UseCase-ы читаются как текст
- Параллельная разработка. Режим трех вкладок
- Фреймворк и БД подождут
- Контроль транзакций
- EventBased архитектура
---

# Минусы и оптимизации
---

# Минус 1. Избыточное использование памяти

Большой агрегат в котором описана логика работы: 
- Элемента графика
- Гант,
- ППР
```javascript
plan = await repoPlan.restore(params.plan_id);
plan.changePositionForItem(item, params.dependencies);
```

`Решение:` 
1. Грузить только нужные поля
2. Разбивать большие агрегаты на маленькие исходя из `use case`-ов
3. Сохранять через итератор порциями, т. к. SQL занимает много памяти
4. Выбирать другие грани из DDD трилеммы

---


# Минус 2. Нагрузка на процессор

```javascript
class Gant extends BaseAggregate {
    constructor() {
        this.index();
    }
    
    index() {
        this.mapItemIdToItem = toMap(this.items, 'plan_item_id'); // (1)
    }   
    
    getItemById(id) {
        return this.mapItemIdToItem[id]; // Сложность O(1) вместо O(<=n)
    }
}
```

`Решение:` 
1. Использовать `key`, `value` для ускорения поиска
2. Связывание компонентов по ссылкам

---


# Минус 3. Блокировка event loop-а

```javascript
class Gant extends BaseAggregate {
    private async calcPositions() {
        for await (const item of walkGant(this.items, this.deps, 100)) {
            const position = this.getNewPositionForItem(item);
            this.setPositionForItem(item.plan_item_id, position);
        }
    }
}
```

`Решение:` Обрабатывать частями и отпускать `event loop` или в фоне

```javascript
async function walkGant(items, deps, batchCount) {
    ...
    if (count++ >= batchCount) {
        count = 0;
        await new Promise((res, rej) => setImmediate(res)) // 0 задержка
    }
}
```

---


# Минус 4. Трудоемкость

В чем основная задача при таком подходе:

1. **Регистрация изменений** и получение их списком

    `Решение:` реализовать в базовом классе `BaseAggregate` или библиотека

2. **Сохранение** потока событий в базе данных

    `Решение:` вынести логику в базовый класс `BaseRepository`

---


# Минус 5. Рейсы

После загрузки агрегата его может изменить другой процесс
```javascript
const gant = await repoGant.restore(params.plan_id);
await gant.changePositionForItem(item.plan_item_id, item.getPosition());
await repoGant.persist(gant);
```
`Решение:`
1. Мягкая блокировка по версии. Версия должна быть больше на +1 
2. Жесткая блокировка по сессии пользователя

---
# Вопросы?