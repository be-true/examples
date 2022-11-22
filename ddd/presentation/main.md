---
marp: true
paginate: true
---
<!-- _paginate: false -->

# DDD на практическом примере:
## Расчет диаграммы Ганта

Автор: `Шапошников Евгений`
ЯП: `JavaScript`

---

#  Что такое DDD

> DDD - domain driven design

---

# В коде

```javascript

export const addGantItem = async (params, { repoTask, repoGant, repoPPR, transaction }) => {
    const item = PlanItem.create(params);
    let gant,
        pprs;
    
    if (params.dependencies) {
        gant = await repoGant.restore(params.plan_id);
        gant.addDependencies(item, params.dependencies)
            .calcPositions()
            .calcCriticalPath()
            .calcConflicts();

        const changedItemsIds = gant.getChangedPositionsIds();
        pprs = await repoPPR.restoreForGantItems(changedItemsIds);
        for (const ppr of pprs) {
            const change = gant.getChangeItemById(ppr.plan_item_id);
            ppr.applyPositionChange(change);
        }
    }

    await repoTask.persist(task);
    await repoGant.persist(gant);
    await repoPPR.persist(pprs);
}
```