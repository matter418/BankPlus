// Filter model, the game's item catalogue, and item-icon rendering shared by the bank header
// and the side panel.

export interface BankFilter {
    id: string;
    name: string;
    items: number[];
}

/** Everything the plugin persists (plugin.data is a per-character reactive store: a mutation
 *  anywhere inside it schedules a write, so the model is edited in place). */
export interface FilterData {
    filters?: BankFilter[];
}

export interface CatalogItem {
    id: number;
    name: string;
    lower: string;
}

export function newFilterId(): string {
    return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function filtersOf(data: FilterData | undefined): BankFilter[] {
    if (!data) return [];
    if (!Array.isArray(data.filters)) data.filters = [];
    return data.filters;
}

/** Stop keystrokes and clicks in our own inputs from reaching the game (hotkeys, walk-to). */
export function isolateInput(el: HTMLElement): void {
    for (const type of ["keydown", "keyup", "keypress"] as const) {
        el.addEventListener(type, e => e.stopPropagation());
    }
    for (const type of ["pointerdown", "mousedown", "click", "contextmenu"] as const) {
        el.addEventListener(type, e => e.stopPropagation());
    }
}

// ---- item catalogue ----------------------------------------------------------------------------

let catalog: CatalogItem[] | null = null;

function defMap(): Map<number, any> | null {
    return (document as any).highlite?.gameHooks?.ItemDefinitionManager?._itemDefMap ?? null;
}

export function itemName(id: number): string {
    const def = defMap()?.get(id);
    return String(def?._nameCapitalized ?? def?._name ?? "");
}

/** Every item the game knows about, by name (built once; the definitions never change). */
export function itemCatalog(): CatalogItem[] {
    if (catalog) return catalog;
    const map = defMap();
    if (!map) return [];
    const out: CatalogItem[] = [];
    for (const [id, def] of map) {
        const name = String(def?._nameCapitalized ?? def?._name ?? "").trim();
        if (!name || typeof id !== "number") continue;
        out.push({ id, name, lower: name.toLowerCase() });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    catalog = out;
    return out;
}

// ---- icons -------------------------------------------------------------------------------------

const SPRITE_VARS = [
    "--hs-url-inventory-items",
    "--hs-url-inventory-items-width",
    "--hs-url-inventory-items-height",
    "--hs-inventory-item-size",
];

/**
 * The item sprite sheet is exposed as CSS variables on #hs-screen-mask only. Anything drawn
 * outside the mask (the side panel) copies them onto its own root first.
 */
export function copySpriteVars(root: HTMLElement): void {
    const mask = document.getElementById("hs-screen-mask");
    if (!mask) return;
    const cs = getComputedStyle(mask);
    for (const v of SPRITE_VARS) {
        const val = cs.getPropertyValue(v);
        if (val) root.style.setProperty(v, val);
    }
}

/** Sheet offset for an item, as the game computes it (20 columns of 3rem cells, ids from 1). */
export function spritePosition(id: number): string {
    const hook = (document as any).highlite?.gameHooks?.InventoryItemSpriteManager;
    const fromGame = hook?.getCSSBackgroundPositionForItem?.(id);
    if (typeof fromGame === "string" && fromGame) return fromGame;
    const i = id - 1;
    return `${-(i % 20) * 3}rem ${-Math.trunc(i / 20) * 3}rem`;
}

/** A square icon of `size` rem for the item, drawn from the game's sheet. */
export function itemIcon(id: number, sizeRem: number): HTMLElement {
    const box = document.createElement("div");
    box.className = "hsplus-bs-icon";
    box.style.width = `${sizeRem}rem`;
    box.style.height = `${sizeRem}rem`;
    const img = document.createElement("div");
    img.className = "hsplus-bs-icon__image";
    img.style.backgroundPosition = spritePosition(id);
    img.style.transform = `scale(${sizeRem / 3})`;
    box.appendChild(img);
    return box;
}

export const ICON_CSS = `
.hsplus-bs-icon {
    position: relative;
    overflow: hidden;
    flex: 0 0 auto;
}
.hsplus-bs-icon__image {
    position: absolute;
    left: 0;
    top: 0;
    width: 3rem;
    height: 3rem;
    transform-origin: 0 0;
    background-image: var(--hs-url-inventory-items);
    background-repeat: no-repeat;
    background-size: var(--hs-url-inventory-items-width) var(--hs-url-inventory-items-height);
}
`;
