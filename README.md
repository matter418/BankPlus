# Bank+

A [Highspell+](https://github.com/matter418/HighSpellPlus) plugin that adds a search box to the bank window. Type part of an item's name and the bank shows only the matching items, packed together so they are easy to find.

## How to use

- Open your bank. The search box sits in the title bar, next to **Bank of HighSpell**.
- Type to filter. Matching is case-insensitive and looks for the text anywhere in the item name, so `pot` finds every potion and `ore` finds every ore.
- Click the red **×** in the box (or press **Escape**) to clear the search and see the whole bank again.
- The plugin's settings (⚙️) let you hide the search bar or the filters if you only want one of them.
- The search text and the chosen filter stay as you left them when you close and reopen the bank.

Withdrawing and depositing work as normal while a search is active, and the view keeps up as the bank changes.

## Filters

Filters are your own named groups of items, like "Smithing" or "Potion making", chosen from the drop-down next to the search box. Pick one and the bank shows only those items; type in the search box to narrow further within it.

- **Making filters:** open the **Bank+** panel from the plugin rail at the side of the game. Name a filter and add it, then search the game's full item list and click items to add them. Click an item in the filter to remove it. Filters can be renamed and deleted there too.
- **Adding from the bank:** with a filter chosen in the drop-down, press **+** in the bank header. Every bank item shows again, the filter's items are outlined, and clicking an item toggles it in or out of the filter. Press **Done** (or Escape) to finish.

Filters are saved per character.

## Installation

The intended way to install is through the Highspell+ plugin hub. Open Highspell+, go to the plugins menu, find **Bank+**, and enable it.

## Building from source

```bash
git clone https://github.com/matter418/BankPlus.git
cd BankPlus
yarn install
yarn build
```

The bundled output ends up at `dist/BankPlus.js`. To test it locally against a development copy of Highspell+, copy that file into the client's `src/renderer/client/plugins/` and launch the client.

## How it works (briefly)

The bank's item grid has one cell per slot. When the bank opens, the plugin inserts its controls into the bank's header and hides every cell whose slot is empty, whose item is not in the chosen filter, or whose item name does not contain the search text. The grid wraps, so the remaining cells flow together. The plugin listens to the game's own bank-changed events to re-apply the view after a withdrawal, deposit or reorganisation, and restores every cell when the bank closes.

Filters are lists of item ids saved in the plugin's per-character data. The side-panel editor picks items from the game's own item definitions and draws them from its sprite sheet. Add mode (**+**) shows the whole bank with the filter's items outlined and takes over clicks on bank slots, so a click toggles the item in the filter instead of withdrawing it; the game's slot handling comes back when you press **Done** or Escape.

## License

GPL-3.0-or-later. See [LICENSE](./LICENSE).
