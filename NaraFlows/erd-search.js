'use strict';
(() => {
  const normalize = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const compare = new Intl.Collator('es', {sensitivity: 'base', numeric: true}).compare;
  const pageSize = 40;

  function relevance(name, query) {
    if (name === query) return 0;
    if (name.startsWith(query)) return 1;
    return name.includes(query) ? 2 : Infinity;
  }

  function createIndex(sheets) {
    const entries = [];
    for (const sheet of sheets) {
      for (const table of sheet.tables) {
        const location = {sheetId: sheet.id, sheetName: sheet.name, tableId: table.id, tableName: table.name};
        entries.push({
          key: JSON.stringify([table.id]),
          result: {...location, name: table.name},
          names: [normalize(table.name)]
        });
        for (const field of table.fields) {
          const names = [normalize(field.name)];
          if (field.label) names.push(normalize(field.label));
          entries.push({
            key: JSON.stringify([table.id, field.id]),
            result: {...location, fieldId: field.id, name: field.label ?? field.name, physicalName: field.name},
            names
          });
        }
      }
    }

    return value => {
      const query = normalize(value);
      if (!query) return [];
      const best = new Map();
      for (const {key, result, names} of entries) {
        const score = Math.min(relevance(names[0], query), relevance(names[1] ?? '', query));
        // The same IDs can appear on several sheets. For ties, use the first occurrence.
        if (score < (best.get(key)?.score ?? Infinity)) best.set(key, {result, score});
      }
      return [...best.values()].sort((a, b) =>
        a.score - b.score ||
        Number(!!a.result.fieldId) - Number(!!b.result.fieldId) ||
        compare(a.result.name, b.result.name) ||
        compare(a.result.tableName, b.result.tableName) ||
        compare(a.result.sheetName, b.result.sheetName)
      ).map(({result}) => result);
    };
  }

  function mount(modeler) {
    const editor = modeler.get('naraER');
    const sheets = modeler.get('naraSheets');
    const events = modeler.get('eventBus');
    const get = id => document.getElementById(id);
    const canvas = get('erdCanvas');
    const toggle = get('erdSearchToggle');
    const panel = get('erdSearchPanel');
    const input = get('erdSearchInput');
    const status = get('erdSearchStatus');
    const list = get('erdSearchResults');
    const more = get('erdSearchMore');
    let find, unreadable, previousFocus;
    let results = [], active = -1;

    function rebuildIndex() {
      const models = [];
      unreadable = 0;
      for (const sheet of editor.list()) {
        try {
          models.push({...editor.read(sheet.id), name: sheet.name});
        } catch {
          unreadable++;
        }
      }
      find = createIndex(models);
    }

    function appendPage() {
      const start = list.children.length;
      const rows = results.slice(start, start + pageSize).map((result, offset) => {
        const i = start + offset;
        const row = document.createElement('li');
        row.id = 'erd-search-result-' + i;
        row.role = 'option';
        row.dataset.index = i;
        row.setAttribute('aria-selected', 'false');
        row.setAttribute('aria-posinset', i + 1);
        row.setAttribute('aria-setsize', results.length);
        const name = document.createElement('span');
        name.className = 'erd-search-name';
        name.textContent = result.name;
        row.append(name);
        if (result.physicalName && result.physicalName !== result.name) {
          const physical = document.createElement('span');
          physical.className = 'erd-search-physical';
          physical.textContent = result.physicalName;
          row.append(physical);
        }
        const context = document.createElement('span');
        context.className = 'erd-search-location';
        context.textContent = result.fieldId
          ? `Campo · ${result.tableName} · ${result.sheetName}`
          : `Tabla · ${result.sheetName}`;
        row.append(context);
        return row;
      });
      list.append(...rows);
      more.hidden = list.children.length === results.length;
    }

    function highlight(index) {
      if (index >= list.children.length) appendPage();
      list.children[active]?.setAttribute('aria-selected', 'false');
      active = index;
      const row = list.children[active];
      row.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', row.id);
      const bounds = row.getBoundingClientRect();
      const viewport = list.getBoundingClientRect();
      if (bounds.top < viewport.top) list.scrollTop += bounds.top - viewport.top;
      else if (bounds.bottom > viewport.bottom) list.scrollTop += bounds.bottom - viewport.bottom;
    }

    function renderResults() {
      const query = input.value.trim();
      if (query && !find) rebuildIndex();
      results = query ? find(query) : [];
      active = -1;
      list.replaceChildren();
      list.scrollTop = 0;
      list.hidden = !results.length;
      more.hidden = true;
      input.removeAttribute('aria-activedescendant');
      input.setAttribute('aria-expanded', String(!!results.length));
      if (!query) {
        status.textContent = '';
        return;
      }
      const count = results.length;
      const summary = count ? `${count} resultado${count === 1 ? '' : 's'}` : 'Sin coincidencias';
      status.textContent = unreadable
        ? `${summary}. Error de lectura en ${unreadable} ${unreadable === 1 ? 'hoja' : 'hojas'}.`
        : summary;
      if (count) highlight(0);
    }

    function open() {
      if (toggle.hidden || document.querySelector('dialog[open]')) return;
      if (window.NaraPropertyDraftPending?.()) {
        get('status').textContent = 'Termina la edición pendiente antes de buscar.';
        return;
      }
      if (panel.hidden) previousFocus = document.activeElement;
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      input.focus({preventScroll: true});
    }

    function close(focusTarget) {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      input.value = '';
      find = undefined;
      previousFocus = undefined;
      renderResults();
      if (focusTarget) {
        const visibleTarget = focusTarget.getClientRects().length ? focusTarget : canvas;
        visibleTarget.focus({preventScroll: true});
      }
    }

    function choose(index) {
      const result = results[index];
      if (!result) return;
      try {
        sheets.open(result.sheetId, result);
        close(toggle);
      } catch (error) {
        status.textContent = error.message;
      }
    }

    function syncVisibility() {
      toggle.hidden = !editor.active();
      if (toggle.hidden && !panel.hidden) close();
    }

    toggle.addEventListener('pointerdown', event => {
      // Keep focus on an unfinished cell until open() can check for a draft.
      if (event.button === 0) event.preventDefault();
    });
    toggle.addEventListener('click', () => panel.hidden ? open() : close(toggle));
    input.addEventListener('input', event => {
      if (!event.isComposing) renderResults();
    });
    input.addEventListener('compositionend', renderResults);
    input.addEventListener('keydown', event => {
      if (event.isComposing || !results.length) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        choose(active);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = active + (event.key === 'ArrowDown' ? 1 : -1);
        if (next >= 0 && next < results.length) highlight(next);
      }
    });
    list.addEventListener('mousedown', event => {
      if (event.target.closest('[role="option"]')) event.preventDefault();
    });
    list.addEventListener('click', event => {
      const row = event.target.closest('[role="option"]');
      if (row) choose(Number(row.dataset.index));
    });
    more.addEventListener('click', () => {
      const next = list.children.length;
      input.focus({preventScroll: true});
      highlight(next);
    });
    function dismissOutside(event) {
      if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) close();
    }
    document.addEventListener('focusin', dismissOutside);
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', event => {
      if (toggle.hidden || event.isComposing) return;
      if (event.key === 'Escape' && !panel.hidden) {
        event.preventDefault();
        event.stopPropagation();
        const restoreFocus = previousFocus !== document.body && previousFocus?.getClientRects().length;
        close(restoreFocus ? previousFocus : toggle);
      } else if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === 'b' && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        event.stopPropagation();
        open();
      }
    }, true);

    events.on('nara.sheet.changed', syncVisibility);
    events.on('import.parse.start', () => {
      toggle.hidden = true;
      close();
    });
    events.on('commandStack.changed', () => {
      find = undefined;
      if (!panel.hidden) renderResults();
    });
    syncVisibility();
  }

  globalThis.NaraERSearch = Object.freeze({createIndex, mount});
})();
