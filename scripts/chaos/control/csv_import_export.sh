#!/bin/bash
# CSV import and export: an editor imports rows (as the app sends them, once it has read the file: a task and its
# sub-task), then exports the board: both are in the export, the sub-task under its parent. alice's Inbox; the imported
# tasks are purged at the end.
. "$(dirname "$0")/lib.sh"

user="$CHAOS_USER"
board="$(inbox_of "$user")" || fail "$(api_err)"
rows="{\"rows\":[{\"key\":\"P1\",\"title\":\"Imported $TOKEN_RUN\",\"priority\":3,\"description\":\"from a CSV\"},{\"key\":\"P2\",\"parentKey\":\"P1\",\"title\":\"Imported sub $TOKEN_RUN\"}]}"
i="$(api "$user" POST "/boards/$board/import" "$rows")" || fail "import: $(api_err)"
# whatever happens next, what was imported goes (the export finds it)
on_exit "for id in \$(api '$user' GET '/boards/$board/export' | jq -r --arg t '$TOKEN_RUN' '.tasks[] | select(.title | contains(\$t)) | select(.parentId == null) | .id'); do api '$user' DELETE \"/boards/$board/tasks/\$id\"; api '$user' DELETE \"/boards/$board/trash/\$id\"; done"
jq -e '.imported == 2' <<<"$i" >/dev/null || fail "import: $(head -c 200 <<<"$i")"
e="$(api "$user" GET "/boards/$board/export")" || fail "export: $(api_err)"
parent="$(jq -er --arg t "Imported $TOKEN_RUN" '.tasks[] | select(.title == $t) | .id' <<<"$e")" || fail "the export misses the imported task"
jq -e --arg t "Imported sub $TOKEN_RUN" --arg p "$parent" 'any(.tasks[]; .title == $t and .parentId == $p)' <<<"$e" >/dev/null \
  || fail "the export misses the imported sub-task under its parent"
ok "2 rows imported, found in the export"
