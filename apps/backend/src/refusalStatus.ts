import type { Refusal } from './modules/kernel/index.ts'

export const REFUSAL_STATUS: Record<Refusal | 'invalid_request', number> = {
  // A reaction's emoji is part of the URL, yet a bad one is a bad request,
  // not a missing resource.
  invalid_request: 400,
  not_found: 404,
  forbidden: 403,
  archived: 409,
  invalid_section: 400,
  stale_neighbours: 409,
  section_not_empty: 409,
  invalid_assignee: 400,
  stale_version: 409,
  invalid_parent: 400,
  too_deep: 400,
  invalid_label: 400,
  invalid_dates: 400,
  invalid_reminder: 400,
  too_many_mentions: 400,
  too_many_reminders: 409,
  label_taken: 409,
  section_name_taken: 409,
  last_admin: 409,
  key_prefix_taken: 409,
  same_board: 400
}
