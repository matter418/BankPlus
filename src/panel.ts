// Side-panel editor: create, rename and delete filters, and add or remove items in one, picking
// from the game's full item list.

import {
    BankFilter,
    copySpriteVars,
    isolateInput,
    itemCatalog,
    itemIcon,
    itemName,
    newFilterId,
    ICON_CSS,
} from "./filters";

const MAX_PICKER_RESULTS = 80;

export interface PanelHost {
    filters(): BankFilter[];
    /** Called after any change so the bank header's drop-down and view can follow. */
    onFiltersChanged(): void;
}

export class FilterPanel {
    readonly root: HTMLElement;
    private editing: BankFilter | null = null;
    private pendingDelete: string | null = null;
    private pickerQuery = "";

    private listEl!: HTMLElement;
    private editorEl!: HTMLElement;

    constructor(private readonly host: PanelHost) {
        this.root = document.createElement("div");
        this.root.className = "hsplus-bankplus-panel";
        this.root.innerHTML = `
<div class="hsplus-bankplus-section">
    <div class="hsplus-bankplus-heading">Filters</div>
    <div class="hsplus-bankplus-row">
        <input class="hsplus-bankplus-input" data-role="new-name" type="text" placeholder="New filter name" autocomplete="off" spellcheck="false">
        <button class="hsplus-bankplus-button" data-role="new">Add</button>
    </div>
    <div class="hsplus-bankplus-list" data-role="list"></div>
</div>
<div class="hsplus-bankplus-section" data-role="editor"></div>
`;
        this.listEl = this.root.querySelector('[data-role="list"]')!;
        this.editorEl = this.root.querySelector('[data-role="editor"]')!;
        const newName = this.root.querySelector<HTMLInputElement>('[data-role="new-name"]')!;
        const newBtn = this.root.querySelector<HTMLButtonElement>('[data-role="new"]')!;
        isolateInput(newName);
        isolateInput(newBtn);
        const create = () => {
            const name = newName.value.trim();
            if (!name) return;
            const f: BankFilter = { id: newFilterId(), name, items: [] };
            this.host.filters().push(f);
            newName.value = "";
            this.editing = f;
            this.changed();
        };
        newBtn.addEventListener("click", create);
        newName.addEventListener("keydown", e => {
            if (e.key === "Enter") create();
        });
        this.render();
    }

    /** The panel is shown: refresh sprite variables (they are set after assets load) and redraw. */
    shown(): void {
        copySpriteVars(this.root);
        this.render();
    }

    private changed(): void {
        this.host.onFiltersChanged();
        this.render();
    }

    render(): void {
        this.renderList();
        this.renderEditor();
    }

    private renderList(): void {
        const filters = this.host.filters();
        if (this.editing && !filters.includes(this.editing)) this.editing = null;
        this.listEl.innerHTML = "";
        if (!filters.length) {
            const empty = document.createElement("div");
            empty.className = "hsplus-bankplus-muted";
            empty.textContent = "No filters yet. Name one above and add it.";
            this.listEl.appendChild(empty);
            return;
        }
        for (const f of filters) {
            const row = document.createElement("div");
            row.className = "hsplus-bankplus-filter" + (f === this.editing ? " is-selected" : "");
            const name = document.createElement("span");
            name.className = "hsplus-bankplus-filter__name";
            name.textContent = `${f.name} (${f.items.length})`;
            name.title = f === this.editing ? "Collapse" : "Edit this filter";
            row.appendChild(name);
            const del = document.createElement("button");
            del.className = "hsplus-bankplus-button hsplus-bankplus-button--small" + (this.pendingDelete === f.id ? " is-danger" : "");
            del.textContent = this.pendingDelete === f.id ? "Delete?" : "×";
            del.title = this.pendingDelete === f.id ? "Click again to delete" : "Delete filter";
            row.appendChild(del);
            isolateInput(row);
            name.addEventListener("click", () => {
                // Clicking the open filter again collapses it.
                this.editing = this.editing === f ? null : f;
                this.pendingDelete = null;
                this.render();
            });
            del.addEventListener("click", () => {
                if (this.pendingDelete !== f.id) {
                    this.pendingDelete = f.id;
                    this.render();
                    return;
                }
                const i = filters.indexOf(f);
                if (i >= 0) filters.splice(i, 1);
                this.pendingDelete = null;
                if (this.editing === f) this.editing = null;
                this.changed();
            });
            this.listEl.appendChild(row);
        }
    }

    private renderEditor(): void {
        const f = this.editing;
        this.editorEl.innerHTML = "";
        if (!f) {
            const hint = document.createElement("div");
            hint.className = "hsplus-bankplus-muted";
            hint.textContent = "Select a filter to edit its items. In the bank, pick a filter from the drop-down and press + to add items by clicking them.";
            this.editorEl.appendChild(hint);
            return;
        }

        // Name (rename in place).
        const nameRow = document.createElement("div");
        nameRow.className = "hsplus-bankplus-row";
        const nameInput = document.createElement("input");
        nameInput.className = "hsplus-bankplus-input";
        nameInput.type = "text";
        nameInput.value = f.name;
        nameInput.autocomplete = "off";
        nameInput.spellcheck = false;
        nameInput.title = "Rename";
        isolateInput(nameInput);
        const commitName = () => {
            const v = nameInput.value.trim();
            if (v && v !== f.name) {
                f.name = v;
                this.changed();
            } else {
                nameInput.value = f.name;
            }
        };
        nameInput.addEventListener("change", commitName);
        nameInput.addEventListener("keydown", e => {
            if (e.key === "Enter") nameInput.blur();
        });
        nameRow.appendChild(nameInput);
        this.editorEl.appendChild(nameRow);

        // Members.
        const membersHead = document.createElement("div");
        membersHead.className = "hsplus-bankplus-heading";
        membersHead.textContent = `Items in this filter (${f.items.length})`;
        this.editorEl.appendChild(membersHead);
        const members = document.createElement("div");
        members.className = "hsplus-bankplus-grid";
        if (!f.items.length) {
            const empty = document.createElement("div");
            empty.className = "hsplus-bankplus-muted";
            empty.textContent = "Nothing yet. Search below to add items.";
            members.appendChild(empty);
        }
        // In the order they were added, so the newest is always at the end.
        for (const id of f.items) {
            const tile = document.createElement("div");
            tile.className = "hsplus-bankplus-tile";
            tile.title = `${itemName(id)} — click to remove`;
            tile.appendChild(itemIcon(id, 2));
            isolateInput(tile);
            tile.addEventListener("click", () => {
                const i = f.items.indexOf(id);
                if (i >= 0) f.items.splice(i, 1);
                this.changed();
            });
            members.appendChild(tile);
        }
        this.editorEl.appendChild(members);

        // Picker over every item in the game.
        const pickHead = document.createElement("div");
        pickHead.className = "hsplus-bankplus-heading";
        pickHead.textContent = "Add items";
        this.editorEl.appendChild(pickHead);
        const search = document.createElement("input");
        search.className = "hsplus-bankplus-input";
        search.type = "text";
        search.placeholder = "Search all items…";
        search.autocomplete = "off";
        search.spellcheck = false;
        search.value = this.pickerQuery;
        search.dataset.role = "picker";
        isolateInput(search);
        this.editorEl.appendChild(search);
        const results = document.createElement("div");
        results.className = "hsplus-bankplus-results";
        this.editorEl.appendChild(results);

        const renderResults = () => {
            results.innerHTML = "";
            const q = this.pickerQuery.trim().toLowerCase();
            if (!q) {
                const hint = document.createElement("div");
                hint.className = "hsplus-bankplus-muted";
                hint.textContent = "Type part of an item name.";
                results.appendChild(hint);
                return;
            }
            const have = new Set(f.items);
            const matches = itemCatalog().filter(it => it.lower.includes(q));
            for (const it of matches.slice(0, MAX_PICKER_RESULTS)) {
                const row = document.createElement("div");
                row.className = "hsplus-bankplus-result" + (have.has(it.id) ? " is-added" : "");
                row.appendChild(itemIcon(it.id, 1.5));
                const label = document.createElement("span");
                label.className = "hsplus-bankplus-result__name";
                label.textContent = it.name;
                row.appendChild(label);
                const mark = document.createElement("span");
                mark.className = "hsplus-bankplus-result__mark";
                mark.textContent = have.has(it.id) ? "✓" : "+";
                row.appendChild(mark);
                isolateInput(row);
                row.addEventListener("click", () => {
                    const i = f.items.indexOf(it.id);
                    if (i >= 0) f.items.splice(i, 1);
                    else f.items.push(it.id);
                    this.host.onFiltersChanged();
                    this.renderList();
                    // Redraw the members grid without losing the picker's focus or scroll.
                    this.renderEditorKeepingPicker(search);
                });
                results.appendChild(row);
            }
            if (matches.length > MAX_PICKER_RESULTS) {
                const more = document.createElement("div");
                more.className = "hsplus-bankplus-muted";
                more.textContent = `${matches.length - MAX_PICKER_RESULTS} more — keep typing to narrow it down.`;
                results.appendChild(more);
            }
            if (!matches.length) {
                const none = document.createElement("div");
                none.className = "hsplus-bankplus-muted";
                none.textContent = "No items match.";
                results.appendChild(none);
            }
        };
        search.addEventListener("input", () => {
            this.pickerQuery = search.value;
            renderResults();
        });
        renderResults();
    }

    /** Full redraw of the editor, then put the caret back in the picker where it was. */
    private renderEditorKeepingPicker(oldSearch: HTMLInputElement): void {
        const pos = oldSearch.selectionStart ?? oldSearch.value.length;
        const scroll = this.root.scrollTop;
        this.renderEditor();
        const search = this.editorEl.querySelector<HTMLInputElement>('[data-role="picker"]');
        if (search) {
            search.focus();
            search.setSelectionRange(pos, pos);
        }
        this.root.scrollTop = scroll;
    }
}

export const PANEL_CSS = `
.hsplus-bankplus-panel {
    padding: 8px 10px 16px;
    font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px;
    color: var(--theme-text-primary, #e6e6e6);
    box-sizing: border-box;
    width: 100%;
}
.hsplus-bankplus-section + .hsplus-bankplus-section {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--theme-border, #353535);
}
.hsplus-bankplus-heading {
    font-weight: 700;
    font-size: 13px;
    margin: 6px 0;
    color: var(--theme-text-primary, #e6e6e6);
}
.hsplus-bankplus-muted {
    color: var(--theme-text-secondary, #9a9a9a);
    font-size: 12px;
    line-height: 1.4;
    margin: 4px 0;
}
.hsplus-bankplus-row {
    display: flex;
    gap: 6px;
    align-items: center;
    margin: 4px 0;
}
.hsplus-bankplus-input {
    flex: 1 1 auto;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    border: 1px solid var(--theme-border, #353535);
    border-radius: 6px;
    background: var(--theme-background-mute, #1e1e1e);
    color: var(--theme-text-primary, #e6e6e6);
    font: inherit;
    outline: none;
}
.hsplus-bankplus-input:focus {
    border-color: var(--theme-accent, #f9f449);
}
.hsplus-bankplus-button {
    flex: 0 0 auto;
    padding: 6px 10px;
    border: 1px solid var(--theme-border, #353535);
    border-radius: 6px;
    background: var(--theme-background-soft, #2a2a2a);
    color: var(--theme-text-primary, #e6e6e6);
    font: inherit;
    cursor: pointer;
}
.hsplus-bankplus-button:hover {
    background: var(--theme-background-mute, #1e1e1e);
}
.hsplus-bankplus-button--small {
    padding: 2px 8px;
    font-size: 12px;
    line-height: 1.4;
}
.hsplus-bankplus-button.is-danger {
    background: var(--theme-danger, #ef4444);
    border-color: var(--theme-danger, #ef4444);
    color: #fff;
}
.hsplus-bankplus-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 6px;
}
.hsplus-bankplus-filter {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 6px;
    border: 1px solid transparent;
}
.hsplus-bankplus-filter.is-selected {
    border-color: var(--theme-accent, #f9f449);
    background: var(--theme-background-soft, #2a2a2a);
}
.hsplus-bankplus-filter__name {
    flex: 1 1 auto;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.hsplus-bankplus-filter__name:hover {
    text-decoration: underline;
}
.hsplus-bankplus-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 4px 0 8px;
}
.hsplus-bankplus-tile {
    padding: 2px;
    border-radius: 6px;
    border: 1px solid var(--theme-border, #353535);
    background: var(--theme-background-mute, #1e1e1e);
    cursor: pointer;
}
.hsplus-bankplus-tile:hover {
    border-color: var(--theme-danger, #ef4444);
}
.hsplus-bankplus-results {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 6px;
}
.hsplus-bankplus-result {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 6px;
    border-radius: 6px;
    cursor: pointer;
}
.hsplus-bankplus-result:hover {
    background: var(--theme-background-soft, #2a2a2a);
}
.hsplus-bankplus-result.is-added {
    opacity: .55;
}
.hsplus-bankplus-result__name {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.hsplus-bankplus-result__mark {
    flex: 0 0 auto;
    width: 1.2em;
    text-align: center;
    color: var(--theme-accent, #f9f449);
    font-weight: 700;
}
${ICON_CSS}
`;
