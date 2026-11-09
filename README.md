# Trello Task Sync

An Obsidian plugin that turns the tasks of a note into a checklist on a Trello card, and
keeps them in sync.

- Link a note to a Trello card with one property: `trello: <card URL>`.
- The note's tasks (`- [ ]` lines) appear on the card as a checklist named `📝 <note name>`.
- Adding, ticking, renaming or deleting a task in the note updates the card.
- Ticking or unticking an item **in Trello** ticks the task in the note.
- The card gets a `📝 <note name>` attachment that opens the note in Obsidian (desktop and
  phone).
- When a card is finished but the note goes on, switch the note to a new card.

Status: in development (version 0.1.0), not yet in Obsidian's community plugin list.

## Installation

Until the plugin is in the community plugin list, install it by hand. It needs Obsidian
1.11.4 or later, and to build it: git and Node.js 18 or later.

1. **Build it:**

   ```
   git clone https://github.com/antonfrancois/obsidian-trello-task-sync.git
   cd obsidian-trello-task-sync
   npm install
   npm run build
   ```

2. **Copy it into your vault** (replace `/path/to/your/vault`):

   ```
   mkdir -p /path/to/your/vault/.obsidian/plugins/trello-task-sync
   cp main.js manifest.json styles.css /path/to/your/vault/.obsidian/plugins/trello-task-sync/
   ```

3. **Enable it:** in Obsidian, **Settings → Community plugins**. Turn on community plugins if
   asked, reload the list of installed plugins, and turn on **Trello Task Sync**.

4. **Connect it to Trello:** see [Setup](#setup).

**To update:** in the cloned folder, run `git pull` and `npm run build`, copy the three files
again (step 2), then turn the plugin off and on in **Settings → Community plugins**.

If your vault is synced to other devices (for example with Obsidian Sync and its "Installed
community plugins" option), the plugin follows. Automatic sync stays off on phones unless
you turn it on.

## Linking a note

Use the command **Link to Trello card** (Ctrl+P): search any open card by name, board or
list, and select it. Or add a `trello` property to the note yourself, with the card URL (or
just its short link):

```yaml
---
trello: https://trello.com/c/AbCd1234
---
```

- **One note → one card.** Several cards in `trello:` is refused (the note is not synced
  and a notice explains why).
- **One card → any number of notes.** Each note gets its own `📝` checklist on the card.
  If two of them have the same name, the folder is added (`📝 Projects/Alpha/Notes`).

Other commands: **Unlink Trello card** (the card is left as it is: its `📝` checklist and
link stay as a record), **Open linked Trello card** (in the browser).

Renaming or moving a linked note renames its checklist and updates its `📝` link on the
card. Deleting a linked note removes its `📝` link from the card; its checklist stays as a
record.

## What is synced

| In the note | On the card |
|---|---|
| `- [ ]` task | open check item |
| `- [x]` task | complete check item |
| `- [/]` (in progress), any other symbol | open check item |
| `- [-]` (cancelled) | complete check item |
| nested tasks | flattened into the same checklist |
| tasks inside code blocks | ignored |

Direction:

- **Note → Trello** for everything: tasks added, ticked, renamed, deleted.
- **Trello → note for ticks only**: ticking or unticking an item in Trello (or on a Weekly
  focus mirror) ticks / unticks the task in the note. If the same task changed in both
  places between two syncs, the note wins.
- Items added, renamed or deleted in Trello are not brought back: the next sync restores
  the note's version.

The plugin only touches checklists and attachments whose name starts with `📝`. Your own
checklists on the same card are never changed.

## When it syncs

With **Sync automatically on this device** on (default on a computer, off on a phone):

- 3 seconds after you stop editing a linked note;
- when Obsidian starts (catches up with changes made while it was closed);
- every 5 minutes while Obsidian is open (setting **Periodic sync**, `0` turns it off).
  This is what brings in ticks made in Trello.

Commands (Ctrl+P), always available:

- **Sync current note now**
- **Sync all linked notes now**

Turn automatic sync on for **one computer only**: two devices ticking the same notes can
create conflicts in your vault sync.

## Switching a note to a new card

A note can outlive its Trello cards. To move on, run **Link to Trello card** again and pick
the new card (or replace the URL in `trello:`). At the next sync:

- the **old card is left as it is**: its `📝` checklist and its link to the note stay as a
  record, but it is no longer synced;
- **only the open tasks** go to the new card. Tasks already done stay in the note and on the
  old card. Unticking one later sends it to the new card;
- nothing is imported from the new card;
- a notice confirms the switch.

## Setup

1. Get a Trello API key and token: create a Power-Up at
   <https://trello.com/power-ups/admin> (leave the iframe URL and allowed origins empty),
   open **API key**, generate a key, then click the **Token** link next to it and allow
   read and write access.
2. In Obsidian: **Settings → Trello Task Sync**. In **Trello API key** and **Trello token**,
   create one secret each (e.g. `trello-key`, `trello-token`) and paste the values.
3. Click **Test**: it should say "Connected to Trello as …".

The key and token are kept in Obsidian's secret storage, outside the vault. The plugin's
`data.json` (inside the vault) only stores the secrets' names and the last synced state of
each linked note. Requires Obsidian 1.11.4 or later.

## Limitations

- **Same task text twice in one note.** Tasks and check items are matched by their text,
  in note order. With duplicates, a tick made in Trello may land on the wrong copy (for
  example after reordering items in Trello). The plugin shows a warning: make each task
  text unique.
- **Renaming a task** deletes its check item and creates a new one at the end of the
  checklist. Anything set on that item in Trello (due date, member) is lost.
- **Edits made in Trello other than ticks** (new items, renamed or deleted items) are
  overwritten by the note at the next sync.
- **Ticks made in Trello reach the note only while Obsidian runs** (at startup, on the
  periodic sync, or with a command).
- Only the first line of a multi-line task is used as its text.

## Privacy

The plugin talks only to the Trello API (`api.trello.com`), with your own key and token.
It sends the text of the tasks of linked notes, the note names and their paths in the
vault (for the `📝` links). Nothing else leaves your computer. No telemetry.

## Development

```
npm install
npm run dev      # rebuild on change
npm run build    # type-check + production build
npm test         # unit tests (vitest)
npm run lint
```

Each build also copies the plugin into `test-vault/.obsidian/plugins/trello-task-sync/`.
Open `test-vault/` as a vault in Obsidian and develop and test there, not in your real vault.
Optionally install [Hot Reload](https://github.com/pjeby/hot-reload) in that vault (copy its
`main.js` and `manifest.json` into `test-vault/.obsidian/plugins/hot-reload/`): it reloads the
plugin after each build. Link the sample notes to throwaway cards.

```
src/
    main.ts       plugin lifecycle, events, timers
    commands.ts   sync, link / unlink / open card commands
    ui/card-picker.ts   card search window
    settings.ts   settings tab (secrets, automatic sync, interval)
    service.ts    runs syncs one at a time, debounce, notices
    sync.ts       syncs one note with its card
    plan.ts       note vs Trello vs last synced state -> operations (pure)
    tasks.ts      task extraction and tick / untick of a line (pure)
    link.ts       reads the `trello` property (pure)
    names.ts      checklist names and obsidian:// links (pure)
    trello.ts     Trello REST client (auth header, retries)
tests/            unit tests for the pure modules and the client
```

## License

MIT. Authors: Anton François and Claude.
