# Bank Search

A [Highspell+](https://github.com/matter418/HighSpellPlus) plugin that adds a search box to the bank window. Type part of an item's name and the bank shows only the matching items, packed together so they are easy to find.

## How to use

- Open your bank. The search box sits in the title bar, next to **Bank of HighSpell**.
- Type to filter. Matching is case-insensitive and looks for the text anywhere in the item name, so `pot` finds every potion and `ore` finds every ore.
- Clear the box (or press **Escape**) to see the whole bank again.
- Closing the bank clears the search.

Withdrawing and depositing work as normal while a search is active, and the view keeps up as the bank changes.

## Installation

The intended way to install is through the Highspell+ plugin hub. Open Highspell+, go to the plugins menu, find **Bank Search**, and enable it.

## Building from source

```bash
git clone https://github.com/matter418/BankSearch.git
cd BankSearch
yarn install
yarn build
```

The bundled output ends up at `dist/BankSearch.js`. To test it locally against a development copy of Highspell+, copy that file into the client's `src/renderer/client/plugins/` and launch the client.

## How it works (briefly)

The bank's item grid has one cell per slot. When the bank opens, the plugin inserts an input into the bank's header and, as you type, hides every cell whose slot is empty or whose item name does not contain the text. The grid wraps, so the remaining cells flow together. The plugin listens to the game's own bank-changed events to re-apply the filter after a withdrawal, deposit or reorganisation, and restores every cell when the bank closes.

## License

GPL-3.0-or-later. See [LICENSE](./LICENSE).
