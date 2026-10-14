import { Plugin, PanelManager } from "@ryelite/core";
import { BankFilter, FilterData, filtersOf, isolateInput, itemName } from "./filters";
import { FilterPanel, PANEL_CSS } from "./panel";

const BANK_MENU_ID = "hs-bank-menu";
const HEADER_SELECTOR = ".hs-menu-header";
const TITLE_SELECTOR = ".hs-menu-header__title";
// The bank's item table is created once with one cell per slot; the game renders the item for
// slot N into the cell whose data-slot is N. The table is flex-wrap, so hidden cells collapse
// and the matches pack together from the top-left.
const BANK_TABLE_SELECTOR = ".hs-item-table--bank";
const CELL_SELECTOR = `${BANK_TABLE_SELECTOR} .hs-item-table__cell[data-slot]`;
const CONTROLS_ID = "hsplus-bankplus-controls";
const INPUT_ID = "hsplus-bankplus";
const SELECT_ID = "hsplus-bankplus-filter";
const ADD_ID = "hsplus-bankplus-add";
const ADDING_CLASS = "hsplus-bs-adding";
const STYLE_ID = "hsplus-bankplus-style";
// The filter editor is a page in the plugin rail (the icon strip at the side of the game),
// opened by this icon, like TCG's 🎴.
const PANEL_ICON = "🏦";
const ALL = "";

interface BankItem {
    _id: number;
}

// Mouse events the game acts on for a bank slot (withdraw, context menu, drag). All are taken
// over while add mode is on so a click only toggles the item in the filter.
const SLOT_MOUSE_EVENTS = ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "contextmenu"] as const;

export default class BankPlus extends Plugin {
    pluginName = "Bank+";
    author = "matter";

    private controls: HTMLElement | null = null;
    private input: HTMLInputElement | null = null;
    private select: HTMLSelectElement | null = null;
    private addBtn: HTMLButtonElement | null = null;
    private query = "";
    private selectedId = ALL;   // kept across bank opens; the drop-down shows it
    private addMode = false;
    // Stable functions so listener lists can remove exactly what was added.
    private readonly onBankChanged = () => this.applyFilter();
    private readonly onSlotMouse = (e: Event) => this.handleSlotMouse(e);
    private readonly onKeyCapture = (e: KeyboardEvent) => {
        if (this.addMode && e.key === "Escape") {
            e.stopPropagation();
            this.setAddMode(false);
        }
    };
    private listeningTo: any = null;
    private panel: FilterPanel | null = null;
    private panelManager: PanelManager = new PanelManager();
    private panelMounted = false;

    init(): void {
        this.log("Initialized");
    }

    start(): void {
        this.log("Started");
        this.injectStyle();
        this.mountPanel();
        // Enabled mid-session with the bank already open: no show hook is coming.
        this.inject();
    }

    stop(): void {
        this.log("Stopped");
        this.setAddMode(false);
        this.teardown();
        this.unmountPanel();
    }

    // Both fire after the game's own method has run, so the bank menu is in the DOM here.
    BankUIManager_showBankMenu(): void {
        this.inject();
    }

    BankUIManager_handleCenterMenuWillBeRemoved(): void {
        this.setAddMode(false);
        this.teardown();
    }

    // ---- data --------------------------------------------------------------------------------

    private filters(): BankFilter[] {
        return filtersOf(this.data as FilterData);
    }

    private currentFilter(): BankFilter | null {
        return this.filters().find(f => f.id === this.selectedId) ?? null;
    }

    private get mainPlayer(): any {
        return this.gameHooks?.EntityManager?.Instance?.MainPlayer ?? null;
    }

    /** Bank contents by slot (null/undefined for an empty slot). */
    private get bankItems(): (BankItem | null | undefined)[] {
        return this.mainPlayer?._bankItems?._items ?? [];
    }

    private bankMenu(): HTMLElement | null {
        return document.getElementById(BANK_MENU_ID);
    }

    // ---- bank header -------------------------------------------------------------------------

    /** Put the controls in the bank header (idempotent) and start following the contents. */
    private inject(): void {
        const menu = this.bankMenu();
        if (!menu) return;
        const header = menu.querySelector<HTMLElement>(HEADER_SELECTOR);
        if (!header) return;
        if (!this.controls || !this.controls.isConnected) {
            this.controls?.remove();
            this.controls = this.createControls();
            const title = header.querySelector(TITLE_SELECTOR);
            if (title) title.insertAdjacentElement("afterend", this.controls);
            else header.prepend(this.controls);
        }
        this.refreshSelect();
        this.listen();
        this.applyFilter();
    }

    /** Remove the controls, forget the text search, and show every slot again. */
    private teardown(): void {
        this.unlisten();
        this.query = "";
        this.controls?.remove();
        this.controls = null;
        this.input = null;
        this.select = null;
        this.addBtn = null;
        const menu = this.bankMenu();
        if (menu) {
            menu.classList.remove(ADDING_CLASS);
            menu.querySelectorAll<HTMLElement>(CELL_SELECTOR).forEach(cell => {
                cell.style.display = "";
                cell.classList.remove("hsplus-bs-member", "hsplus-bs-nonmember");
            });
        }
    }

    private createControls(): HTMLElement {
        const box = document.createElement("div");
        box.id = CONTROLS_ID;

        const input = document.createElement("input");
        input.id = INPUT_ID;
        input.type = "text";
        input.placeholder = "Search…";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.value = this.query;
        isolateInput(input);
        input.addEventListener("input", () => {
            this.query = input.value;
            this.applyFilter();
        });
        // Escape clears the search and gives the keyboard back to the game.
        input.addEventListener("keydown", e => {
            if (e.key === "Escape") {
                input.value = "";
                this.query = "";
                this.applyFilter();
                input.blur();
            }
        });
        box.appendChild(input);

        const select = document.createElement("select");
        select.id = SELECT_ID;
        select.title = "Show only the items in a filter";
        isolateInput(select);
        select.addEventListener("change", () => {
            this.selectedId = select.value;
            this.setAddMode(false);
            this.refreshAddButton();
            this.applyFilter();
        });
        box.appendChild(select);

        const add = document.createElement("button");
        add.id = ADD_ID;
        add.type = "button";
        isolateInput(add);
        add.addEventListener("click", () => this.setAddMode(!this.addMode));
        box.appendChild(add);

        this.input = input;
        this.select = select;
        this.addBtn = add;
        this.refreshAddButton();
        return box;
    }

    /** Rebuild the drop-down from the filter list, keeping the selection where it still exists. */
    private refreshSelect(): void {
        const select = this.select;
        const filters = this.filters();
        if (!filters.some(f => f.id === this.selectedId)) {
            this.selectedId = ALL;
            if (this.addMode) this.setAddMode(false);
        }
        if (!select) return;
        select.innerHTML = "";
        const all = document.createElement("option");
        all.value = ALL;
        all.textContent = "All items";
        select.appendChild(all);
        for (const f of filters) {
            const o = document.createElement("option");
            o.value = f.id;
            o.textContent = f.name;
            select.appendChild(o);
        }
        select.value = this.selectedId;
        this.refreshAddButton();
    }

    private refreshAddButton(): void {
        const b = this.addBtn;
        if (!b) return;
        const f = this.currentFilter();
        b.style.display = f ? "" : "none";
        b.textContent = this.addMode ? "Done" : "+";
        b.title = this.addMode
            ? "Finish adding items (Esc)"
            : `Add items to "${f?.name ?? ""}" by clicking them in the bank`;
        b.classList.toggle("is-active", this.addMode);
    }

    // ---- add mode ----------------------------------------------------------------------------

    /**
     * Add mode lifts the filter so every bank item shows, highlights the filter's members, and
     * turns a click on a slot into "toggle this item in the filter" (saved at once). The game's
     * own slot handling is suppressed for the duration.
     */
    private setAddMode(on: boolean): void {
        if (on && !this.currentFilter()) on = false;
        if (this.addMode === on) {
            this.refreshAddButton();
            return;
        }
        this.addMode = on;
        const menu = this.bankMenu();
        menu?.classList.toggle(ADDING_CLASS, on);
        if (on) {
            for (const type of SLOT_MOUSE_EVENTS) document.addEventListener(type, this.onSlotMouse, true);
            document.addEventListener("keydown", this.onKeyCapture, true);
        } else {
            for (const type of SLOT_MOUSE_EVENTS) document.removeEventListener(type, this.onSlotMouse, true);
            document.removeEventListener("keydown", this.onKeyCapture, true);
        }
        this.refreshAddButton();
        this.applyFilter();
    }

    private handleSlotMouse(e: Event): void {
        if (!this.addMode) return;
        const target = e.target instanceof Element ? e.target : null;
        const cell = target?.closest<HTMLElement>(CELL_SELECTOR);
        if (!cell) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.type !== "click" || (e as MouseEvent).button !== 0) return;
        const filter = this.currentFilter();
        const item = this.bankItems[Number(cell.getAttribute("data-slot"))];
        if (!filter || !item) return;
        const i = filter.items.indexOf(item._id);
        if (i >= 0) filter.items.splice(i, 1);
        else filter.items.push(item._id);
        this.applyFilter();
        this.panel?.render();
    }

    // ---- filtering ---------------------------------------------------------------------------

    /** Re-filter whenever the bank changes (withdraw/deposit, reorganise) so slots stay right. */
    private listen(): void {
        const storage = this.mainPlayer?.BankStorageItems;
        if (!storage || storage === this.listeningTo) return;
        this.unlisten();
        storage.OnInventoryChangeListener?.add(this.onBankChanged);
        storage.OnReorganizedItemsListener?.add(this.onBankChanged);
        this.listeningTo = storage;
    }

    private unlisten(): void {
        const storage = this.listeningTo;
        if (!storage) return;
        storage.OnInventoryChangeListener?.remove(this.onBankChanged);
        storage.OnReorganizedItemsListener?.remove(this.onBankChanged);
        this.listeningTo = null;
    }

    private applyFilter(): void {
        const menu = this.bankMenu();
        if (!menu) return;
        const q = this.query.trim().toLowerCase();
        const filter = this.currentFilter();
        const members = filter ? new Set(filter.items) : null;
        const cells = menu.querySelectorAll<HTMLElement>(CELL_SELECTOR);
        if (!q && !members) {
            // Nothing active: leave the bank exactly as the game draws it.
            cells.forEach(cell => {
                cell.style.display = "";
                cell.classList.remove("hsplus-bs-member", "hsplus-bs-nonmember");
            });
            return;
        }
        const items = this.bankItems;
        cells.forEach(cell => {
            const item = items[Number(cell.getAttribute("data-slot"))];
            let show = false;
            let member = false;
            if (item) {
                member = !!members && members.has(item._id);
                const inFilter = !members || this.addMode || member;
                const matches = !q || itemName(item._id).toLowerCase().includes(q);
                show = inFilter && matches;
            }
            cell.style.display = show ? "" : "none";
            cell.classList.toggle("hsplus-bs-member", this.addMode && !!item && member);
            cell.classList.toggle("hsplus-bs-nonmember", this.addMode && !!item && !member);
        });
    }

    // ---- filter editor in the plugin rail ----------------------------------------------------

    private mountPanel(): void {
        if (this.panelMounted) return;
        try {
            const [icon, content] = this.panelManager.requestMenuItem(PANEL_ICON, "Bank+") as [HTMLElement, HTMLElement];
            this.panelMounted = true;
            this.panel = new FilterPanel({
                filters: () => this.filters(),
                onFiltersChanged: () => {
                    this.refreshSelect();
                    this.applyFilter();
                },
            });
            // Core's page element is absolutely positioned with no width of its own.
            content.style.width = "100%";
            content.appendChild(this.panel.root);
            // Core's own onclick shows the page; this runs too and refreshes it (the sprite-sheet
            // variables only exist once the game's assets have loaded).
            icon.addEventListener("click", () => this.panel?.shown());
        } catch (e) {
            this.error(`Failed to register the ${PANEL_ICON} menu icon`, e);
        }
    }

    private unmountPanel(): void {
        if (!this.panelMounted) return;
        try {
            this.panelManager.removeMenuItem(PANEL_ICON);
        } catch {
            // already gone
        }
        this.panel = null;
        this.panelMounted = false;
    }

    // ---- style -------------------------------------------------------------------------------

    private injectStyle(): void {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        // The header is a space-between flex row (title … close button); margin-right:auto on the
        // controls keeps them beside the title and leaves the close button on the right.
        style.textContent = `
#${CONTROLS_ID} {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    align-items: center;
    gap: .375rem;
    margin: 0 .5rem 0 .75rem;
}
#${INPUT_ID}, #${SELECT_ID}, #${ADD_ID} {
    height: 1.125rem;
    box-sizing: border-box;
    border: none;
    border-radius: var(--hs-menu-item-border-radius, .3125rem);
    background: var(--hs-color-text-input-menu-text-input-bg, rgba(255, 255, 255, .1));
    color: var(--hs-color-menu-header-fg, #fff);
    font: inherit;
    font-size: .75rem;
    line-height: 1.125rem;
    outline: none;
    color-scheme: dark;
}
#${INPUT_ID} {
    flex: 1 1 8rem;
    min-width: 4rem;
    max-width: 12rem;
    padding: 0 .375rem;
}
#${INPUT_ID}::placeholder {
    color: var(--hs-color-menu-header-fg, #fff);
    opacity: .45;
}
#${INPUT_ID}:focus, #${SELECT_ID}:focus {
    background: var(--hs-color-menu-item-bg-hover, rgba(255, 255, 255, .2));
}
#${SELECT_ID} {
    flex: 0 1 8rem;
    min-width: 4rem;
    padding: 0 .25rem;
    cursor: pointer;
}
#${SELECT_ID} option {
    background: #1a1a1a;
    color: #fff;
}
#${ADD_ID} {
    flex: 0 0 auto;
    min-width: 1.125rem;
    padding: 0 .375rem;
    cursor: pointer;
    font-weight: 700;
}
#${ADD_ID}:hover {
    background: var(--hs-color-menu-item-bg-hover, rgba(255, 255, 255, .2));
}
#${ADD_ID}.is-active {
    background: var(--theme-accent, #f9f449);
    color: #1a1a1a;
}
/* Add mode: members outlined, everything else dimmed, slots become toggles. */
#${BANK_MENU_ID}.${ADDING_CLASS} .hs-item-table__cell.hsplus-bs-member {
    outline: 2px solid var(--theme-accent, #f9f449);
    outline-offset: -2px;
    border-radius: .25rem;
}
#${BANK_MENU_ID}.${ADDING_CLASS} .hs-item-table__cell.hsplus-bs-nonmember {
    opacity: .4;
}
#${BANK_MENU_ID}.${ADDING_CLASS} ${BANK_TABLE_SELECTOR} .hs-inventory-item {
    cursor: copy;
}
${PANEL_CSS}
`;
        document.head.appendChild(style);
    }
}
