# click-path-audit — trigger tests

Run: `bash plugins/cklph-os/skills/authoring/run-trigger-tests.sh plugins/cklph-os cklph-os:click-path-audit plugins/cklph-os/skills/click-path-audit/trigger-tests.md`

- fire: The "New project" button does nothing when I click it, but I've unit tested every store action it calls and they all work.
- fire: After I archive an item, it disappears from the list and then pops right back a second later. Each function looks fine on its own, what's undoing it?
- fire: I just refactored our Zustand store so selecting a row also clears the panel state. Before I merge, check none of the buttons that use it got broken.
- miss: The API route for creating projects returns a 500 with a stack trace about a missing column.
- miss: The sidebar layout breaks on tablets between 768 and 1024 pixels wide.
