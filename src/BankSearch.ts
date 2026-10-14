import { Plugin } from "@ryelite/core";

const BANK_MENU_ID = "hs-bank-menu";
const HEADER_SELECTOR = ".hs-menu-header";
const TITLE_SELECTOR = ".hs-menu-header__title";
// The bank's item table is created once with one cell per slot; the game renders the item for
// slot N into the cell whose data-slot is N. The table is flex-wrap, so hidden cells collapse
// and the matches pack together from the top-left.
const CELL_SELECTOR = ".hs-item-table--bank .hs-item-table__cell[data-slot]";
const INPUT_ID = "hsplus-bank-search";
const STYLE_ID = "hsplus-bank-search-style";

interface BankItem {
    _id: number;
}

export default class BankSearch extends Plugin {
    pluginName = "Bank Search";
    author = "matter";

    private input: HTMLInputElement | null = null;
    private query = "";
    // One stable function so the game's listener lists can remove exactly what was added.
    private readonly onBankChanged = () => this.applyFilter();
    private listeningTo: any = null;

    init(): void {
        this.log("Initialized");
    }

    start(): void {
        this.log("Started");
        this.injectStyle();
        // Enabled mid-session with the bank already open: no show hook is coming.
        this.inject();
    }

    stop(): void {
        this.log("Stopped");
        this.teardown();
    }

    // Both fire after the game's own method has run, so the bank menu is in the DOM here.
    BankUIManager_showBankMenu(): void {
        this.inject();
    }

    BankUIManager_handleCenterMenuWillBeRemoved(): void {
        this.teardown();
    }

    private get mainPlayer(): any {
        return this.gameHooks?.EntityManager?.Instance?.MainPlayer ?? null;
    }

    /** Bank contents by slot (null/undefined for an empty slot). */
    private get bankItems(): (BankItem | null | undefined)[] {
        return this.mainPlayer?._bankItems?._items ?? [];
    }

    private itemName(id: number): string {
        const def = this.gameHooks?.ItemDefinitionManager?._itemDefMap?.get(id);
        return String(def?._nameCapitalized ?? def?._name ?? "");
    }

    private bankMenu(): HTMLElement | null {
        return document.getElementById(BANK_MENU_ID);
    }

    /** Put the search box in the bank header (idempotent) and start following the contents. */
    private inject(): void {
        const menu = this.bankMenu();
        if (!menu) return;
        const header = menu.querySelector<HTMLElement>(HEADER_SELECTOR);
        if (!header) return;
        if (!this.input || !this.input.isConnected) {
            this.input?.remove();
            this.input = this.createInput();
            const title = header.querySelector(TITLE_SELECTOR);
            if (title) title.insertAdjacentElement("afterend", this.input);
            else header.prepend(this.input);
        }
        this.listen();
        this.applyFilter();
    }

    /** Remove the search box, forget the search, and show every slot again. */
    private teardown(): void {
        this.unlisten();
        this.query = "";
        this.input?.remove();
        this.input = null;
        const menu = this.bankMenu();
        if (menu) {
            menu.querySelectorAll<HTMLElement>(CELL_SELECTOR).forEach(cell => {
                cell.style.display = "";
            });
        }
    }

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
        const cells = menu.querySelectorAll<HTMLElement>(CELL_SELECTOR);
        if (!q) {
            cells.forEach(cell => {
                cell.style.display = "";
            });
            return;
        }
        const items = this.bankItems;
        cells.forEach(cell => {
            const item = items[Number(cell.getAttribute("data-slot"))];
            const show = !!item && this.itemName(item._id).toLowerCase().includes(q);
            cell.style.display = show ? "" : "none";
        });
    }

    private createInput(): HTMLInputElement {
        const input = document.createElement("input");
        input.id = INPUT_ID;
        input.type = "text";
        input.placeholder = "Search…";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.value = this.query;
        input.addEventListener("input", () => {
            this.query = input.value;
            this.applyFilter();
        });
        // The game listens for keys on the document (hotkeys, chat input); typing in here must
        // not reach it. Escape clears the search and gives the keyboard back.
        for (const type of ["keydown", "keyup", "keypress"] as const) {
            input.addEventListener(type, (e: KeyboardEvent) => {
                e.stopPropagation();
                if (type === "keydown" && e.key === "Escape") {
                    input.value = "";
                    this.query = "";
                    this.applyFilter();
                    input.blur();
                }
            });
        }
        // Keep the press from reaching the screen mask (walk-to / focus handling), but do not
        // preventDefault: the browser's default is what focuses the box and places the caret.
        for (const type of ["pointerdown", "mousedown", "click"] as const) {
            input.addEventListener(type, e => e.stopPropagation());
        }
        return input;
    }

    private injectStyle(): void {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        // The header is a space-between flex row (title … close button); margin-right:auto on the
        // box keeps it beside the title and leaves the close button on the right.
        style.textContent = `
#${INPUT_ID} {
    flex: 0 1 12rem;
    min-width: 5rem;
    height: 1.125rem;
    margin: 0 auto 0 .75rem;
    padding: 0 .375rem;
    box-sizing: border-box;
    border: none;
    border-radius: var(--hs-menu-item-border-radius, .3125rem);
    background: var(--hs-color-text-input-menu-text-input-bg, rgba(255, 255, 255, .1));
    color: var(--hs-color-menu-header-fg, #fff);
    font: inherit;
    font-size: .75rem;
    line-height: 1.125rem;
    outline: none;
}
#${INPUT_ID}::placeholder {
    color: var(--hs-color-menu-header-fg, #fff);
    opacity: .45;
}
#${INPUT_ID}:focus {
    background: var(--hs-color-menu-item-bg-hover, rgba(255, 255, 255, .2));
}
`;
        document.head.appendChild(style);
    }
}
